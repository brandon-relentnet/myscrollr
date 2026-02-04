use std::sync::Arc;
pub mod log;
pub mod database;

#[derive(Clone)]
pub struct YahooWorkerState {
    pub db_pool: Arc<database::PgPool>,
}

impl YahooWorkerState {
    pub async fn new() -> Self {
        let pool = database::initialize_pool().await.expect("Failed to initialize database pool");
        Self {
            db_pool: Arc::new(pool),
        }
    }
}
