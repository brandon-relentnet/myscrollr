use std::{collections::HashMap, env, fs, pin::Pin, sync::Arc, time::{Duration, Instant}};

use reqwest::{Client, header::{HeaderMap, HeaderValue}};
use serde::{Deserialize, Serialize};
use tokio::time::Sleep;
use crate::database::PgPool;

#[derive(Debug, Deserialize)]
pub(crate) struct TradeUpdate {
    #[serde(rename = "type")]
    pub message_type: String,
    pub data: Vec<TradeData>
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct TradeData {
    #[serde(rename = "s")]
    pub symbol: String,
    #[serde(rename = "p")]
    pub price: f64,
    #[serde(rename = "t")]
    pub timestamp: u64,
}

#[derive(Debug, Default)]
pub(crate) struct BatchStats {
    pub batches_processed: u64,
    pub total_updates_processed: u64,
    pub errors: u64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct QuoteResponse {
    #[serde(rename = "c")]
    pub current_price: f64,
    #[serde(rename = "d")]
    pub change: f64,
    #[serde(rename = "dp")]
    pub percent_change: f64,
    #[serde(rename = "pc")]
    pub previous_close: f64
}

pub(crate) struct WebSocketState {
    pub update_queue: HashMap<String, TradeData>,
    pub batch_timer: Option<Pin<Box<Sleep>>>,
    pub is_processing_batch: bool,
    pub stats: BatchStats,
    pub last_log_time: Option<Instant>,
    pub last_error_message: Option<String>,
}

impl WebSocketState {
    pub fn new() -> Self {
        Self {
            update_queue: HashMap::new(),
            batch_timer: None,
            is_processing_batch: false,
            stats: BatchStats::default(),
            last_log_time: None,
            last_error_message: None,
        }
    }
}

#[derive(Clone)]
pub struct FinanceState {
    pub api_key: String,
    pub subscriptions: Vec<String>,
    pub client: Arc<Client>,
    pub pool: Arc<PgPool>,
}

impl FinanceState {
    pub fn new(pool: Arc<PgPool>) -> Self {
        let file_contents = fs::read_to_string("./configs/subscriptions.json").expect("Finance configs missing...");
        let subscriptions = serde_json::from_str(&file_contents).expect("Failed parsing finance configs as Json");

        let api_key = env::var("FINNHUB_API_KEY").expect("Finnhub API key needs to be set in .env");

        let mut headers: HeaderMap = HeaderMap::new();
        headers.append("X-Finnhub-Token", HeaderValue::from_str(&api_key).expect("Failed casting api_key to HeaderValue"));

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_millis(10_000))
            .build().expect("Failed creating finance Reqwest Client");

        Self {
            api_key,
            subscriptions,
            client: Arc::new(client),
            pool,
        }
    }
}

#[derive(Serialize)]
pub struct FinanceHealth {
    pub status: String,
    pub connection_status: String,
    pub batch_number: u64,
    pub error_count: u64,
    pub last_error: Option<String>,
}

impl FinanceHealth {
    pub fn new() -> Self {
        Self {
            status: String::from("healthy"),
            connection_status: String::from("disconnected"),
            batch_number: 0,
            error_count: 0,
            last_error: None,
        }
    }

    pub(crate) fn update_health(&mut self, connection_status: String, batch_number: u64, error_count: u64, last_error: Option<String>) {
        self.connection_status = connection_status;
        self.batch_number = batch_number;
        self.error_count = error_count;
        self.last_error = last_error;
    }

    pub fn get_health(&self) -> Self {
        Self {
            status: self.status.clone(),
            connection_status: self.connection_status.clone(),
            batch_number: self.batch_number,
            error_count: self.error_count,
            last_error: self.last_error.clone(),
        }
    }
}