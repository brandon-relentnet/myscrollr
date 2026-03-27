use std::{env, time::Duration, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
use chrono::Utc;
use serde::Deserialize;

const MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn initialize_pool() -> Result<PgPool> {
    let pool_options = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(1)
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

    let pool = pool_options.connect(&database_url).await.context("Failed to connect to the PostgreSQL database")?;

    MIGRATOR.run(&pool).await.context("Failed to run migrations")?;

    Ok(pool)
}

// =============================================================================
// League Config — loaded from configs/leagues.json and stored in tracked_leagues
// =============================================================================

#[derive(Deserialize, Clone, Debug, FromRow)]
pub struct LeagueConfig {
    pub name: String,
    pub sport_api: String,
    pub api_host: String,
    pub league_id: i32,
    pub category: String,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    #[serde(default)]
    pub season: Option<String>,
    #[serde(default)]
    pub season_format: Option<String>,
    #[serde(default)]
    pub offseason_months: Option<Vec<i32>>,
}

/// Stored league row read back from the database.
#[derive(Debug, Clone, FromRow)]
pub struct TrackedLeague {
    pub name: String,
    pub sport_api: String,
    pub api_host: String,
    pub league_id: i32,
    pub category: String,
    pub country: Option<String>,
    pub logo_url: Option<String>,
    pub season: Option<String>,
    pub season_format: Option<String>,
    pub offseason_months: Option<Vec<i32>>,
}

// =============================================================================
// Game data — normalized from all api-sports.io sport APIs
// =============================================================================

#[derive(Debug)]
pub struct CleanedData {
    pub league: String,
    pub sport: String,
    pub external_game_id: String,
    pub link: Option<String>,
    pub home_team: Team,
    pub away_team: Team,
    pub start_time: chrono::DateTime<Utc>,
    pub short_detail: Option<String>,
    pub state: String,
    pub status_short: Option<String>,
    pub status_long: Option<String>,
    pub timer: Option<String>,
    pub venue: Option<String>,
    pub season: Option<String>,
}

#[derive(Debug)]
pub struct Team {
    pub name: String,
    pub logo: Option<String>,
    pub score: Option<i32>,
}

// =============================================================================
// Tracked league queries
// =============================================================================

pub async fn get_tracked_leagues(pool: Arc<PgPool>) -> Vec<TrackedLeague> {
    let statement = "
        SELECT name, sport_api, api_host, league_id, category, country, logo_url, season, season_format, offseason_months
        FROM tracked_leagues
        WHERE is_enabled = TRUE
    ";
    let res: Result<Vec<TrackedLeague>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => data,
        Err(e) => {
            log::error!("Failed to get tracked leagues: {}", e);
            Vec::new()
        }
    }
}

pub async fn seed_tracked_leagues(pool: Arc<PgPool>, leagues: Vec<LeagueConfig>) -> Result<()> {
    let statement = "
        INSERT INTO tracked_leagues (name, sport_api, api_host, league_id, category, country, logo_url, season, season_format, offseason_months)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (name) DO UPDATE SET
            sport_api = EXCLUDED.sport_api,
            api_host = EXCLUDED.api_host,
            league_id = EXCLUDED.league_id,
            category = EXCLUDED.category,
            country = EXCLUDED.country,
            logo_url = EXCLUDED.logo_url,
            season = EXCLUDED.season,
            season_format = EXCLUDED.season_format,
            offseason_months = EXCLUDED.offseason_months
    ";
    let mut connection = pool.acquire().await?;
    for league in leagues {
        query(statement)
            .bind(&league.name)
            .bind(&league.sport_api)
            .bind(&league.api_host)
            .bind(league.league_id)
            .bind(&league.category)
            .bind(&league.country)
            .bind(&league.logo_url)
            .bind(&league.season)
            .bind(&league.season_format)
            .bind(&league.offseason_months)
            .execute(&mut *connection)
            .await?;
    }
    Ok(())
}

