use std::{env, time::Duration, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
use crate::log::error;
pub use chrono::Utc;

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        .max_connections(50)
        .min_connections(6)
        .idle_timeout(Duration::from_millis(30_000));

    if let Ok(database_url) = env::var("DATABASE_URL") {
        let pool = pool_options
            .connect(&database_url)
            .await
            .context("Failed to connect to the PostgreSQL database via DATABASE_URL")?;
        return Ok(pool);
    }

    let get_env_var = |key: &str| -> Result<String> {
        env::var(key).with_context(|| format!("Missing environment variable: {}", key))
    };

    let raw_host = get_env_var("DB_HOST")?;
    let port_str = get_env_var("DB_PORT")?;
    let user = get_env_var("DB_USER")?;
    let password = get_env_var("DB_PASSWORD")?;
    let database = get_env_var("DB_DATABASE")?;

    let host = if let Some(fixed) = raw_host.strip_prefix("db.") {
        fixed
    } else {
        &raw_host
    };

    let port: u16 = port_str.parse().context("DB_PORT must be a valid u16 integer")?;

    let connect_options = PgConnectOptions::new()
        .host(host)
        .port(port)
        .username(&user)
        .password(&password)
        .database(&database);

    let pool = pool_options
        .connect_with(connect_options)
        .await
        .context("Failed to connect to the PostgreSQL database")?;

    Ok(pool)
}

#[derive(FromRow, Clone)]
pub struct DatabaseTradeData {
    pub symbol: String, 
    pub price: f64, 
    pub previous_close: f64, 
    pub price_change: f64,
    pub percentage_change: f64,
    pub direction: String,
    pub last_updated: chrono::DateTime<Utc>
}

pub async fn create_tables(pool: Arc<PgPool>) {
    let statement = "
        CREATE TABLE IF NOT EXISTS trades (
            id SERIAL PRIMARY KEY,
            symbol VARCHAR(30) UNIQUE NOT NULL,
            price DECIMAL(10,2),
            previous_close DECIMAL(10,2),
            price_change DECIMAL(10,2),
            percentage_change DECIMAL(5,2),
            direction VARCHAR(10),
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let _ = query(statement)
            .execute(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn insert_symbol(pool: Arc<PgPool>, symbol: String) {
    let statement = "
        INSERT INTO trades (symbol)
            VALUES ($1)
        ON CONFLICT (symbol) DO NOTHING
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let _ = query(statement)
            .bind(symbol)
            .execute(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn update_previous_close(pool: Arc<PgPool>, symbol: String, prev_close: f64) {
    let statement = "
        UPDATE trades
            SET previous_close = $1
            WHERE symbol = $2
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let _ = query(statement)
            .bind(prev_close)
            .bind(symbol)
            .execute(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn update_trade(pool: Arc<PgPool>, symbol: String, price: f64, price_change: f64, percentage_change: f64, direction: &str) {
    let statement = "
        UPDATE trades
            SET price = $1,
                price_change = $2,
                percentage_change = $3,
                direction = $4,
                last_updated = CURRENT_TIMESTAMP
            WHERE symbol = $5
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let _ = query(statement)
            .bind(price)
            .bind(price_change)
            .bind(percentage_change)
            .bind(direction)
            .bind(symbol)
            .execute(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn get_trades(pool: Arc<PgPool>) -> Vec<DatabaseTradeData> {
    let statement = "
        SELECT
            symbol,
            price::FLOAT8 as price,
            previous_close::FLOAT8 as previous_close,
            price_change::FLOAT8 as price_change,
            percentage_change::FLOAT8 as percentage_change,
            direction,
            last_updated
        FROM trades
        ORDER BY symbol ASC
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let result: Result<Vec<DatabaseTradeData>, sqlx::Error> = query_as(statement)
            .fetch_all(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));

        if let Ok(data) = result {
            return data;
        } else {
            return Vec::new();
        }
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
        return Vec::new();
    }
}
