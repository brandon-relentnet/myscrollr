use std::{env, time::Duration, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
use serde::Deserialize;
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
        let pool = pool_options.connect(&database_url).await.context("Failed to connect to the PostgreSQL database via DATABASE_URL")?;
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
    let pool = pool_options.connect_with(connect_options).await.context("Failed to connect to the PostgreSQL database")?;
    Ok(pool)
}

// ── Config types ─────────────────────────────────────────────────

#[derive(Deserialize, Clone, Debug)]
pub struct FeedConfig {
    pub name: String,
    pub url: String,
    pub category: String,
}

#[derive(Clone, Debug, FromRow)]
pub struct TrackedFeed {
    pub url: String,
    pub name: String,
    pub category: String,
    pub is_default: bool,
    pub is_enabled: bool,
}

// ── Parsed article ready for DB insertion ────────────────────────

pub struct ParsedArticle {
    pub feed_url: String,
    pub guid: String,
    pub title: String,
    pub link: String,
    pub description: String,
    pub source_name: String,
    pub published_at: Option<DateTime<Utc>>,
}

// ── Table creation ───────────────────────────────────────────────

pub async fn create_tables(pool: &Arc<PgPool>) -> Result<()> {
    let tracked_feeds_statement = "
        CREATE TABLE IF NOT EXISTS tracked_feeds (
            url             TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            category        TEXT NOT NULL DEFAULT 'General',
            is_default      BOOLEAN NOT NULL DEFAULT false,
            is_enabled      BOOLEAN NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let rss_items_statement = "
        CREATE TABLE IF NOT EXISTS rss_items (
            id              SERIAL PRIMARY KEY,
            feed_url        TEXT NOT NULL REFERENCES tracked_feeds(url) ON DELETE CASCADE,
            guid            TEXT NOT NULL,
            title           TEXT NOT NULL,
            link            TEXT NOT NULL DEFAULT '',
            description     TEXT NOT NULL DEFAULT '',
            source_name     TEXT NOT NULL DEFAULT '',
            published_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(feed_url, guid)
        );
    ";

    let mut connection = pool.acquire().await?;
    query(tracked_feeds_statement).execute(&mut *connection).await?;
    query(rss_items_statement).execute(&mut *connection).await?;
    Ok(())
}

// ── Seed default feeds from config file ──────────────────────────

pub async fn seed_tracked_feeds(pool: Arc<PgPool>, feeds: Vec<FeedConfig>) -> Result<()> {
    let statement = "
        INSERT INTO tracked_feeds (url, name, category, is_default, is_enabled)
        VALUES ($1, $2, $3, true, true)
        ON CONFLICT (url) DO NOTHING
    ";
    let mut connection = pool.acquire().await?;
    for feed in feeds {
        query(statement)
            .bind(&feed.url)
            .bind(&feed.name)
            .bind(&feed.category)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

// ── Get all enabled feeds ────────────────────────────────────────

pub async fn get_tracked_feeds(pool: Arc<PgPool>) -> Vec<TrackedFeed> {
    let statement = "SELECT url, name, category, is_default, is_enabled FROM tracked_feeds WHERE is_enabled = TRUE";
    let res: Result<Vec<TrackedFeed>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data,
        Err(e) => {
            log::error!("Failed to get tracked feeds: {}", e);
            Vec::new()
        }
    }
}

// ── Upsert a single RSS item ────────────────────────────────────

pub async fn upsert_rss_item(pool: Arc<PgPool>, article: ParsedArticle) -> Result<()> {
    let statement = "
        INSERT INTO rss_items (feed_url, guid, title, link, description, source_name, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (feed_url, guid)
        DO UPDATE SET
            title = EXCLUDED.title,
            link = EXCLUDED.link,
            description = EXCLUDED.description,
            source_name = EXCLUDED.source_name,
            published_at = EXCLUDED.published_at,
            updated_at = CURRENT_TIMESTAMP;
    ";
    let mut connection = pool.acquire().await?;
    query(statement)
        .bind(&article.feed_url)
        .bind(&article.guid)
        .bind(&article.title)
        .bind(&article.link)
        .bind(&article.description)
        .bind(&article.source_name)
        .bind(article.published_at)
        .execute(&mut *connection)
        .await?;
    Ok(())
}

// ── Cleanup old articles ─────────────────────────────────────────

pub async fn cleanup_old_articles(pool: &Arc<PgPool>) -> Result<u64> {
    let statement = "DELETE FROM rss_items WHERE published_at < now() - interval '7 days'";
    let mut connection = pool.acquire().await?;
    let result = query(statement).execute(&mut *connection).await?;
    Ok(result.rows_affected())
}
