use std::{env, time::Duration};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;
use sqlx::{query, query_as};
use chrono::{DateTime, Utc};

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_millis(30_000));

    if let Ok(mut database_url) = env::var("DATABASE_URL") {
        database_url = database_url.trim().trim_matches('"').trim_matches('\'').to_string();
        if database_url.starts_with("postgres:") && !database_url.starts_with("postgres://") {
            database_url = database_url.replacen("postgres:", "postgres://", 1);
        } else if database_url.starts_with("postgresql:") && !database_url.starts_with("postgresql://") {
            database_url = database_url.replacen("postgresql:", "postgresql://", 1);
        }
        let pool = pool_options.connect(&database_url).await.context("Failed to connect to the PostgreSQL database via DATABASE_URL (redacted)")?;
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

    let host = if let Some(fixed) = raw_host.strip_prefix("db.") { fixed } else { &raw_host };
    let port: u16 = port_str.parse().context("DB_PORT must be a valid u16 integer")?;

    let connect_options = PgConnectOptions::new().host(host).port(port).username(&user).password(&password).database(&database);
    let pool = pool_options.connect_with(connect_options).await.context("Failed to connect to the PostgreSQL database (redacted)")?;
    Ok(pool)
}

#[derive(sqlx::FromRow, Debug, Clone)]
pub struct YahooUser {
    pub guid: String,
    pub refresh_token: String,
    pub last_sync: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub async fn create_tables(pool: &PgPool) {
    let users_statement = "
        CREATE TABLE IF NOT EXISTS yahoo_users (
            guid VARCHAR(100) PRIMARY KEY,
            refresh_token TEXT NOT NULL,
            last_sync TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let leagues_statement = "
        CREATE TABLE IF NOT EXISTS yahoo_leagues (
            league_key VARCHAR(50) PRIMARY KEY,
            guid VARCHAR(100) NOT NULL REFERENCES yahoo_users(guid) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            game_code VARCHAR(10) NOT NULL,
            season VARCHAR(10) NOT NULL,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let standings_statement = "
        CREATE TABLE IF NOT EXISTS yahoo_standings (
            league_key VARCHAR(50) PRIMARY KEY REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let rosters_statement = "
        CREATE TABLE IF NOT EXISTS yahoo_rosters (
            team_key VARCHAR(50) PRIMARY KEY,
            league_key VARCHAR(50) NOT NULL REFERENCES yahoo_leagues(league_key) ON DELETE CASCADE,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let matchups_statement = "
        CREATE TABLE IF NOT EXISTS yahoo_matchups (
            team_key VARCHAR(50) PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let _ = query(users_statement).execute(pool).await;
    let _ = query(leagues_statement).execute(pool).await;
    let _ = query(standings_statement).execute(pool).await;
    let _ = query(rosters_statement).execute(pool).await;
    let _ = query(matchups_statement).execute(pool).await;
}

pub async fn upsert_yahoo_matchups(pool: &PgPool, team_key: &str, data: serde_json::Value) -> Result<()> {
    let statement = "
        INSERT INTO yahoo_matchups (team_key, data, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (team_key) DO UPDATE
        SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;
    ";
    query(statement)
        .bind(team_key)
        .bind(data)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_yahoo_league(pool: &PgPool, guid: &str, league_key: &str, name: &str, game_code: &str, season: &str, data: serde_json::Value) -> Result<()> {
    let statement = "
        INSERT INTO yahoo_leagues (league_key, guid, name, game_code, season, data, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (league_key) DO UPDATE
        SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;
    ";
    query(statement)
        .bind(league_key)
        .bind(guid)
        .bind(name)
        .bind(game_code)
        .bind(season)
        .bind(data)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_yahoo_standings(pool: &PgPool, league_key: &str, data: serde_json::Value) -> Result<()> {
    let statement = "
        INSERT INTO yahoo_standings (league_key, data, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (league_key) DO UPDATE
        SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;
    ";
    query(statement)
        .bind(league_key)
        .bind(data)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_yahoo_roster(pool: &PgPool, team_key: &str, league_key: &str, data: serde_json::Value) -> Result<()> {
    let statement = "
        INSERT INTO yahoo_rosters (team_key, league_key, data, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (team_key) DO UPDATE
        SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP;
    ";
    query(statement)
        .bind(team_key)
        .bind(league_key)
        .bind(data)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn upsert_yahoo_user(pool: &PgPool, guid: String, refresh_token: String) -> Result<()> {
    let statement = "
        INSERT INTO yahoo_users (guid, refresh_token)
        VALUES ($1, $2)
        ON CONFLICT (guid) DO UPDATE
        SET refresh_token = EXCLUDED.refresh_token;
    ";
    query(statement)
        .bind(guid)
        .bind(refresh_token)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_all_yahoo_users(pool: &PgPool) -> Result<Vec<YahooUser>> {
    let statement = "SELECT guid, refresh_token, last_sync, created_at FROM yahoo_users";
    let users = query_as::<_, YahooUser>(statement)
        .fetch_all(pool)
        .await?;
    Ok(users)
}

pub async fn update_user_sync_time(pool: &PgPool, guid: String) -> Result<()> {
    let statement = "UPDATE yahoo_users SET last_sync = CURRENT_TIMESTAMP WHERE guid = $1";
    query(statement)
        .bind(guid)
        .execute(pool)
        .await?;
    Ok(())
}