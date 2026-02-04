use axum::{routing::{get, post}, Router, Json, extract::State, http::StatusCode};
use dotenv::dotenv;
use std::{sync::Arc, fs};
use tokio::sync::Mutex;
use sports_service::{start_sports_service, poll_sports, SportsHealth, log::init_async_logger, database::initialize_pool, database::PgPool, database::LeagueConfigs};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<SportsHealth>>,
    pool: Arc<PgPool>,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    let _ = init_async_logger("./logs");

    let pool = Arc::new(initialize_pool().await.expect("Failed to init DB"));
    let health = Arc::new(Mutex::new(SportsHealth::new()));

    // Start the background service (Initial ingest)
    let pool_clone = pool.clone();
    let health_clone = health.clone();
    tokio::spawn(async move {
        start_sports_service(pool_clone, health_clone).await;
    });

    let state = AppState {
        health,
        pool,
    };

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/trigger", post(trigger_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Sports Service listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}

async fn health_handler(State(state): State<AppState>) -> Json<SportsHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}

#[derive(serde::Deserialize)]
struct TriggerPayload {
    data: Vec<String>,
}

async fn trigger_handler(State(state): State<AppState>, Json(payload): Json<TriggerPayload>) -> StatusCode {
    let pool = state.pool.clone();
    let health = state.health.clone();

    tokio::spawn(async move {
        let mut leagues = Vec::new();
        // Assuming configs are mapped to /app/configs in Docker
        let file_contents = fs::read_to_string("./configs/leagues.json").unwrap_or_else(|_| "[]".to_string());
        let leagues_to_ingest: Vec<LeagueConfigs> = serde_json::from_str(&file_contents).unwrap_or_default();

        if payload.data.is_empty() {
            leagues = leagues_to_ingest;
        } else {
            for league in leagues_to_ingest {
                if payload.data.contains(&league.name) {
                    leagues.push(league);
                }
            }
        }
        poll_sports(leagues, &pool, health).await;
    });
    StatusCode::ACCEPTED
}
