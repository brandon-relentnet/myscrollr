use std::{env, time::Duration};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_millis(30_000));

    if let Ok(mut database_url) = env::var("DATABASE_URL") {
        // Clean up the URL: trim whitespace and remove accidental quotes
        database_url = database_url.trim().trim_matches('"').trim_matches('\'').to_string();

        // Fix missing // after protocol
        if database_url.starts_with("postgres:") && !database_url.starts_with("postgres://") {
            database_url = database_url.replacen("postgres:", "postgres://", 1);
        } else if database_url.starts_with("postgresql:") && !database_url.starts_with("postgresql://") {
            database_url = database_url.replacen("postgresql:", "postgresql://", 1);
        }

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
