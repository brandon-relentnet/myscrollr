use std::{env, time::Duration, fmt::Display, sync::Arc};
use anyhow::{Context, Result};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
pub use sqlx::PgPool;
use sqlx::{FromRow, query, query_as};
use crate::log::{error, info};
pub use chrono::Utc;
use serde::Deserialize;

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

#[derive(Deserialize, Clone, Debug)]
pub struct LeagueConfigs {
    pub name: String,
    pub slug: String,
}

#[derive(Debug)]
pub struct CleanedData {
    pub league: String,
    pub external_game_id: String,
    pub link: String,
    pub home_team: Team,
    pub away_team: Team,
    pub start_time: chrono::DateTime<Utc>,
    pub short_detail: String,
    pub state: String,
}

#[derive(Debug)]
pub struct Team {
    pub name: String,
    pub logo: String,
    pub score: i32
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

pub async fn create_tables(pool: &Arc<PgPool>) {
    let statement = "
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

pub async fn clear_tables(pool: Arc<PgPool>, leagues: Vec<LeagueConfigs>) {
    let league_names: Vec<String> = leagues.iter().map(|league| league.name.clone()).collect();

    if league_names.is_empty() {
        return;
    }

    let placeholders = (1..=league_names.len())
        .map(|i| format!("${}", i))
        .collect::<Vec<String>>()
        .join(", ");

    let conn = pool.acquire().await;

    let statement = format!("DELETE FROM games WHERE league IN ({});", placeholders);

    if let Ok(mut connection) = conn {
        let mut db_query = query(&statement);

        for name in &league_names {
            db_query = db_query.bind(name);
        }

        let _ = db_query
            .execute(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));

        info!("All rows with league_type {:?} have been deleted", league_names);
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn upsert_game(pool: Arc<PgPool>, game: CleanedData) {
    let statement = "
        INSERT INTO games (
            league,
            external_game_id,
            link,
            home_team_name,
            home_team_logo,
            home_team_score,
            away_team_name,
            away_team_logo,
            away_team_score,
            start_time,
            short_detail,
            state
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (league, external_game_id)
        DO UPDATE
            SET link             = EXCLUDED.link,
                home_team_name   = EXCLUDED.home_team_name,
                home_team_logo   = EXCLUDED.home_team_logo,
                home_team_score  = EXCLUDED.home_team_score,
                away_team_name   = EXCLUDED.away_team_name,
                away_team_logo   = EXCLUDED.away_team_logo,
                away_team_score  = EXCLUDED.away_team_score,
                start_time       = EXCLUDED.start_time,
                short_detail     = EXCLUDED.short_detail,
                state            = EXCLUDED.state,
                updated_at       = CURRENT_TIMESTAMP;
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let _ = query(statement)
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
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
    }
}

pub async fn get_live_games(pool: &Arc<PgPool>) -> LiveLeagueList {
    //TODO: This should be be pre! Testing only
    let statement = "
        SELECT league, COUNT(*) as count
        FROM games
        WHERE state = 'in'
        GROUP BY league;
    ";

    let conn = pool.acquire().await;

    if let Ok(mut connection) = conn {
        let result: Result<Vec<LiveByLeague>, sqlx::Error>= query_as(statement)
            .fetch_all(&mut *connection)
            .await
            .inspect_err(|e| error!("Execution Error: {}", e));

        if let Ok(data) = result {
            return LiveLeagueList::new(data);
        } else {
            return LiveLeagueList::new(Vec::new());
        }
    } else {
        error!("Connection Error: Failed to acquire a connection from the pool");
        return LiveLeagueList::new(Vec::new());
    }
}
