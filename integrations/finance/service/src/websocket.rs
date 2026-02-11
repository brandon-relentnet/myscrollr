use std::{collections::HashMap, future::pending, sync::{Arc, atomic::{AtomicU64, Ordering}}, time::{Duration, Instant}};

use reqwest::Client;
use tokio::{net::TcpStream, sync::{Mutex, RwLock}, time};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt, stream::{self, SplitSink, SplitStream, iter}};
use crate::{database::{PgPool, DatabaseTradeData, Utc, get_trades, insert_symbol, update_previous_close, update_trade}, log::{error, info, warn}};

use crate::{get_quote, types::{FinanceHealth, TradeData, TradeUpdate, WebSocketState}};

const UPDATE_BATCH_SIZE: usize = 10;
const UPDATE_BATCH_TIMEOUT: u64 = 1000;
const UPDATE_BATCH_SIZE_DELAY: u64 = 500;

const LOG_THROTTLE_INTERVAL: Duration = Duration::from_secs(5);

pub(crate) async fn connect(subscriptions: Vec<String>, api_key: String, client: Arc<Client>, pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    let state = Arc::new(RwLock::new(WebSocketState::new()));
    
    // Security Note: Finnhub usually requires token as a query parameter for WebSockets.
    // Redacting this parameter from logs for security.
    let url = format!("wss://ws.finnhub.io/?token={}", api_key);

    let (ws_stream, _) = connect_async(url).await.expect("Failed to connect to WebSocket (token redacted in logs)");
    info!("WebSocket client connected to Finnhub");

    // Set connection status to connected
    {
        let mut health = health_state.lock().await;
        health.update_health(
            String::from("connected"),
            0,
            0,
            None,
        );
    }

    let (writer, reader) = ws_stream.split();

    tokio::spawn(ws_send(writer, subscriptions));
    ws_read(reader, Arc::clone(&state), client, pool, health_state.clone()).await;
}

