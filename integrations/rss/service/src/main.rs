use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use rss_service::{start_rss_service, RssHealth, log::init_async_logger, database::initialize_pool};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<RssHealth>>,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    let _ = init_async_logger("./logs");

    let mut retries = 5;
    let pool = loop {
        match initialize_pool().await {
            Ok(p) => break Arc::new(p),
            Err(e) => {
                if retries == 0 {
                    panic!("Failed to init DB after retries: {}", e);
                }
                println!("Failed to connect to DB, retrying in 2 seconds... ({} attempts left) Error: {}", retries, e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                retries -= 1;
            }
        }
    };
    let health = Arc::new(Mutex::new(RssHealth::new()));

    // Cancellation token for coordinated shutdown
    let cancel = CancellationToken::new();

    // Start the background service (Periodic ingest)
    let pool_clone = pool.clone();
    let health_clone = health.clone();
    let cancel_clone = cancel.clone();
    tokio::spawn(async move {
        println!("Starting periodic RSS ingest loop (5 minute interval)...");
        let mut cycle: u64 = 0;
        loop {
            tokio::select! {
                _ = cancel_clone.cancelled() => {
                    println!("RSS ingest loop shutting down...");
                    break;
                }
                _ = async {
                    start_rss_service(pool_clone.clone(), health_clone.clone(), cycle).await;
                    cycle += 1;
                    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                } => {}
            }
        }
    });

    let state = AppState {
        health,
    };

    let app = Router::new()
        .route("/health", get(health_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3004".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("RSS Service listening on {}", addr);

    let cancel_for_shutdown = cancel.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            println!("RSS Service received shutdown signal");
            cancel_for_shutdown.cancel();
        })
        .await
        .unwrap();

    println!("RSS Service shut down gracefully");
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

async fn health_handler(State(state): State<AppState>) -> Json<RssHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}
