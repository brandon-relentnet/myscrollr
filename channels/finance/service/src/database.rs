use std::{env, time::Duration, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
pub use chrono::Utc;

/// Build the sqlx migrator for this service.
///
/// `ignore_missing` is deliberately NOT set. A follow-up PR namespaces the
/// `_sqlx_migrations` table per service, which eliminates the cross-service
/// collision that `ignore_missing = true` used to paper over. Leaving it
/// enabled now would just hide real migration drift.
fn migrator() -> sqlx::migrate::Migrator {
    sqlx::migrate!("./migrations")
}

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        .max_connections(10)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_millis(30_000));

    let database_url = if let Ok(url) = env::var("DATABASE_URL") {
        let mut url = url.trim().trim_matches('"').trim_matches('\'').to_string();
        if url.starts_with("postgres:") && !url.starts_with("postgres://") {
            url = url.replacen("postgres:", "postgres://", 1);
        } else if url.starts_with("postgresql:") && !url.starts_with("postgresql://") {
            url = url.replacen("postgresql:", "postgresql://", 1);
        }
        url
    } else {
        let get_env_var = |key: &str| -> Result<String> {
            env::var(key).with_context(|| format!("Missing environment variable: {}", key))
        };

        let raw_host = get_env_var("DB_HOST")?;
        let port_str = get_env_var("DB_PORT")?;
        let user = get_env_var("DB_USER")?;
        let password = get_env_var("DB_PASSWORD")?;
        let database = get_env_var("DB_DATABASE")?;

        let host = if let Some(fixed) = raw_host.strip_prefix("db.") { fixed } else { &raw_host };
        let port: u16 = port_str.parse().context("DB_PORT must be a valid u16 integer")?;

        format!("postgres://{}:{}@{}:{}/{}", user, password, host, port, database)
    };

    eprintln!("[DB] Connecting to database...");
    let pool = tokio::time::timeout(
        Duration::from_secs(15),
        pool_options.connect(&database_url),
    )
    .await
    .map_err(|_| anyhow::anyhow!("Connection attempt timed out (15s)"))?
    .context("Failed to connect to the PostgreSQL database")?;
    eprintln!("[DB] Connected successfully, running migrations...");

    // Run migrations. A previous iteration of this code caught migration
    // errors, wiped `_sqlx_migrations`, and re-ran the migrator — that path
    // was data-unsafe. Failed migrations now propagate with the full sqlx
    // error chain (including `VersionMismatch(version)` and the colliding
    // file name) so an on-call engineer can diagnose without having to
    // re-run the binary under a debugger. See the long troubleshooting
    // note in AGENTS.md under "Database Migrations".
    let m = migrator();
    if let Err(err) = m.run(&pool).await {
        eprintln!("[DB] Migration failure: {err}");
        eprintln!("[DB] Underlying error chain: {err:?}");
        return Err(anyhow::Error::new(err)
            .context("Failed to run migrations. No automatic recovery — inspect _sqlx_migrations"));
    }
    eprintln!("[DB] Migrations complete");

    Ok(pool)
}

#[derive(FromRow, Clone, Debug)]
pub struct DatabaseTradeData {
    pub symbol: String, 
    pub price: f64, 
    pub previous_close: f64, 
    pub price_change: f64,
    pub percentage_change: f64,
    pub direction: String,
    pub last_updated: chrono::DateTime<Utc>
}

pub async fn get_tracked_symbols(pool: Arc<PgPool>) -> Vec<String> {
    let statement = "SELECT symbol FROM tracked_symbols WHERE is_enabled = TRUE";
    let res: Result<Vec<(String,)>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data.into_iter().map(|(s,)| s).collect(),
        Err(e) => {
            log::error!("Failed to get tracked symbols: {}", e);
            Vec::new()
        }
    }
}

pub async fn seed_tracked_symbols(pool: Arc<PgPool>, symbols: Vec<crate::types::TrackedSymbolConfig>) -> Result<()> {
    let statement = "INSERT INTO tracked_symbols (symbol, name, category, exchange) VALUES ($1, $2, $3, $4) ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, exchange = COALESCE(EXCLUDED.exchange, tracked_symbols.exchange)";
    let mut connection = pool.acquire().await?;
    for entry in symbols {
        query(statement)
            .bind(&entry.symbol)
            .bind(&entry.name)
            .bind(&entry.category)
            .bind(&entry.exchange)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

pub async fn insert_symbol(pool: Arc<PgPool>, symbol: String) -> Result<()> {
    let statement = "INSERT INTO trades (symbol, price, previous_close, price_change, percentage_change, direction) VALUES ($1, 0, 0, 0, 0, 'flat') ON CONFLICT (symbol) DO NOTHING";
    let mut connection = pool.acquire().await?;
    query(statement).bind(symbol).execute(&mut *connection).await?;
    Ok(())
}

pub async fn update_previous_close(pool: Arc<PgPool>, symbol: String, prev_close: f64) -> Result<()> {
    let statement = "UPDATE trades SET previous_close = $1 WHERE symbol = $2";
    let mut connection = pool.acquire().await?;
    query(statement).bind(prev_close).bind(symbol).execute(&mut *connection).await?;
    Ok(())
}

pub async fn update_trade(pool: Arc<PgPool>, symbol: String, price: f64, price_change: f64, percentage_change: f64, direction: &str) -> Result<()> {
    let statement = "UPDATE trades SET price = $1, price_change = $2, percentage_change = $3, direction = $4, last_updated = CURRENT_TIMESTAMP WHERE symbol = $5";
    let mut connection = pool.acquire().await?;
    query(statement).bind(price).bind(price_change).bind(percentage_change).bind(direction).bind(symbol).execute(&mut *connection).await?;
    Ok(())
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

    let res: Result<Vec<DatabaseTradeData>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data,
        Err(e) => {
            log::error!("Failed to get trades: {}", e);
            Vec::new()
        }
    }
}

/// Returns symbols where exchange is NULL (need metadata fetch).
pub async fn get_symbols_without_exchange(pool: Arc<PgPool>) -> Vec<String> {
    let statement = "SELECT symbol FROM tracked_symbols WHERE exchange IS NULL AND is_enabled = TRUE";
    let res: Result<Vec<(String,)>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data.into_iter().map(|(s,)| s).collect(),
        Err(e) => {
            log::error!("Failed to get symbols without exchange: {}", e);
            Vec::new()
        }
    }
}

/// Returns all enabled symbols (for background verification).
pub async fn get_all_enabled_symbols(pool: Arc<PgPool>) -> Vec<String> {
    let statement = "SELECT symbol FROM tracked_symbols WHERE is_enabled = TRUE";
    let res: Result<Vec<(String,)>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data.into_iter().map(|(s,)| s).collect(),
        Err(e) => {
            log::error!("Failed to get all enabled symbols: {}", e);
            Vec::new()
        }
    }
}

/// Updates exchange and link for a symbol.
pub async fn update_symbol_exchange_link(
    pool: Arc<PgPool>,
    symbol: &str,
    exchange: Option<&str>,
    link: &str,
) -> Result<()> {
    let statement = "UPDATE tracked_symbols SET exchange = $1, link = $2 WHERE symbol = $3";
    let mut connection = pool.acquire().await?;
    query(statement)
        .bind(exchange)
        .bind(link)
        .bind(symbol)
        .execute(&mut *connection)
        .await?;
    Ok(())
}
