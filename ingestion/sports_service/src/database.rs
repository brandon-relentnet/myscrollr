use std::{env, time::Duration, fmt::Display, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
pub use chrono::Utc;
use serde::Deserialize;

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

#[derive(Deserialize, Clone, Debug, FromRow)]
pub struct LeagueConfigs {
    pub name: String,
    pub slug: String,
}

#[derive(Debug)]
pub struct CleanedData {
    pub league: String,
    pub external_game_id: String,
    pub link: Option<String>,
    pub home_team: Team,
    pub away_team: Team,
    pub start_time: chrono::DateTime<Utc>,
    pub short_detail: Option<String>,
    pub state: String,
}

#[derive(Debug)]
pub struct Team {
    pub name: String,
    pub logo: Option<String>,
    pub score: Option<i32>,
}

pub struct LiveLeagueList {
    data: Vec<LiveByLeague>,
}

impl LiveLeagueList {
    pub fn new(data: Vec<LiveByLeague>) -> Self {
        LiveLeagueList { data }
    }
}

impl Display for LiveLeagueList  {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        for item in self.data.iter() {
            write!(f, "{} ", item)?;
        }
        Ok(())
    }
}

#[derive(FromRow, Debug)]
pub struct LiveByLeague {
    league: String,
    count: i64,
}

impl Display for LiveByLeague {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "({}, {})", self.league, self.count)
    }
}

pub async fn create_tables(pool: &Arc<PgPool>) -> Result<()> {
    let games_statement = "
        CREATE TABLE IF NOT EXISTS games (
            id SERIAL PRIMARY KEY,
            league VARCHAR(50) NOT NULL,
            external_game_id VARCHAR(100) NOT NULL,
            link VARCHAR(500),
            home_team_name VARCHAR(100) NOT NULL,
            home_team_logo VARCHAR(500),
            home_team_score INTEGER,
            away_team_name VARCHAR(100) NOT NULL,
            away_team_logo VARCHAR(500),
            away_team_score INTEGER,
            start_time TIMESTAMP WITH TIME ZONE NOT NULL,
            short_detail VARCHAR(200),
            state VARCHAR(50) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(league, external_game_id)
        );
    ";

    let config_statement = "
        CREATE TABLE IF NOT EXISTS tracked_leagues (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            slug VARCHAR(100) NOT NULL,
            is_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    ";

    let mut connection = pool.acquire().await?;
    query(games_statement).execute(&mut *connection).await?;
    query(config_statement).execute(&mut *connection).await?;
    Ok(())
}

pub async fn get_tracked_leagues(pool: Arc<PgPool>) -> Vec<LeagueConfigs> {
    let statement = "SELECT name, slug FROM tracked_leagues WHERE is_enabled = TRUE";
    let res: Result<Vec<LeagueConfigs>, sqlx::Error> = async {
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

pub async fn seed_tracked_leagues(pool: Arc<PgPool>, leagues: Vec<LeagueConfigs>) -> Result<()> {
    let statement = "INSERT INTO tracked_leagues (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING";
    let mut connection = pool.acquire().await?;
    for league in leagues {
        query(statement).bind(league.name).bind(league.slug).execute(&mut *connection).await?;
    }
    Ok(())
}

pub async fn upsert_game(pool: Arc<PgPool>, game: CleanedData) -> Result<()> {
    let statement = "
        INSERT INTO games (league, external_game_id, link, home_team_name, home_team_logo, home_team_score, away_team_name, away_team_logo, away_team_score, start_time, short_detail, state)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (league, external_game_id)
        DO UPDATE SET link = EXCLUDED.link, home_team_name = EXCLUDED.home_team_name, home_team_logo = EXCLUDED.home_team_logo, home_team_score = EXCLUDED.home_team_score, away_team_name = EXCLUDED.away_team_name, away_team_logo = EXCLUDED.away_team_logo, away_team_score = EXCLUDED.away_team_score, start_time = EXCLUDED.start_time, short_detail = EXCLUDED.short_detail, state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP;
    ";
    let mut connection = pool.acquire().await?;
    query(statement)
        .bind(&game.league)
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
        .execute(&mut *connection)
        .await?;
    Ok(())
}

pub async fn get_live_games(pool: &Arc<PgPool>) -> LiveLeagueList {
    let statement = "SELECT league, COUNT(*) as count FROM games WHERE state = 'in' GROUP BY league";
    let res: Result<Vec<LiveByLeague>, sqlx::Error> = async {
        let mut connection = pool.acquire().await?;
        let data = query_as(statement).fetch_all(&mut *connection).await?;
        Ok(data)
    }.await;

    match res {
        Ok(data) => LiveLeagueList::new(data),
        Err(e) => {
            log::error!("Failed to get live games: {}", e);
            LiveLeagueList::new(Vec::new())
        }
    }
}