async fn ws_send(mut writer: SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>, subscriptions: Vec<String>) {
    let messages: Vec<Message> = subscriptions.iter().map(|s| {
        let sub_msg = format!(r#"{{"type":"subscribe","symbol":"{}"}}"#, s);

        Message::Text(sub_msg.into())
    }).collect();

    let mut stream = iter(messages).map(|m| Ok(m));
    if let Err(e) = writer.send_all(&mut stream).await {
        error!("Error sending subscription message to WebSocket: {e}");
    }
}

async fn ws_read(mut reader: SplitStream<WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>, state: Arc<RwLock<WebSocketState>>, client: Arc<Client>, pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    println!("Now listening for messages...");
    
    loop {
        tokio::select! {
            biased;
            _ = async { 
                let timer_exists = state.read().await.batch_timer.is_some();
                if timer_exists {
                    state.write().await.batch_timer.as_mut().unwrap().as_mut().await
                } else {
                    pending().await
                }} => {
                // Timer fired
                let mut state_w = state.write().await;
                state_w.batch_timer = None;
                
                if !state_w.is_processing_batch {
                    info!("Timer fired, processing batch.");
                    let state_clone = Arc::clone(&state);

                    drop(state_w);
                    tokio::spawn(process_batch(state_clone, client.clone(), pool.clone(), health_state.clone()));
                } else {
                    info!("Timer fired, but a batch is already in process. Waiting.")
                }
            }

            Some(msg) = reader.next() => {
                match msg {
                    Ok(msg) => {
                        if msg.is_text() {
                            let trades_update: Result<TradeUpdate, serde_json::Error> = serde_json::from_str(&msg.to_string());
                            if let Ok(update) = trades_update {
                                if update.message_type == "trade" {
                                    handle_trade_update_batch(update.data, &state).await;
                                } else if update.message_type == "error" {
                                    let error_msg = msg.to_string();
                                    error!("Error message from websocket: {}", error_msg);
                                    state.write().await.last_error_message = Some(error_msg);
                                } else {
                                    warn!("Non-trade message: {:#?}", update)
                                }
                            } else {
                                if msg.to_string().contains("error") {
                                    let error_msg = msg.to_string();
                                    error!("Error message from websocket: {}", error_msg);
                                    state.write().await.last_error_message = Some(error_msg);
                                } else {
                                    warn!("Unexpected websocket message format: {}", msg.to_string());
                                }
                            }
                        } else if msg.is_close() {
                            error!("Server closed connection");
                            state.write().await.last_error_message = Some(String::from("Server closed connection"));
                            break;
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("Error receiving message: {}", e);
                        error!("{}", error_msg);
                        state.write().await.last_error_message = Some(error_msg);
                        break;
                    }
                }
            }

            else => {
                break;
            }
        }
    }

    info!("WebSocket read loop completed.");

    // Update health status to disconnected
    {
        let state_read = state.read().await;
        let mut health = health_state.lock().await;
        let current_batch = health.batch_number;
        health.update_health(
            String::from("disconnected"),
            current_batch,
            state_read.stats.errors,
            state_read.last_error_message.clone(),
        );
    }

    if !state.read().await.update_queue.is_empty() {
        info!("Processing final batch before exit...");
        process_batch(state, client, pool, health_state).await;
    }
}

async fn handle_trade_update_batch(trades: Vec<TradeData>, state_arc: &Arc<RwLock<WebSocketState>>) {
    let mut state = state_arc.write().await;
    let mut new_trades = 0;

    for trade in trades.iter() {
        // Validation: Ignore suspiciously long symbols
        if trade.symbol.len() > 20 {
            continue;
        }

        let ref_in_queue = state.update_queue.get(&trade.symbol);

        if let Some(trade_in_queue) = ref_in_queue {
            if trade_in_queue.timestamp >= trade.timestamp {
                continue;
            }
        }

        state.update_queue.insert(trade.symbol.clone(), trade.clone());
        new_trades += 1;
    }

    if new_trades > 0 {
        drop(state);
        schedule_batch_processing(state_arc).await;
    }
}

async fn schedule_batch_processing(state_arc: &Arc<RwLock<WebSocketState>>) {
    let mut state = state_arc.write().await;

    let delay_ms = if state.update_queue.len() >= UPDATE_BATCH_SIZE {
        UPDATE_BATCH_SIZE_DELAY
    } else {
        UPDATE_BATCH_TIMEOUT
    };
    
    let new_delay = Duration::from_millis(delay_ms);

    if let Some(timer) = &mut state.batch_timer {
        timer.as_mut().reset(time::Instant::now() + new_delay);
    } else {
        info!(
            "Scheduling batch processing in {}ms (queue: {})",
            delay_ms,
            state.update_queue.len()
        );
        state.batch_timer = Some(Box::pin(time::sleep(new_delay)));
    }
}

async fn process_batch(state_arc: Arc<RwLock<WebSocketState>>, client: Arc<Client>, pool: Arc<PgPool>, health_state: Arc<Mutex<FinanceHealth>>) {
    let (trades, batch_num) = {
        let mut state = state_arc.write().await;

        if state.is_processing_batch || state.update_queue.is_empty() {
            info!("Skipping batch processing (processing: {}, queue: {})", state.is_processing_batch, state.update_queue.len());
            return;
        }

        state.is_processing_batch = true;

        let trades: Vec<TradeData> = state.update_queue.values().cloned().collect();
        state.update_queue.clear();

        state.stats.batches_processed += 1;
        let batch_num = state.stats.batches_processed;

        info!("Processing batch #{} with {} trades", batch_num, trades.len());

        (trades, batch_num)
    };

    let processed_count = Arc::new(AtomicU64::new(0));
    let error_count = Arc::new(AtomicU64::new(0));
    let batch_result: Result<(), anyhow::Error> = async {
        let all_trades = get_trades(pool.clone()).await;
        let trades_map = Arc::new(
            all_trades.into_iter().map(|t| (t.symbol.clone(), t)).collect::<HashMap<_, _>>()
        );

        let batch_size = 5;

        stream::iter(trades)
            .for_each_concurrent(batch_size, |trade| {
                let trades_map_clone = Arc::clone(&trades_map);
                let proc_clone = Arc::clone(&processed_count);
                let err_clone = Arc::clone(&error_count);
                let client_clone = Arc::clone(&client);
                let pool_clone = Arc::clone(&pool);

                async move {
                    match process_single_trade(trade, trades_map_clone, client_clone, pool_clone).await {
                        Ok(_) => {
                            proc_clone.fetch_add(1, Ordering::SeqCst);
                        }
                        Err(e) => {
                            err_clone.fetch_add(1, Ordering::SeqCst);
                            warn!("Error processing trade: {}", e);
                        }
                    }
                }
            }
        ).await;

        Ok(())
    }.await;

    let mut state = state_arc.write().await;
    state.is_processing_batch = false;

    let processed = processed_count.load(Ordering::SeqCst);
    let errors = error_count.load(Ordering::SeqCst);

    match batch_result {
        Ok(_) => {
            state.stats.total_updates_processed += processed;
            state.stats.errors += errors;

            // Track last error if there were any errors in this batch
            if errors > 0 && state.last_error_message.is_none() {
                state.last_error_message = Some(format!("Batch #{} had {} errors processing trades", batch_num, errors));
            }

            let now = Instant::now();
            let should_log = state.last_log_time.map_or(true, |last| {
                now.duration_since(last) >= LOG_THROTTLE_INTERVAL
            });

            let mut health = health_state.lock().await;
            health.update_health(
                String::from("connected"),
                batch_num,
                state.stats.errors,
                state.last_error_message.clone(),
            );
            drop(health);

            if should_log {
                state.last_log_time = Some(now);
                info!("Batch #{} complete: {} processed, {} errors",
                    batch_num, processed, errors
                );
                info!("Total updates processed: {}", state.stats.total_updates_processed);
            }
        }
        Err(e) => {
            let error_msg = format!("Batch #{} processing error: {}", batch_num, e);
            warn!("{}", error_msg);
            state.stats.errors += 1;
            state.last_error_message = Some(error_msg);
        }
    }

    if !state.update_queue.is_empty() {
        info!("More trades queued ({}), scheduling next batch", state.update_queue.len());
        drop(state);
        schedule_batch_processing(&state_arc).await;
    }
}

async fn process_single_trade(trade: TradeData, trades_map: Arc<HashMap<String, DatabaseTradeData>>, client: Arc<Client>, pool: Arc<PgPool>) -> anyhow::Result<()> {
    let (symbol, price) = (trade.symbol, trade.price);

    let existing_record = trades_map.get(&symbol).cloned();
    let mut current_record = existing_record.unwrap_or_else(|| {
        info!("Inserting new symbol {}", symbol);

        let pool_clone = Arc::clone(&pool);
        let symbol_clone = symbol.clone();
        tokio::spawn(async move {
            insert_symbol(pool_clone, symbol_clone).await;
        });

        DatabaseTradeData {
            symbol: symbol.clone(),
            price,
            previous_close: 0.0,
            price_change: 0.0,
            percentage_change: 0.0,
            direction: String::from("up"),
            last_updated: Utc::now(),
        }
    });

    if current_record.previous_close <= 0.0 {
        info!("Fetching quote for {}", symbol);

        let mut determined_previous_close: Option<f64> = None;

        match get_quote(symbol.clone(), client).await {
            Ok(quote) => {
                if quote.previous_close > 0.0 {
                    determined_previous_close = Some(quote.previous_close);
                } else if quote.current_price > 0.0 {
                    determined_previous_close = Some(quote.current_price);
                }
            }

            Err(e) => {
                error!("Qutoe API error for {}: {}", symbol, e);
            }
        }

        if determined_previous_close.is_none() {
            warn!("Qutoe unavailable for {}, using live price fallback", symbol);
            determined_previous_close = Some(price);
        }

        if let Some(pc) = determined_previous_close {
            current_record.previous_close = pc;
            update_previous_close(Arc::clone(&pool), symbol.clone(), pc).await;
        }
    }

    if current_record.previous_close <= 0.0 {
        warn!("Skipping {}, unable to determine previous close", symbol);
        return Ok(());
    }

    let previous_close = current_record.previous_close;
    let current_price = price;

    if current_price <= 0.0 {
        warn!("Invalid prices for {}: current={}", symbol, current_price);
        return Ok(());
    }

    let price_change = current_price - previous_close;
    let percentage_change = if previous_close == 0.0 {
        0.0
    } else {
        (price_change / previous_close) * 100.0
    };

    let direction = if price_change >= 0.0 { "up" } else { "down" };

    update_trade(
        Arc::clone(&pool), 
        symbol.clone(), 
        current_price, 
        price_change, 
        percentage_change, 
        direction
    ).await;

    Ok(())
}