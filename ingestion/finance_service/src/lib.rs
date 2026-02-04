use std::{sync::Arc, time::Duration, fs};

use futures_util::future::join_all;
use reqwest::Client;
use tokio::{sync::Mutex, time::{self, sleep}};
use crate::log::{error, info, warn};
use crate::database::{PgPool, create_tables, insert_symbol, update_previous_close, update_trade, get_tracked_symbols, seed_tracked_symbols};

use crate::{types::{FinanceHealth, FinanceState, QuoteResponse}, websocket::connect};

pub mod types;
mod websocket;
pub mod log;
pub mod database;

pub async fn start_finance_services(pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    info!("Starting finance service...");
    if let Err(e) = create_tables(pool.clone()).await {
        error!("Failed to create database tables: {}", e);
        return;
    }

    // Seed from JSON if database is empty
    let existing = get_tracked_symbols(pool.clone()).await;
    if existing.is_empty() {
        info!("Database tracked_symbols is empty, seeding from local config...");
        if let Ok(file_contents) = fs::read_to_string("./configs/subscriptions.json") {
            if let Ok(symbols) = serde_json::from_str::<Vec<String>>(&file_contents) {
                let _ = seed_tracked_symbols(pool.clone(), symbols).await;
            }
        }
    }

    // Initialization with database-driven state
    let state = FinanceState::new(Arc::clone(&pool)).await;
    initialize_symbols(state.clone()).await;
    update_all_previous_closes(state.clone()).await;

    let should_reconnect = true;
    while should_reconnect {
        connect(state.subscriptions.clone(), state.api_key.clone(), state.client.clone(), pool.clone(), health_state.clone()).await;
        error!("Lost websocket, attempting reconnect in 5 minutes...");
        sleep(Duration::from_secs(300)).await;
    }
}

async fn initialize_symbols(state: FinanceState) {
    info!("Ensuring symbols exist in trades table...");
    for symbol in state.subscriptions {
        let _ = insert_symbol(state.pool.clone(), symbol).await;
    }
    info!("[ Finnhub ] Symbol initialization complete")
}

pub async fn update_all_previous_closes(state: FinanceState) {
    info!("Updating previous closes for {} symbols...", state.subscriptions.len());
    let batch_size = 3;
    for batch in state.subscriptions.chunks(batch_size) {
        time::sleep(Duration::from_millis(1_500)).await;
        let futures: Vec<_> = batch.iter().map(|symbol| {
            let client = state.client.clone();
            let pool = &state.pool;
            async move {
                let quote_response = get_quote(symbol.to_string(), client).await;
                match quote_response {
                    Ok(quote) => {
                        let _ = update_previous_close(pool.clone(), symbol.to_string(), quote.previous_close).await;
                        if quote.change != 0.0 {
                            let direction = if quote.change >= 0.0 { "up" } else { "down" };
                            let _ = update_trade(pool.clone(), symbol.to_string(), quote.current_price, quote.change, quote.percent_change, direction).await;
                        }
                    }
                    Err(e) => warn!("[ Finnhub ] Quote Error for {}: {e}", symbol),
                }
            }
        }).collect();
        join_all(futures).await;
    }
    info!("[ Finnhub ] Previous closes update complete.");
}

async fn get_quote(symbol: String, client: Arc<Client>) -> anyhow::Result<QuoteResponse> {
    let request = client.get(format!("https://finnhub.io/api/v1/quote?symbol={}", symbol)).build()?;
    let response = client.execute(request).await?.text().await?;
    let data: QuoteResponse = serde_json::from_str(&response)?;
    Ok(data)
}