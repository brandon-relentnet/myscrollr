use axum::{extract::State, http::StatusCode, routing::get, Json, Router};
use dotenv::dotenv;
use serde::Serialize;
use std::{sync::Arc, time::Duration};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use finance_service::{
    database::initialize_pool,
    init::{fatal, spawn_supervised, ReadinessGate, ReadinessSnapshot},
    log::init_async_logger,
    start_finance_services,
    types::FinanceHealth,
};

/// Freshness window for `/health/ready`. If the WebSocket hasn't processed
/// any batches within this window the pod is marked NotReady so Kubernetes
/// stops routing traffic. 5 minutes is generous: the WS reconnect backoff
/// is 5 minutes, so anything longer than 2x that means ingest is genuinely
/// broken.
const MAX_POLL_STALENESS: Duration = Duration::from_secs(10 * 60);

/// How often the bridge loop checks `FinanceHealth.batch_number` for
/// progress and forwards it to the readiness gate. This is cheap (one
/// mutex-read + one RwLock-write) so it runs on a tight interval.
const READINESS_BRIDGE_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<FinanceHealth>>,
    readiness: Arc<ReadinessGate>,
}

#[derive(Serialize)]
struct ReadyPayload {
    #[serde(flatten)]
    readiness: ReadinessSnapshot,
    health: FinanceHealth,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    let _ = init_async_logger("./logs");

    let health = Arc::new(Mutex::new(FinanceHealth::new()));
    let readiness = Arc::new(ReadinessGate::new(Some(MAX_POLL_STALENESS)));

    // Cancellation token for coordinated shutdown
    let cancel = CancellationToken::new();

    // Start HTTP server immediately so the k8s liveness probe always has
    // something to talk to, but the readiness probe at /health/ready will
    // return 503 until `readiness.mark_ready()` is called from the init
    // task below.
    let state = AppState {
        health: health.clone(),
        readiness: readiness.clone(),
    };
    let app = Router::new()
        .route("/health", get(health_ready_handler))
        .route("/health/live", get(health_live_handler))
        .route("/health/ready", get(health_ready_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Finance Service listening on {} (connecting to DB...)", addr);

    // Spawn background task for DB connection + service init. Uses the
    // supervised wrapper so a panic inside init (e.g. a `.expect()` on a
    // missing env var someone forgot to convert) takes the whole process
    // down instead of leaving a zombie pod behind.
    let health_bg = health.clone();
    let readiness_bg = readiness.clone();
    let cancel_bg = cancel.clone();
    spawn_supervised("finance-init", async move {
        const RETRIES: u32 = 5;
        let mut remaining = RETRIES;
        let pool = loop {
            match initialize_pool().await {
                Ok(p) => break Arc::new(p),
                Err(e) if remaining == 0 => {
                    // All retries exhausted. Mark failed and exit so
                    // Kubernetes restarts the pod.
                    fatal(
                        &readiness_bg,
                        format!("DB init failed after {RETRIES} retries: {e:#}"),
                    )
                    .await;
                }
                Err(e) => {
                    eprintln!(
                        "[DB] Connection attempt failed ({} remaining): {e:#}",
                        remaining
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    remaining -= 1;
                }
            }
        };

        // DB is up and migrations have succeeded. Readiness can flip to
        // `Ready` — but /health/ready will keep returning 503 until the
        // first batch is processed (staleness guard).
        readiness_bg.mark_ready().await;

        // Bridge loop: only forward a `record_poll()` when the websocket is
        // connected AND has made batch progress. The previous version also
        // recorded polls on "connected but stalled" which meant a silently
        // wedged websocket — connection alive, no messages flowing — still
        // looked healthy. Now if progress stops, staleness fires after
        // `MAX_POLL_STALENESS` and Kubernetes pulls the pod out of rotation.
        //
        // Weekend / off-hours freshness: TwelveData still sends heartbeat
        // events which increment the batch counter when queued trades
        // flush, so even a quiet market registers some progress within
        // the staleness window.
        let bridge_health = health_bg.clone();
        let bridge_readiness = readiness_bg.clone();
        let bridge_cancel = cancel_bg.clone();
        tokio::spawn(async move {
            let mut last_batch: u64 = 0;
            loop {
                tokio::select! {
                    _ = bridge_cancel.cancelled() => break,
                    _ = tokio::time::sleep(READINESS_BRIDGE_INTERVAL) => {
                        let snap = bridge_health.lock().await.get_health();
                        let connected = snap.connection_status == "connected";
                        let progressed = snap.batch_number > last_batch;

                        if connected && progressed {
                            bridge_readiness.record_poll().await;
                            last_batch = snap.batch_number;
                        }
                        // else: do nothing. The staleness timeout in
                        // ReadinessGate handles degradation by flipping
                        // /health/ready to 503 once MAX_POLL_STALENESS
                        // elapses without a record_poll() call.
                    }
                }
            }
        });

        // Start the background service (WebSocket). Shutdown is cooperative
        // via `cancel`.
        tokio::select! {
            _ = start_finance_services(pool, health_bg) => {},
            _ = cancel_bg.cancelled() => {
                println!("Finance background service shutting down...");
            }
        }
    });

    let cancel_for_shutdown = cancel.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            println!("Finance Service received shutdown signal");
            cancel_for_shutdown.cancel();
        })
        .await
        .unwrap();

    println!("Finance Service shut down gracefully");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

/// Liveness probe: returns 200 as long as the process is running. Lets
/// Kubernetes tell apart "process crashed" (kill+restart) from "process is
/// up but not doing work" (stop routing traffic, but don't restart — a
/// restart won't fix a migration mismatch).
async fn health_live_handler() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(serde_json::json!({"status": "alive"})))
}

/// Readiness probe: 200 only when init succeeded AND the WebSocket is
/// connected / has processed a batch within the staleness window. Returns
/// the service's own health payload in the body so humans can `curl | jq`
/// and see why.
async fn health_ready_handler(
    State(state): State<AppState>,
) -> (StatusCode, Json<ReadyPayload>) {
    let readiness = state.readiness.snapshot().await;
    let code = state.readiness.http_status().await;
    let health = state.health.lock().await.get_health();
    (code, Json(ReadyPayload { readiness, health }))
}
