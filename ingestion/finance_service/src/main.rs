use axum::{routing::{get, post}, Router, Json, extract::State, http::StatusCode};
use dotenv::dotenv;
use std::sync::Arc;
use tokio::sync::Mutex;
use finance_service::{start_finance_services, update_all_previous_closes, types::{FinanceHealth, FinanceState}, log::init_async_logger, database::initialize_pool, database::PgPool};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<FinanceHealth>>,
    pool: Arc<PgPool>,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    // Use a unique log directory or stdout? The existing code uses ./logs.
    // In Docker, stdout is better, but let's stick to existing pattern or just ignore if it fails.
    let _ = init_async_logger("./logs");

    let pool = Arc::new(initialize_pool().await.expect("Failed to init DB"));
    let health = Arc::new(Mutex::new(FinanceHealth::new()));

    // Start the background service (WebSocket)
    let pool_clone = pool.clone();
    let health_clone = health.clone();
    tokio::spawn(async move {
        start_finance_services(pool_clone, health_clone).await;
    });

    let state = AppState {
        health,
        pool,
    };

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/trigger", post(trigger_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Finance Service listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}

async fn health_handler(State(state): State<AppState>) -> Json<FinanceHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}

async fn trigger_handler(State(state): State<AppState>) -> StatusCode {
    let finance_state = FinanceState::new(state.pool.clone());
    tokio::spawn(async move {
        update_all_previous_closes(finance_state).await;
    });
    StatusCode::ACCEPTED
}
