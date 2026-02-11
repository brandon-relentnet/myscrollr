use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use tokio_util::sync::CancellationToken;
use yahoo_service::{log::init_async_logger, YahooWorkerState, start_active_sync};

#[tokio::main]
async fn main() {
    dotenv().ok();

    // Initialize logging
    let _ = init_async_logger("./logs");
    println!("Yahoo Worker Service starting...");

    let state = YahooWorkerState::new().await;

    // Cancellation token for coordinated shutdown
    let cancel = CancellationToken::new();

    // Start a tiny health server
    let health_state = state.clone();
    let app = Router::new()
        .route("/health", get(health_handler))
        .with_state(health_state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3003".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Yahoo Health Server listening on {}", addr);

    let cancel_for_health = cancel.clone();
    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                cancel_for_health.cancelled().await;
            })
            .await
            .unwrap();
    });

    // Start the active sync loop — runs until shutdown signal
    let sync_state = state.clone();
    let cancel_clone = cancel.clone();
    let sync_handle = tokio::spawn(async move {
        tokio::select! {
            _ = start_active_sync(sync_state) => {},
            _ = cancel_clone.cancelled() => {
                println!("Yahoo active sync shutting down...");
            }
        }
    });

    // Wait for shutdown signal
    shutdown_signal().await;
    println!("Yahoo Worker Service received shutdown signal");
    cancel.cancel();

    // Wait for sync task to finish
    let _ = sync_handle.await;
    println!("Yahoo Worker Service shut down gracefully");
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

async fn health_handler(State(state): State<YahooWorkerState>) -> Json<yahoo_fantasy::types::YahooHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}
