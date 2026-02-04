use std::{sync::Arc, time::Duration};

use futures_util::future::join_all;
use reqwest::Client;
use tokio::{sync::Mutex, time::{self, sleep}};
use crate::log::{debug, error, info, warn};
use crate::database::{PgPool, create_tables, insert_symbol, update_previous_close, update_trade};

use crate::{types::{FinanceHealth, FinanceState, QuoteResponse}, websocket::connect};

pub mod types;
mod websocket;
pub mod log;
pub mod database;

/// Broadly starts all finance related services and initialization.
pub async fn start_finance_services(pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    info!("Starting finance service...");
    // Initialization
    let state = FinanceState::new(Arc::clone(&pool));
    info!("Creating finance tables...");
    create_tables(pool.clone()).await;
    initialize_symbols(state.clone()).await;
    update_all_previous_closes(state.clone()).await;

    let should_reconnect = true;

    while should_reconnect {
        connect(state.subscriptions.clone(), state.api_key.clone(), state.client.clone(), pool.clone(), health_state.clone()).await;

        error!("Lost websocket, attempting reconnect in 5 minutes...");
        sleep(Duration::from_secs(300)).await;
    }
}

/// Initializes a pre-selected set of Finnhub symbols
/// within the database.
async fn initialize_symbols(state: FinanceState) {
    info!("Initializing symbols in database...");

    let batch_size = 5;
    for batch in state.subscriptions.chunks(batch_size) {
        time::sleep(Duration::from_millis(100)).await;

        let futures: Vec<_> = batch.iter().map(|symbol| {
            let symbol_clone = symbol.to_string();
            let pool = state.pool.clone();

            async move {
                insert_symbol(pool, symbol_clone.clone()).await;
            }
        }).collect();
        
        join_all(futures).await;
    }

    info!("[ Finnhub ] Symbol initialization complete")
}

/// Intended to be run once daily via a HTTP request from Supabase.
/// This will also be run once at startup, to populate the database
/// with a as up-to-date information as is possible.
pub async fn update_all_previous_closes(state: FinanceState) {
    info!("Updating previous closes...");

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

                        update_previous_close(pool.clone(), symbol.to_string(), quote.previous_close).await;

                        debug!("{symbol} previous close update: {}", quote.previous_close);

                        if quote.change > 0.0 || quote.change < 0.0 {
                            let direction = if quote.change >= 0.0 {
                                "up"
                            } else {
                                "down"
                            };
                            update_trade(pool.clone(), symbol.to_string(), quote.current_price, quote.change, quote.percent_change, direction).await;
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

/// Primary way through which the Finnhub HTTP API is accessed.
async fn get_quote(symbol: String, client: Arc<Client>) -> anyhow::Result<QuoteResponse> {
        let request = client.get(format!("https://finnhub.io/api/v1/quote?symbol={}", symbol)).build()?;

        let response = client.execute(request).await?.text().await?;
        let data: QuoteResponse = serde_json::from_str(&response)?;

        Ok(data)
}