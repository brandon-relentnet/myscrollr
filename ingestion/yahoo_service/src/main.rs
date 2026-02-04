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

    println!("Yahoo Worker is now running in background mode.");

    loop {
        // This is where future background tasks (like refreshing league data for active users) will go.
        // For now, we just keep the process alive to match the worker pattern.
        
        sleep(Duration::from_secs(3600)).await;
    }
}
