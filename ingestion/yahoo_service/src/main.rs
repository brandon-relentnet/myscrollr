use axum::{routing::get, Router, Json};
use dotenv::dotenv;
use std::time::Duration;
use tokio::time::sleep;
use yahoo_service::{log::init_async_logger, YahooWorkerState};

#[tokio::main]
async fn main() {
    dotenv().ok();
    
    // Initialize logging
    let _ = init_async_logger("./logs");
    println!("Yahoo Worker Service starting...");

    let _state = YahooWorkerState::new().await;

    // Start a tiny health server
    let app = Router::new()
        .route("/health", get(|| async { 
            Json(serde_json::json!({ "status": "healthy", "service": "yahoo_worker" })) 
        }));

    let port = std::env::var("PORT").unwrap_or_else(|_| "3003".to_string());
    let addr = format!("0.0.0.0:{}", port);
    
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
        println!("Yahoo Health Server listening on {}", addr);
        axum::serve(listener, app).await.unwrap();
    });

    println!("Yahoo Worker is now running in background mode.");

    loop {
        // Future background tasks go here
        sleep(Duration::from_secs(3600)).await;
    }
}