/// Disable any tracked_leagues rows not present in the config file.
/// This cleans up old ESPN-era leagues (e.g. "College Football") that were
/// never overwritten by the ON CONFLICT upsert (different names).
pub async fn disable_stale_leagues(pool: &Arc<PgPool>, active_names: &[String]) -> Result<()> {
    if active_names.is_empty() {
        return Ok(());
    }
    let mut connection = pool.acquire().await?;
    query("UPDATE tracked_leagues SET is_enabled = false WHERE name != ALL($1) AND is_enabled = true")
        .bind(active_names)
        .execute(&mut *connection)
        .await?;
    Ok(())
}

/// Wipe all games data. Called during the ESPN -> api-sports.io migration.
pub async fn truncate_games(pool: &Arc<PgPool>) -> Result<()> {
    let mut connection = pool.acquire().await?;
    query("TRUNCATE TABLE games").execute(&mut *connection).await?;
    log::info!("Truncated games table for data source migration");
    Ok(())
}

/// Return distinct league names that have live games from yesterday (UTC).
/// Used by poll_live to decide whether to also query yesterday's date.
pub async fn get_live_yesterday_leagues(pool: &Arc<PgPool>) -> Vec<String> {
    let today_start = Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("valid midnight timestamp");
    let today_utc = today_start.and_utc();

    let result: Result<Vec<(String,)>, sqlx::Error> = async {
        let mut conn = pool.acquire().await?;
        let rows = sqlx::query_as(
            "SELECT DISTINCT league FROM games WHERE state = 'in' AND start_time < $1"
        )
        .bind(today_utc)
        .fetch_all(&mut *conn)
        .await?;
        Ok(rows)
    }.await;

    match result {
        Ok(rows) => rows.into_iter().map(|(league,)| league).collect(),
        Err(e) => {
            log::warn!("Failed to query live-yesterday leagues, skipping yesterday poll: {}", e);
            Vec::new()
        }
    }
}

/// Delete stale games. Final/postponed/pre games older than 12h past start time,
/// and live games not seen in 4h (API stopped returning them).
pub async fn cleanup_old_games(pool: &Arc<PgPool>) -> Result<u64> {
    let mut connection = pool.acquire().await?;
    let result = query(
        "DELETE FROM games WHERE
            (state IN ('final', 'postponed', 'pre') AND start_time < NOW() - INTERVAL '12 hours')
            OR (state = 'in' AND updated_at < NOW() - INTERVAL '4 hours')"
    )
    .execute(&mut *connection)
    .await?;
    Ok(result.rows_affected())
}

// =============================================================================
// Game upsert
// =============================================================================

pub async fn upsert_game(pool: Arc<PgPool>, game: CleanedData) -> Result<()> {
    let statement = "
        INSERT INTO games (
            league, sport, external_game_id, link,
            home_team_name, home_team_logo, home_team_score,
            away_team_name, away_team_logo, away_team_score,
            start_time, short_detail, state,
            status_short, status_long, timer, venue, season
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (league, external_game_id)
        DO UPDATE SET
            sport = EXCLUDED.sport,
            link = EXCLUDED.link,
            home_team_name = EXCLUDED.home_team_name,
            home_team_logo = EXCLUDED.home_team_logo,
            home_team_score = EXCLUDED.home_team_score,
            away_team_name = EXCLUDED.away_team_name,
            away_team_logo = EXCLUDED.away_team_logo,
            away_team_score = EXCLUDED.away_team_score,
            start_time = EXCLUDED.start_time,
            short_detail = EXCLUDED.short_detail,
            state = EXCLUDED.state,
            status_short = EXCLUDED.status_short,
            status_long = EXCLUDED.status_long,
            timer = EXCLUDED.timer,
            venue = EXCLUDED.venue,
            season = EXCLUDED.season,
            updated_at = CURRENT_TIMESTAMP;
    ";
    let mut connection = pool.acquire().await?;
    query(statement)
        .bind(&game.league)
        .bind(&game.sport)
        .bind(game.external_game_id)
        .bind(game.link)
        .bind(game.home_team.name)
        .bind(game.home_team.logo)
        .bind(game.home_team.score)
        .bind(game.away_team.name)
        .bind(game.away_team.logo)
        .bind(game.away_team.score)
        .bind(game.start_time)
        .bind(game.short_detail)
        .bind(game.state)
        .bind(game.status_short)
        .bind(game.status_long)
        .bind(game.timer)
        .bind(game.venue)
        .bind(game.season)
        .execute(&mut *connection)
        .await?;
    Ok(())
}
