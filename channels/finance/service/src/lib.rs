use std::{sync::Arc, time::Duration, fs};

use futures_util::future::join_all;
use reqwest::Client;
use tokio::{sync::Mutex, time::{self, sleep}};
use crate::log::{error, info, warn};
use crate::database::{PgPool, insert_symbol, update_previous_close, update_trade, get_tracked_symbols, seed_tracked_symbols};

use crate::{types::{FinanceHealth, FinanceState, QuoteResponse, TrackedSymbolConfig}, websocket::connect};

pub mod types;
mod websocket;
pub mod log;
pub mod database;

pub async fn start_finance_services(pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    info!("Starting finance service...");

    // Seed from JSON if database is empty, or update name/category for existing symbols
    let existing = get_tracked_symbols(pool.clone()).await;
    if let Ok(file_contents) = fs::read_to_string("./configs/subscriptions.json") {
        if let Ok(entries) = serde_json::from_str::<Vec<TrackedSymbolConfig>>(&file_contents) {
            if existing.is_empty() {
                info!("Database tracked_symbols is empty, seeding from local config...");
            } else {
                info!("Syncing name/category metadata for tracked symbols...");
            }
            let _ = seed_tracked_symbols(pool.clone(), entries).await;
        }
    }

    // Initialization with database-driven state
    let state = FinanceState::new(Arc::clone(&pool)).await;
    initialize_symbols(state.clone()).await;
    update_all_previous_closes(state.clone()).await;

    loop {
        match connect(state.subscriptions.clone(), state.api_key.clone(), state.client.clone(), pool.clone(), health_state.clone()).await {
            Ok(()) => {
                error!("WebSocket disconnected, attempting reconnect in 5 minutes...");
            }
            Err(e) => {
                error!("WebSocket connection failed: {}, retrying in 5 minutes...", e);
            }
        }
        sleep(Duration::from_secs(300)).await;
    }
}

async fn initialize_symbols(state: FinanceState) {
    info!("Ensuring symbols exist in trades table...");
    for symbol in state.subscriptions {
        let _ = insert_symbol(state.pool.clone(), symbol).await;
    }
    info!("[ TwelveData ] Symbol initialization complete")
}

pub async fn update_all_previous_closes(state: FinanceState) {
    info!("Updating previous closes for {} symbols...", state.subscriptions.len());

    // TwelveData Pro tier: 610 API credits/min, 500 WS symbols.
    // Batch 8 at a time with 1s delay to stay within limits.
    let batch_size = 8;
    for batch in state.subscriptions.chunks(batch_size) {
        time::sleep(Duration::from_millis(1_000)).await;
        let futures: Vec<_> = batch.iter().map(|symbol| {
            let client = state.client.clone();
            let api_key = state.api_key.clone();
            let pool = &state.pool;
            async move {
                let quote_response = get_quote(symbol.to_string(), client, &api_key).await;
                match quote_response {
                    Ok(quote) => {
                        let pc = quote.previous_close_f64();
                        if pc > 0.0 {
                            let _ = update_previous_close(pool.clone(), symbol.to_string(), pc).await;
                        }

                        let close = quote.close_f64();
                        if close > 0.0 {
                            let change = quote.change_f64();
                            let pct = quote.percent_change_f64();
                            let direction = if change >= 0.0 { "up" } else { "down" };
                            let _ = update_trade(
                                pool.clone(),
                                symbol.to_string(),
                                close,
                                change,
                                pct,
                                direction,
                            ).await;
                        } else {
                            warn!("[ TwelveData ] Skipping price update for {}: close is 0", symbol);
                        }
                    }
                    Err(e) => warn!("[ TwelveData ] Quote Error for {}: {e}", symbol),
                }
            }
        }).collect();
        join_all(futures).await;
    }
    info!("[ TwelveData ] Previous closes update complete.");
}

pub(crate) async fn get_quote(symbol: String, client: Arc<Client>, api_key: &str) -> anyhow::Result<QuoteResponse> {
    let rest_base = std::env::var("TWELVEDATA_REST_URL")
        .unwrap_or_else(|_| "https://api.twelvedata.com".to_string());
    let url = format!(
        "{}/quote?symbol={}&apikey={}",
        rest_base, symbol, api_key
    );
    let response = client.get(&url).send().await?.text().await?;
    let data: QuoteResponse = serde_json::from_str(&response)?;
    if data.is_error() {
        let msg = data.message.as_deref().unwrap_or("unknown error");
        let code = data.code.unwrap_or(0);
        anyhow::bail!("TwelveData API error {code}: {msg}");
    }
    Ok(data)
}
