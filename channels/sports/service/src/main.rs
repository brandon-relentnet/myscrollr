use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use sports_service::{
    init_sports_service, poll_live, poll_schedule,
    SportsHealth, RateLimiter,
    log::init_async_logger, database::initialize_pool,
};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<SportsHealth>>,
}

/// Interval for the schedule poll (upcoming games + cleanup).
const SCHEDULE_POLL_SECS: u64 = 30 * 60; // 30 minutes

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
    let health = Arc::new(Mutex::new(SportsHealth::new()));

    // Cancellation token for coordinated shutdown
    let cancel = CancellationToken::new();

    // ── Initialize service (tables, migrations, seeding) ─────────────
    let (client, leagues) = match init_sports_service(&pool).await {
        Some(result) => result,
        None => {
            println!("Sports service initialization failed. Serving health endpoint only.");
            // Still start the HTTP server so health checks work
            let state = AppState { health };
            let app = Router::new()
                .route("/health", get(health_handler))
                .with_state(state);
            let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
            let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
            println!("Sports Service listening on 0.0.0.0:{}", port);
            axum::serve(listener, app).await.unwrap();
            return;
        }
    };

    // Pro plan: 7,500 requests/day per sport API. Each sport host
    // (basketball, football, hockey, etc.) has its own independent budget.
    let sports: Vec<String> = leagues
        .iter()
        .map(|l| l.sport_api.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let rate_limiter = Arc::new(RateLimiter::new(&sports, 7500));

    let client = Arc::new(client);
    let leagues = Arc::new(leagues);

    // ── Fast poll: live scores (today only, 30s live / 3min idle) ─────
    let pool_live = pool.clone();
    let client_live = client.clone();
    let leagues_live = leagues.clone();
    let health_live = health.clone();
    let rl_live = rate_limiter.clone();
    let cancel_live = cancel.clone();
    tokio::spawn(async move {
        println!("Starting live poll loop (adaptive intervals)...");
        loop {
            tokio::select! {
                _ = cancel_live.cancelled() => {
                    println!("Live poll loop shutting down...");
                    break;
                }
                _ = async {
                    poll_live(&pool_live, &client_live, &leagues_live, &health_live, &rl_live).await;

                    // Adaptive interval: poll more frequently when there are live games
                    let interval = {
                        let h = health_live.lock().await;
                        if h.leagues_live > 0 {
                            30  // 30s when live games are happening
                        } else {
                            60  // 1 min when no live games (was 3 min)
                        }
                    };

                    tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                } => {}
            }
        }
    });

    // ── Slow poll: schedule + cleanup (today + 7 days, every 30 min) ──
    let pool_sched = pool.clone();
    let client_sched = client.clone();
    let leagues_sched = leagues.clone();
    let rl_sched = rate_limiter.clone();
    let cancel_sched = cancel.clone();
    tokio::spawn(async move {
        println!("Starting schedule poll loop (every {} min)...", SCHEDULE_POLL_SECS / 60);
        // Run immediately on startup to populate the schedule
        poll_schedule(&pool_sched, &client_sched, &leagues_sched, &rl_sched).await;
        loop {
            tokio::select! {
                _ = cancel_sched.cancelled() => {
                    println!("Schedule poll loop shutting down...");
                    break;
                }
                _ = async {
                    tokio::time::sleep(std::time::Duration::from_secs(SCHEDULE_POLL_SECS)).await;
                    poll_schedule(&pool_sched, &client_sched, &leagues_sched, &rl_sched).await;
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

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Sports Service listening on {}", addr);

    let cancel_for_shutdown = cancel.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            println!("Sports Service received shutdown signal");
            cancel_for_shutdown.cancel();
        })
        .await
        .unwrap();

    println!("Sports Service shut down gracefully");
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

async fn health_handler(State(state): State<AppState>) -> Json<SportsHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}
