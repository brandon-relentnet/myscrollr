use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use yahoo_service::{log::init_async_logger, YahooWorkerState, start_active_sync};

#[tokio::main]
async fn main() {
    dotenv().ok();
    
    // Initialize logging
    let _ = init_async_logger("./logs");
    println!("Yahoo Worker Service starting...");

    let state = YahooWorkerState::new().await;

    // Start a tiny health server
    let health_state = state.clone();
    let app = Router::new()
        .route("/health", get(health_handler))
        .with_state(health_state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3003".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
        println!("Yahoo Health Server listening on {}", addr);
        axum::serve(listener, app).await.unwrap();
    });

    // Start the active sync loop
    start_active_sync(state).await;
}

async fn health_handler(State(state): State<YahooWorkerState>) -> Json<yahoo_fantasy::types::YahooHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}
