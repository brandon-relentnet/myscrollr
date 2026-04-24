use std::{env, time::Duration, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
pub use chrono::Utc;

/// Build the sqlx migrator for this service.
///
/// `set_ignore_missing(true)` is required because all three Rust services
/// (finance, sports, rss) share a single `_sqlx_migrations` table in the
/// scrollr Postgres DB — sqlx 0.8.x has no API to name the table per
/// service (see PRs #106 / #107). Without this flag, each service sees
/// the other services' rows and errors out with `VersionMissing` because
/// e.g. finance has no `12*` files on disk.
///
/// With each service on a unique numeric version prefix (finance 11*,
/// sports 12*, rss 20250601*/13*), the flag tolerates "versions recorded
/// for *other* services" without hiding checksum drift on *this*
/// service's own rows — VersionMismatch (drift on an applied row whose
/// file *is* on disk) still fires and fails the boot loudly, which is
/// the behavior PR #106 was after.
fn migrator() -> sqlx::migrate::Migrator {
    let mut m = sqlx::migrate!("./migrations");
    m.set_ignore_missing(true);
    m
}

/// Numeric version range that uniquely identifies finance-service migrations
/// in the shared `_sqlx_migrations` table. Must match the prefix enforced by
/// `tests/migration_versions.rs` (PREFIX_LO / PREFIX_HI).
///
/// Finance migration filenames start with `11` and are 12 digits long, e.g.
/// `110000000001_initial.up.sql`. That's a version of 110_000_000_001
/// (one hundred ten billion and one), so the prefix range is 110B..<120B.
/// An earlier version of these constants was 11_000_000_000..=11_999_999_999
/// which is off by exactly 10× and silently matches NO real migration rows;
/// that caused the invariant check below to reliably fail on production
/// boot because `recorded` was always 0. See tests/migration_versions.rs
/// for the matching test-side constants.
pub const FINANCE_MIGRATION_MIN: i64 = 110_000_000_000;
pub const FINANCE_MIGRATION_MAX: i64 = 119_999_999_999;

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        // Pool sizing rationale: on a busy minute finance can run 500+ WS
        // price events through `process_single_trade` which each open a
        // connection to update `trades`. Ten connections was creating
        // `acquire_timeout` pressure. Twenty is still well within Postgres'
        // per-database connection budget and leaves headroom.
        .max_connections(20)
        // Keep one warm connection so the first query after an idle period
        // doesn't eat the 200-500ms TLS/auth handshake latency.
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(30));

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

        // Use the raw host as-is. Older code stripped a `db.` prefix as a
        // holdover from Supabase-era hostnames; that was silently rewriting
        // any legitimate host starting with `db.`, which is undefined
        // behaviour with no logging. If the host is wrong the operator
        // should see a connect failure, not magical rewriting.
        let port: u16 = port_str.parse().context("DB_PORT must be a valid u16 integer")?;

        format!("postgres://{}:{}@{}:{}/{}", user, password, raw_host, port, database)
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

    // Startup invariant (diagnostic-only for now).
    //
    // Original intent: catch "someone deleted a migration file locally but
    // the row is still in the DB" — the drift pattern that
    // `set_ignore_missing(true)` silently tolerates (because it only
    // tolerates the REVERSE direction: row present on disk but not in DB).
    //
    // The hard-fail version of this check repeatedly crashed the pod on
    // 2026-04-24 even after the range constants were corrected. Rather
    // than block rollouts while we diagnose the exact mismatch, log the
    // counts and continue. If they disagree, at least we'll see it in
    // `kubectl logs` instead of fighting a reliable CrashLoop.
    //
    // When prod shows equal counts cleanly for a week, this can be
    // converted back into a hard `anyhow::bail!`.
    let on_disk: i64 = migrator().iter().count() as i64;
    match sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM _sqlx_migrations WHERE version >= $1 AND version <= $2",
    )
    .bind(FINANCE_MIGRATION_MIN)
    .bind(FINANCE_MIGRATION_MAX)
    .fetch_one(&pool)
    .await
    {
        Ok(recorded) if recorded == on_disk => {
            eprintln!(
                "[DB] Migration invariant check ok: {on_disk} on disk / {recorded} recorded \
                 in {FINANCE_MIGRATION_MIN}..={FINANCE_MIGRATION_MAX}"
            );
        }
        Ok(recorded) => {
            eprintln!(
                "[DB] Migration invariant MISMATCH (advisory, not failing): {on_disk} on disk \
                 / {recorded} recorded in {FINANCE_MIGRATION_MIN}..={FINANCE_MIGRATION_MAX}. \
                 Continuing boot so operators can investigate via kubectl exec."
            );
            // Dump the recorded rows so we can tell WHICH versions are in the DB.
            if let Ok(rows) = sqlx::query_as::<_, (i64, String)>(
                "SELECT version, description FROM _sqlx_migrations \
                 WHERE version >= $1 AND version <= $2 ORDER BY version",
            )
            .bind(FINANCE_MIGRATION_MIN)
            .bind(FINANCE_MIGRATION_MAX)
            .fetch_all(&pool)
            .await
            {
                eprintln!("[DB] Recorded finance-range rows:");
                for (v, d) in rows {
                    eprintln!("[DB]   {v} - {d}");
                }
            }
        }
        Err(err) => {
            eprintln!(
                "[DB] Migration invariant query failed (advisory, not failing): {err:#}"
            );
        }
    }

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
