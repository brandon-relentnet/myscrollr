use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use std::sync::Arc;
use tokio::sync::Mutex;
use finance_service::{start_finance_services, types::FinanceHealth, log::init_async_logger, database::initialize_pool, database::PgPool};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<FinanceHealth>>,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    // Use a unique log directory or stdout? The existing code uses ./logs.
    // In Docker, stdout is better, but let's stick to existing pattern or just ignore if it fails.
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
    let health = Arc::new(Mutex::new(FinanceHealth::new()));

    // Start the background service (WebSocket)
    let pool_clone = pool.clone();
    let health_clone = health.clone();
    tokio::spawn(async move {
        start_finance_services(pool_clone, health_clone).await;
    });

    let state = AppState {
        health,
    };

    let app = Router::new()
        .route("/health", get(health_handler))
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
