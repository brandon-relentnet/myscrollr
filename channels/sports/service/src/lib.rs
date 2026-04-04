use std::{env, fs, sync::Arc};
use reqwest::{Client, header};
use tokio::sync::Mutex;
use chrono::{DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, Utc};
use crate::log::{error, info, warn};
use crate::database::{
    PgPool, truncate_games,
    get_tracked_leagues, seed_tracked_leagues, disable_stale_leagues,
    cleanup_old_games, get_live_yesterday_leagues,
    LeagueConfig, TrackedLeague, upsert_game, CleanedData, Team,
    StandingData, upsert_standing, TeamData, upsert_team,
};
pub use crate::types::{SportsHealth, RateLimiter};

pub mod log;
pub mod database;
pub mod types;

/// Number of days ahead to poll in the schedule task.
/// Set to 1 to capture midnight crossover games (games that are evening local
/// time but fall on the next UTC date).
const SCHEDULE_DAYS_AHEAD: i64 = 1;

/// Delay between league requests on startup burst to avoid rate limits.
/// 200ms spacing between requests spreads ~60 requests across ~12 seconds.
const STARTUP_REQUEST_DELAY_MS: u64 = 200;

// =============================================================================
// Service initialization (runs once on startup)
// =============================================================================

/// Initialize the sports service: create tables, run migrations, seed leagues,
/// and handle any data source migration. Returns the API client and tracked
/// leagues, or None if initialization failed.
pub async fn init_sports_service(pool: &Arc<PgPool>) -> Option<(Client, Vec<TrackedLeague>)> {
    info!("Starting sports service...");

    // Seed from JSON config — always upsert to pick up new leagues
    if let Ok(file_contents) = fs::read_to_string("./configs/leagues.json") {
        match serde_json::from_str::<Vec<LeagueConfig>>(&file_contents) {
            Ok(config) => {
                info!("Seeding/updating {} leagues from config", config.len());
                let active_names: Vec<String> = config.iter().map(|l| l.name.clone()).collect();
                if let Err(e) = seed_tracked_leagues(pool.clone(), config).await {
                    error!("Failed to seed tracked leagues: {}", e);
                }
                // Disable any old leagues not in the current config (e.g. ESPN-era names)
                if let Err(e) = disable_stale_leagues(pool, &active_names).await {
                    warn!("Failed to disable stale leagues: {}", e);
                }
            }
            Err(e) => error!("Failed to parse leagues.json: {}", e),
        }
    } else {
        warn!("Could not read ./configs/leagues.json");
    }

    // Check for data source migration flag — truncate old ESPN data on first run
    let migration_flag = pool.acquire().await.ok().map(|mut conn| async move {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM games WHERE sport = '' OR sport IS NULL LIMIT 1)"
        )
        .fetch_one(&mut *conn)
        .await
        .unwrap_or(false)
    });

    if let Some(future) = migration_flag {
        if future.await {
            info!("Detected old ESPN data (games without sport field). Truncating for migration...");
            if let Err(e) = truncate_games(pool).await {
                error!("Failed to truncate games: {}", e);
            }
        }
    }

    let leagues = get_tracked_leagues(pool.clone()).await;
    if leagues.is_empty() {
        error!("No leagues to track. Sports service idling.");
        return None;
    }

    let api_key = env::var("API_SPORTS_KEY").unwrap_or_default();
    if api_key.is_empty() {
        error!("API_SPORTS_KEY not set. Cannot poll api-sports.io.");
        return None;
    }

    let client = build_client(&api_key);
    info!("Initialized with {} leagues", leagues.len());
    Some((client, leagues))
}

// =============================================================================
// Live polling (fast — today + yesterday when needed, every 30s-1min)
// =============================================================================

/// Poll today's games for live score updates. Called on the fast interval.
/// Also polls yesterday's date for leagues that still have live games from
/// yesterday (handles UTC midnight boundary — US evening games that started
/// on the previous UTC date).
pub async fn poll_live(
    pool: &Arc<PgPool>,
    client: &Client,
    leagues: &[TrackedLeague],
    health_state: &Arc<Mutex<SportsHealth>>,
    rate_limiter: &Arc<RateLimiter>,
) {
    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let yesterday = (now - Duration::days(1)).format("%Y-%m-%d").to_string();

    // Check which leagues still have live games from yesterday's UTC date.
    // On DB error this returns empty — we only poll today (fail safe).
    let yesterday_leagues = get_live_yesterday_leagues(pool).await;
    let has_yesterday = !yesterday_leagues.is_empty();
    let yesterday_set: std::collections::HashSet<&str> =
        yesterday_leagues.iter().map(|s| s.as_str()).collect();

    if has_yesterday {
        info!("Yesterday live games detected for {} league(s): {}",
            yesterday_leagues.len(), yesterday_leagues.join(", "));
    }

    let mut total_upserted = 0u32;
    let mut total_failed = 0u32;
    let mut leagues_with_live = 0u32;

    for league in leagues {
        if !rate_limiter.has_budget(&league.sport_api) {
            warn!("[{}] Skipping live poll — rate limit budget low for {} ({})",
                league.name, league.sport_api, rate_limiter.remaining(&league.sport_api));
            continue;
        }

        // Always poll today
        match poll_league(client, league, &today, rate_limiter).await {
            Ok(games) => {
                let (upserted, failed, has_live) = upsert_games(pool, league, games).await;
                if has_live {
                    leagues_with_live += 1;
                }
                total_upserted += upserted;
                total_failed += failed;
            }
            Err(e) => {
                error!("[{}] Live poll error: {}", league.name, e);
                health_state.lock().await.record_error(e.to_string());
            }
        }

        // Also poll yesterday if this league has live games from yesterday
        if yesterday_set.contains(league.name.as_str()) {
            if !rate_limiter.has_budget(&league.sport_api) {
                warn!("[{}] Skipping yesterday poll — rate limit budget low", league.name);
                continue;
            }
            match poll_league(client, league, &yesterday, rate_limiter).await {
                Ok(games) => {
                    let (upserted, failed, has_live) = upsert_games(pool, league, games).await;
                    if has_live {
                        leagues_with_live += 1;
                    }
                    total_upserted += upserted;
                    total_failed += failed;
                }
                Err(e) => {
                    error!("[{}] Yesterday poll error: {}", league.name, e);
                    health_state.lock().await.record_error(e.to_string());
                }
            }
        }
    }

    let mut health = health_state.lock().await;
    health.record_success(leagues.len() as u32, leagues_with_live);
    health.set_rate_limits(rate_limiter.all_remaining());

    if total_failed > 0 {
        info!("Live poll complete: {} upserted, {} failed across {} leagues", total_upserted, total_failed, leagues.len());
    }
}

// =============================================================================
// Schedule polling (slow — today + 7 days ahead, every 30 min)
// =============================================================================

/// Poll today's games to populate the upcoming schedule.
/// Also cleans up finished games older than 12 hours.
///
/// When querying future dates (tomorrow), games are filtered to only include
/// those starting within 12 hours from now. This captures midnight crossover
/// games (evening US time that falls on the next UTC date) without prematurely
/// fetching mid-day tomorrow games.
pub async fn poll_schedule(
    pool: &Arc<PgPool>,
    client: &Client,
    leagues: &[TrackedLeague],
    rate_limiter: &Arc<RateLimiter>,
) {
    let now = Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let cutoff = now + Duration::hours(12);

    // Build list of dates: today, +1 ... +SCHEDULE_DAYS_AHEAD
    let mut dates = Vec::with_capacity((SCHEDULE_DAYS_AHEAD + 1) as usize);
    for offset in 0..=SCHEDULE_DAYS_AHEAD {
        dates.push((now + Duration::days(offset)).format("%Y-%m-%d").to_string());
    }

    info!("Schedule poll: fetching {} days ({} to {}) for {} leagues",
        dates.len(), dates.first().unwrap(), dates.last().unwrap(), leagues.len());

    let mut total_upserted = 0u32;
    let mut total_failed = 0u32;

    for league in leagues {
        // Formula 1 fetches the whole season (no date param), skip per-date polling
        if league.sport_api == "formula-1" {
            continue;
        }

        for date in &dates {
            if !rate_limiter.has_budget(&league.sport_api) {
                warn!("[{}] Skipping schedule poll — rate limit budget low for {} ({})",
                    league.name, league.sport_api, rate_limiter.remaining(&league.sport_api));
                break;
            }

            match poll_league(client, league, date, rate_limiter).await {
                Ok(games) => {
                    // Filter future dates to only include games within 12 hours
                    let filtered = if date != &today {
                        games.into_iter().filter(|g| g.start_time <= cutoff).collect()
                    } else {
                        games
                    };
                    let (upserted, failed, _) = upsert_games(pool, league, filtered).await;
                    total_upserted += upserted;
                    total_failed += failed;
                }
                Err(e) => {
                    error!("[{}] Schedule poll error for {}: {}", league.name, date, e);
                }
            }

            // Spread requests to avoid rate limiting on startup
            tokio::time::sleep(std::time::Duration::from_millis(STARTUP_REQUEST_DELAY_MS)).await;
        }
    }

    info!("Schedule poll complete: {} upserted, {} failed", total_upserted, total_failed);

    // Clean up stale games
    match cleanup_old_games(pool).await {
        Ok(count) => {
            if count > 0 {
                info!("Cleaned up {} stale games", count);
            }
        }
        Err(e) => warn!("Failed to clean up old games: {}", e),
    }
}

// =============================================================================
// Standings polling (daily — every 24 hours)
// =============================================================================

/// Poll standings for all enabled leagues. Runs daily.
pub async fn poll_standings(
    pool: &Arc<PgPool>,
    client: &Client,
    leagues: &[TrackedLeague],
    rate_limiter: &Arc<RateLimiter>,
) {
    info!("Starting standings poll for {} leagues", leagues.len());
    for league in leagues {
        // F1 and MMA don't have traditional standings
        if league.sport_api == "formula-1" || league.sport_api == "mma" {
            continue;
        }
        if !rate_limiter.has_budget(&league.sport_api) {
            warn!("[{}] Skipping standings poll — budget low", league.name);
            continue;
        }

        let format_str = league.season_format.as_deref().unwrap_or("calendar");
        let default_season = compute_current_season(format_str);
        let season = league.season.as_deref().unwrap_or(&default_season).to_string();

        let (base, is_mock) = match std::env::var("API_SPORTS_BASE_URL") {
            Ok(override_url) => (override_url.trim_end_matches('/').to_string(), true),
            Err(_) => (format!("https://{}", league.api_host), false),
        };
        let mut url = format!(
            "{}/standings?league={}&season={}",
            base, league.league_id, season
        );
        if is_mock {
            url = format!("{}&sport={}", url, league.sport_api);
        }

        match client.get(&url).send().await {
            Ok(resp) => {
                if let Some(remaining) = resp.headers()
                    .get("x-ratelimit-requests-remaining")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u32>().ok())
                {
                    rate_limiter.update(&league.sport_api, remaining);
                }
                if !resp.status().is_success() {
                    warn!("[{}] Standings API returned {}", league.name, resp.status());
                    continue;
                }
                match resp.json::<serde_json::Value>().await {
                    Ok(body) => {
                        let response = body.get("response").and_then(|r| r.as_array()).cloned().unwrap_or_default();
                        parse_and_upsert_standings(pool, &league.name, &season, &response).await;
                    }
                    Err(e) => warn!("[{}] Failed to parse standings JSON: {}", league.name, e),
                }
            }
            Err(e) => error!("[{}] Standings request failed: {}", league.name, e),
        }

        // Spread requests to avoid rate limiting on startup
        tokio::time::sleep(std::time::Duration::from_millis(STARTUP_REQUEST_DELAY_MS)).await;
    }
    info!("Standings poll complete");
}

async fn parse_and_upsert_standings(
    pool: &Arc<PgPool>,
    league_name: &str,
    season: &str,
    response: &[serde_json::Value],
) {
    for entry in response {
        // Football has nested league.standings arrays
        // Other sports return flat standings arrays
        let standings_arrays = if let Some(league_obj) = entry.get("league") {
            league_obj.get("standings").and_then(|s| s.as_array()).cloned().unwrap_or_default()
        } else {
            vec![entry.clone()]
        };

        for group in &standings_arrays {
            let items = if group.is_array() {
                group.as_array().cloned().unwrap_or_default()
            } else {
                vec![group.clone()]
            };

            for item in &items {
                let team = match item.get("team") {
                    Some(t) => t,
                    None => continue,
                };
                let all = item.get("all").or_else(|| item.get("games"));
                let standing = StandingData {
                    league: league_name.to_string(),
                    team_name: team.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                    team_code: team.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
                    team_logo: team.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
                    rank: item.get("rank").and_then(|r| r.as_i64()).map(|r| r as i32),
                    wins: all.and_then(|a| a.get("win")).and_then(|w| w.as_i64()).unwrap_or(0) as i32,
                    losses: all.and_then(|a| a.get("lose")).and_then(|l| l.as_i64()).unwrap_or(0) as i32,
                    draws: all.and_then(|a| a.get("draw")).and_then(|d| d.as_i64()).unwrap_or(0) as i32,
                    points: item.get("points").and_then(|p| p.as_i64()).map(|p| p as i32),
                    games_played: all.and_then(|a| a.get("played")).and_then(|p| p.as_i64()).unwrap_or(0) as i32,
                    goal_diff: item.get("goalsDiff").and_then(|g| g.as_i64()).map(|g| g as i32),
                    description: item.get("description").and_then(|d| d.as_str()).map(|s| s.to_string()),
                    form: item.get("form").and_then(|f| f.as_str()).map(|s| s.to_string()),
                    group_name: item.get("group").and_then(|g| g.as_str()).map(|s| s.to_string()),
                    season: Some(season.to_string()),
                };
                if let Err(e) = upsert_standing(pool, standing).await {
                    error!("[{}] Failed to upsert standing: {}", league_name, e);
                }
            }
        }
    }
}

// =============================================================================
// Teams polling (weekly — every 7 days)
// =============================================================================

/// Fetch teams for a league and season. Returns the teams array from the API response.
async fn fetch_teams_for_season(
    client: &Client,
    league: &TrackedLeague,
    season: &str,
    rate_limiter: &Arc<RateLimiter>,
) -> Option<Vec<serde_json::Value>> {
    let (base, is_mock) = match std::env::var("API_SPORTS_BASE_URL") {
        Ok(override_url) => (override_url.trim_end_matches('/').to_string(), true),
        Err(_) => (format!("https://{}", league.api_host), false),
    };
    let mut url = format!(
        "{}/teams?league={}&season={}",
        base, league.league_id, season
    );
    if is_mock {
        url = format!("{}&sport={}", url, league.sport_api);
    }

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Some(remaining) = resp
                .headers()
                .get("x-ratelimit-requests-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u32>().ok())
            {
                rate_limiter.update(&league.sport_api, remaining);
            }
            if !resp.status().is_success() {
                warn!("[{}] Teams API returned {}", league.name, resp.status());
                return None;
            }
            match resp.json::<serde_json::Value>().await {
                Ok(body) => {
                    let response = body
                        .get("response")
                        .and_then(|r| r.as_array())
                        .cloned()
                        .unwrap_or_default();
                    Some(response)
                }
                Err(e) => {
                    warn!("[{}] Failed to parse teams JSON: {}", league.name, e);
                    None
                }
            }
        }
        Err(e) => {
            error!("[{}] Teams request failed: {}", league.name, e);
            None
        }
    }
}

/// Poll teams for all enabled leagues. Runs weekly.
/// If no teams found for the computed season, falls back to the previous year (1 year only).
pub async fn poll_teams(
    pool: &Arc<PgPool>,
    client: &Client,
    leagues: &[TrackedLeague],
    rate_limiter: &Arc<RateLimiter>,
) {
    info!("Starting teams poll for {} leagues", leagues.len());
    for league in leagues {
        if league.sport_api == "formula-1" || league.sport_api == "mma" {
            continue;
        }
        if !rate_limiter.has_budget(&league.sport_api) {
            warn!("[{}] Skipping teams poll — budget low", league.name);
            continue;
        }

        let format_str = league.season_format.as_deref().unwrap_or("calendar");
        let default_season = compute_current_season(format_str);
        let season = league
            .season
            .as_deref()
            .unwrap_or(&default_season)
            .to_string();

        // Try current season first
        let (teams, actual_season) =
            match fetch_teams_for_season(client, league, &season, rate_limiter).await {
                Some(teams) if !teams.is_empty() => (teams, season.clone()),
                _ => {
                    // Fallback: try previous year (1 year back only)
                    if let Ok(year) = season.parse::<i32>() {
                        let fallback_season = (year - 1).to_string();
                        info!(
                            "[{}] No teams for season {}, trying fallback {}",
                            league.name, season, fallback_season
                        );
                        // Add delay before fallback request
                        tokio::time::sleep(std::time::Duration::from_millis(
                            STARTUP_REQUEST_DELAY_MS,
                        ))
                        .await;
                        match fetch_teams_for_season(client, league, &fallback_season, rate_limiter)
                            .await
                        {
                            Some(teams) if !teams.is_empty() => (teams, fallback_season),
                            _ => {
                                warn!(
                                    "[{}] No teams found for season {} or fallback {}",
                                    league.name, season, fallback_season
                                );
                                (vec![], season.clone())
                            }
                        }
                    } else {
                        warn!(
                            "[{}] Could not parse season '{}' as year for fallback",
                            league.name, season
                        );
                        (vec![], season.clone())
                    }
                }
            };

        // Upsert teams
        for item in &teams {
            let team = item.get("team").or(Some(item));
            if let Some(t) = team {
                let ext_id = t.get("id").and_then(|i| i.as_i64()).unwrap_or(0) as i32;
                if ext_id == 0 {
                    continue;
                }
                let data = TeamData {
                    league: league.name.clone(),
                    external_id: ext_id,
                    name: t
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string(),
                    code: t
                        .get("code")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string()),
                    logo: t
                        .get("logo")
                        .and_then(|l| l.as_str())
                        .map(|s| s.to_string()),
                    country: t
                        .get("country")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string()),
                    season: Some(actual_season.clone()),
                };
                if let Err(e) = upsert_team(pool, data).await {
                    error!("[{}] Failed to upsert team: {}", league.name, e);
                }
            }
        }

        // Spread requests to avoid rate limiting on startup
        tokio::time::sleep(std::time::Duration::from_millis(STARTUP_REQUEST_DELAY_MS)).await;
    }
    info!("Teams poll complete");
}

// =============================================================================
// Shared upsert helper
// =============================================================================

/// Upsert a batch of games and return (upserted, failed, has_live).
async fn upsert_games(
    pool: &Arc<PgPool>,
    league: &TrackedLeague,
    games: Vec<CleanedData>,
) -> (u32, u32, bool) {
    let total = games.len();
    let has_live = games.iter().any(|g| g.state == "in");

    let mut upserted = 0u32;
    let mut failed = 0u32;
    for game in games {
        let game_id = game.external_game_id.clone();
        match upsert_game(pool.clone(), game).await {
            Ok(_) => upserted += 1,
            Err(e) => {
                error!("[{}] Failed to upsert game {}: {}", league.name, game_id, e);
                failed += 1;
            }
        }
    }

    if total > 0 {
        info!("[{}] {} games found, {} upserted, {} failed", league.name, total, upserted, failed);
    }

    (upserted, failed, has_live)
}

// =============================================================================
// HTTP client
// =============================================================================

fn build_client(api_key: &str) -> Client {
    let mut headers = header::HeaderMap::new();
    headers.insert(
        "x-apisports-key",
        header::HeaderValue::from_str(api_key).expect("Invalid API key"),
    );

    Client::builder()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("Failed to build HTTP client")
}

// =============================================================================
// League polling
// =============================================================================

async fn poll_league(
    client: &Client,
    league: &TrackedLeague,
    date: &str,
    rate_limiter: &RateLimiter,
) -> anyhow::Result<Vec<CleanedData>> {
    let url = build_api_url(league, date);

    let resp = client.get(&url).send().await?;

    // Extract rate limit info from headers — update only this sport's bucket
    if let Some(remaining) = resp.headers()
        .get("x-ratelimit-requests-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
    {
        rate_limiter.update(&league.sport_api, remaining);
    }

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("[{}] API returned {}: {}", league.name, status, body);
    }

    let body: serde_json::Value = resp.json().await?;

    // api-sports.io wraps all responses in: {"get": "...", "results": N, "response": [...]}
    let response_array = body.get("response")
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    if let Some(errors) = body.get("errors") {
        if errors.is_object() && errors.as_object().map_or(false, |m| !m.is_empty()) {
            warn!("[{}] API returned errors: {}", league.name, errors);
        }
    }

    let mut cleaned_games = Vec::new();
    for item in &response_array {
        if let Some(game) = parse_game(item, league) {
            cleaned_games.push(game);
        }
    }

    Ok(cleaned_games)
}

/// Compute the current season string dynamically based on the league's
/// `season_format` and today's date. This eliminates the need to manually
/// update season values in `leagues.json` every year.
///
/// Supported formats:
///   - `"cross-year"`    — YYYY-YYYY, new season starts October (NBA, NCAA Basketball)
///   - `"fall-october"`  — YYYY (start year), new season starts October (NHL)
///   - `"fall-august"`   — YYYY (start year), new season starts August (NFL, NCAA Football, Soccer)
///   - `"calendar"`      — YYYY, always the current calendar year (MLB, MLS, F1)
fn compute_current_season(season_format: &str) -> String {
    let now = Utc::now();
    let year = now.year();
    let month = now.month();

    match season_format {
        "cross-year" => {
            if month >= 10 { format!("{}-{}", year, year + 1) }
            else { format!("{}-{}", year - 1, year) }
        }
        "fall-october" => {
            if month >= 10 { format!("{}", year) }
            else { format!("{}", year - 1) }
        }
        "fall-august" => {
            if month >= 8 { format!("{}", year) }
            else { format!("{}", year - 1) }
        }
        "calendar" => format!("{}", year),
        other => {
            warn!("Unknown season_format '{}', falling back to calendar year", other);
            format!("{}", year)
        }
    }
}

/// Build the correct API URL based on the sport type.
///
/// When `API_SPORTS_BASE_URL` is set (e.g. `http://localhost:9090`), all
/// requests are redirected to that host instead of the real api-sports.io
/// endpoints.  The original `api_host` is sent as a query parameter so the
/// mock server can distinguish between sports.
fn build_api_url(league: &TrackedLeague, date: &str) -> String {
    let (base, is_mock) = match std::env::var("API_SPORTS_BASE_URL") {
        Ok(override_url) => (override_url.trim_end_matches('/').to_string(), true),
        Err(_) => (format!("https://{}", league.api_host), false),
    };
    let format_str = league.season_format.as_deref().unwrap_or("calendar");
    let default_season = compute_current_season(format_str);
    let season = league.season.as_deref().unwrap_or(&default_season);

    let url = match league.sport_api.as_str() {
        "football" => {
            format!("{}/fixtures?league={}&season={}&date={}", base, league.league_id, season, date)
        }
        "formula-1" => {
            format!("{}/races?season={}", base, season)
        }
        "mma" => {
            format!("{}/fights?date={}", base, date)
        }
        other => {
            if !matches!(other,
                "basketball" | "hockey" | "baseball" | "american-football" |
                "rugby" | "handball" | "volleyball" | "afl"
            ) {
                warn!("Unknown sport_api '{}', falling back to /games", other);
            }
            format!("{}/games?league={}&season={}&date={}", base, league.league_id, season, date)
        }
    };

    if is_mock {
        format!("{}&sport={}", url, league.sport_api)
    } else {
        url
    }
}

// =============================================================================
// Response parsing — dispatches to sport-specific parsers
// =============================================================================

fn parse_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    match league.sport_api.as_str() {
        "football" => parse_football_fixture(item, league),
        "american-football" => parse_american_football_game(item, league),
        "basketball" => parse_basketball_game(item, league),
        "hockey" => parse_hockey_game(item, league),
        "baseball" => parse_baseball_game(item, league),
        "formula-1" => parse_f1_race(item, league),
        "rugby" => parse_rugby_game(item, league),
        "handball" => parse_handball_game(item, league),
        "volleyball" => parse_volleyball_game(item, league),
        "afl" => parse_afl_game(item, league),
        "mma" => parse_mma_fight(item, league),
        _ => {
            warn!("[{}] No parser for sport_api '{}'", league.name, league.sport_api);
            None
        }
    }
}

// =============================================================================
// Status mapping — consistent across all sports
// =============================================================================

/// Map api-sports.io status short codes to our state enum: "pre", "in", "final", "postponed"
fn map_status_to_state(status_short: &str) -> &'static str {
    match status_short {
        // Not started
        "NS" | "TBD" | "CANC" | "WO" => "pre",
        // Finished
        "FT" | "AET" | "PEN" | "AOT" | "AP" | "ABD" | "AWD" | "INT" => "final",
        // Postponed / suspended
        "PST" | "SUSP" => "postponed",
        // Everything else is live / in progress
        // Q1, Q2, Q3, Q4, HT, OT, P1, P2, P3, BT, 1H, 2H, ET, IN1-IN9, etc.
        _ => "in",
    }
}

// =============================================================================
// Football (Soccer) — v3.football.api-sports.io
// =============================================================================

fn parse_football_fixture(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let fixture = item.get("fixture")?;
    let teams = item.get("teams")?;
    let goals = item.get("goals")?;

    let game_id = fixture.get("id")?.as_i64()?.to_string();
    let timestamp = fixture.get("timestamp").and_then(|t| t.as_i64());
    let date_str = fixture.get("date").and_then(|d| d.as_str());

    let start_time = parse_api_date(timestamp, date_str)?;

    let status = fixture.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let elapsed = status.get("elapsed").and_then(|e| e.as_i64());

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    let venue_obj = fixture.get("venue");
    let venue = venue_obj
        .and_then(|v| v.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    let timer = elapsed.map(|e| format!("{}′", e));
    let detail = build_detail(status_short, status_long, timer.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: goals.get("home").and_then(|s| s.as_i64()).map(|s| s as i32),
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: goals.get("away").and_then(|s| s.as_i64()).map(|s| s as i32),
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer,
        venue,
        season: league.season.clone(),
    })
}

// =============================================================================
// American Football (NFL / NCAA) — v1.american-football.api-sports.io
// =============================================================================

fn parse_american_football_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game = item.get("game")?;
    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let game_id = game.get("id")?.as_i64()?.to_string();
    let date_obj = game.get("date")?;
    let timestamp = date_obj.get("timestamp").and_then(|t| t.as_i64());
    let date_str = date_obj.get("date").and_then(|d| d.as_str())
        .or_else(|| date_obj.get("start").and_then(|d| d.as_str()));

    let start_time = parse_api_date(timestamp, date_str)?;

    let status = game.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    let home_score = scores.get("home").and_then(|s| s.get("total")).and_then(|t| t.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.get("total")).and_then(|t| t.as_i64()).map(|s| s as i32);

    let venue = game.get("venue")
        .and_then(|v| v.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue,
        season: league.season.clone(),
    })
}

// =============================================================================
// Basketball (NBA / NCAA Basketball) — v1.basketball.api-sports.io
// =============================================================================

fn parse_basketball_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    let home_score = scores.get("home").and_then(|s| s.get("total")).and_then(|t| t.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.get("total")).and_then(|t| t.as_i64()).map(|s| s as i32);

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// Hockey (NHL) — v1.hockey.api-sports.io
// =============================================================================

fn parse_hockey_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    // Hockey scores can be at top level of scores.home/scores.away as integers
    let home_score = scores.get("home").and_then(|s| s.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.as_i64()).map(|s| s as i32);

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// Baseball (MLB) — v1.baseball.api-sports.io
// =============================================================================

fn parse_baseball_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    // Baseball scores: sum per-inning runs for real-time accuracy (total lags behind)
    let home_score = scores.get("home")
        .and_then(|s| s.get("innings"))
        .and_then(|inn| inn.as_object())
        .map(|obj| obj.values().filter_map(|v| v.as_i64()).sum::<i64>() as i32);
    let away_score = scores.get("away")
        .and_then(|s| s.get("innings"))
        .and_then(|inn| inn.as_object())
        .map(|obj| obj.values().filter_map(|v| v.as_i64()).sum::<i64>() as i32);

    // Baseball uses inning info in status
    let inning = status.get("inning").and_then(|i| i.as_i64());
    let timer_str = inning.map(|i| format!("Inn {}", i));

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// Formula 1 — v1.formula-1.api-sports.io
// =============================================================================

fn parse_f1_race(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    // Only ingest actual Race sessions — skip practice, qualifying, sprint
    let race_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if race_type != "Race" {
        return None;
    }

    let race_id = item.get("id")?.as_i64()?.to_string();

    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(None, date_str)?;

    let status = item.get("status").and_then(|s| s.as_str()).unwrap_or("Scheduled");

    // F1 doesn't have a traditional home/away structure.
    // We use the race name as "home" and circuit as "away" for display.
    let state = match status {
        "Completed" => "final",
        "Live" | "In Progress" => "in",
        _ => "pre",
    };

    // Skip old completed races — they'd be cleaned up anyway and waste DB writes
    if state == "final" && start_time < Utc::now() - Duration::hours(12) {
        return None;
    }

    let competition = item.get("competition")?;
    let race_name = competition.get("name").and_then(|n| n.as_str()).unwrap_or("Race");
    let circuit = item.get("circuit");
    let circuit_name = circuit
        .and_then(|c| c.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: race_id,
        link: None,
        home_team: Team {
            name: race_name.to_string(),
            logo: None,
            score: None,
            code: None,
        },
        away_team: Team {
            name: circuit_name.clone().unwrap_or_else(|| "TBD".to_string()),
            logo: None,
            score: None,
            code: None,
        },
        start_time,
        short_detail: Some(status.to_string()),
        state: state.to_string(),
        status_short: Some(status.to_string()),
        status_long: Some(status.to_string()),
        timer: None,
        venue: circuit_name,
        season: league.season.clone(),
    })
}

// =============================================================================
// Rugby — v1.rugby.api-sports.io
// =============================================================================

fn parse_rugby_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    let home_score = scores.get("home").and_then(|s| s.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.as_i64()).map(|s| s as i32);

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// Handball — v1.handball.api-sports.io
// =============================================================================

fn parse_handball_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    let home_score = scores.get("home").and_then(|s| s.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.as_i64()).map(|s| s as i32);

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// Volleyball — v1.volleyball.api-sports.io
// =============================================================================

fn parse_volleyball_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    // Volleyball scores represent sets won
    let home_score = scores.get("home").and_then(|s| s.as_i64()).map(|s| s as i32);
    let away_score = scores.get("away").and_then(|s| s.as_i64()).map(|s| s as i32);

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue: None,
        season: league.season.clone(),
    })
}

// =============================================================================
// AFL (Australian Football League) — v1.afl.api-sports.io
// =============================================================================

fn parse_afl_game(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let game = item.get("game")?;
    let game_id = game.get("id")?.as_i64()?.to_string();

    // AFL returns timestamp as a string
    let timestamp = item.get("timestamp")
        .and_then(|t| t.as_i64().or_else(|| t.as_str().and_then(|s| s.parse::<i64>().ok())));
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());
    let timer_str = status.get("timer").and_then(|t| t.as_str()).map(|s| s.to_string());

    let teams = item.get("teams")?;
    let scores = item.get("scores")?;

    let home = teams.get("home")?;
    let away = teams.get("away")?;

    // AFL scores: nested under scores.home.score / scores.away.score (total points)
    let home_score = scores.get("home")
        .and_then(|s| s.get("score"))
        .and_then(|t| t.as_i64())
        .map(|s| s as i32);
    let away_score = scores.get("away")
        .and_then(|s| s.get("score"))
        .and_then(|t| t.as_i64())
        .map(|s| s as i32);

    let venue = item.get("venue")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let detail = build_detail(status_short, status_long, timer_str.as_deref());

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: game_id,
        link: None,
        home_team: Team {
            name: home.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: home.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: home_score,
            code: home.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        away_team: Team {
            name: away.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: away.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: away_score,
            code: away.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()),
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: timer_str,
        venue,
        season: league.season.clone(),
    })
}

// =============================================================================
// MMA (Mixed Martial Arts) — v1.mma.api-sports.io
// =============================================================================

fn parse_mma_fight(item: &serde_json::Value, league: &TrackedLeague) -> Option<CleanedData> {
    let fight_id = item.get("id")?.as_i64()?.to_string();

    let timestamp = item.get("timestamp").and_then(|t| t.as_i64());
    let date_str = item.get("date").and_then(|d| d.as_str());
    let start_time = parse_api_date(timestamp, date_str)?;

    let status = item.get("status")?;
    let status_short = status.get("short").and_then(|s| s.as_str()).unwrap_or("NS");
    let status_long = status.get("long").and_then(|s| s.as_str());

    let fighters = item.get("fighters")?;
    let first = fighters.get("first")?;
    let second = fighters.get("second")?;

    // Weight class as category context, event name as venue
    let category = item.get("category").and_then(|c| c.as_str());
    let event_name = item.get("slug").and_then(|s| s.as_str()).map(|s| s.to_string());

    // Build a detail string: weight class for pre-fight, status for finished
    let detail = match map_status_to_state(status_short) {
        "final" => status_long.map(|s| s.to_string()),
        "in" => Some("Live".to_string()),
        _ => category.map(|c| c.to_string()),
    };

    Some(CleanedData {
        league: league.name.clone(),
        sport: league.sport_api.clone(),
        external_game_id: fight_id,
        link: None,
        home_team: Team {
            name: first.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: first.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: None,
            code: None,
        },
        away_team: Team {
            name: second.get("name").and_then(|n| n.as_str())?.to_string(),
            logo: second.get("logo").and_then(|l| l.as_str()).map(|s| s.to_string()),
            score: None,
            code: None,
        },
        start_time,
        short_detail: detail,
        state: map_status_to_state(status_short).to_string(),
        status_short: Some(status_short.to_string()),
        status_long: status_long.map(|s| s.to_string()),
        timer: category.map(|c| c.to_string()),
        venue: event_name,
        season: league.season.clone(),
    })
}

// =============================================================================
// Date parsing helpers
// =============================================================================

/// Parse dates from api-sports.io. They provide either a UNIX timestamp,
/// an ISO 8601 date string, or both.
fn parse_api_date(timestamp: Option<i64>, date_str: Option<&str>) -> Option<DateTime<Utc>> {
    // Prefer timestamp if available
    if let Some(ts) = timestamp {
        return DateTime::from_timestamp(ts, 0);
    }

    // Fall back to date string
    if let Some(s) = date_str {
        // Try full ISO 8601 / RFC 3339
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return Some(dt.with_timezone(&Utc));
        }

        // Try without timezone: "2025-03-09T19:00:00"
        if let Ok(dt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
            return Some(dt.and_utc());
        }

        // Try date-only: "2025-03-09"
        if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
            return d.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc());
        }

        // Try with timezone offset without colon: "2025-03-09T19:00:00+0000"
        if let Ok(dt) = DateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%z") {
            return Some(dt.with_timezone(&Utc));
        }
    }

    None
}

/// Build a human-readable detail string from status fields.
fn build_detail(status_short: &str, status_long: Option<&str>, timer: Option<&str>) -> Option<String> {
    match (status_short, status_long, timer) {
        // Live with timer: "Q3 · 4:32"
        (_, _, Some(t)) if map_status_to_state(status_short) == "in" => {
            Some(format!("{} · {}", status_short, t))
        }
        // Live without timer: use long status
        (_, Some(long), _) if map_status_to_state(status_short) == "in" => {
            Some(long.to_string())
        }
        // Finished
        (_, Some(long), _) if map_status_to_state(status_short) == "final" => {
            Some(long.to_string())
        }
        // Not started / other
        (_, Some(long), _) => Some(long.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_status_to_state_pre() {
        assert_eq!(map_status_to_state("NS"), "pre");
        assert_eq!(map_status_to_state("TBD"), "pre");
        assert_eq!(map_status_to_state("CANC"), "pre");
        assert_eq!(map_status_to_state("WO"), "pre");
    }

    #[test]
    fn test_map_status_to_state_final() {
        assert_eq!(map_status_to_state("FT"), "final");
        assert_eq!(map_status_to_state("AET"), "final");
        assert_eq!(map_status_to_state("PEN"), "final");
        assert_eq!(map_status_to_state("AOT"), "final");
        assert_eq!(map_status_to_state("AP"), "final");
        assert_eq!(map_status_to_state("ABD"), "final");
        assert_eq!(map_status_to_state("AWD"), "final");
        assert_eq!(map_status_to_state("INT"), "final");
    }

    #[test]
    fn test_map_status_to_state_postponed() {
        assert_eq!(map_status_to_state("PST"), "postponed");
        assert_eq!(map_status_to_state("SUSP"), "postponed");
    }

    #[test]
    fn test_map_status_to_state_in_progress() {
        // Live game status codes
        assert_eq!(map_status_to_state("1H"), "in");
        assert_eq!(map_status_to_state("2H"), "in");
        assert_eq!(map_status_to_state("HT"), "in");
        assert_eq!(map_status_to_state("OT"), "in");
        assert_eq!(map_status_to_state("Q1"), "in");
        assert_eq!(map_status_to_state("Q4"), "in");
        assert_eq!(map_status_to_state("BT"), "in");
        assert_eq!(map_status_to_state("P1"), "in");
        assert_eq!(map_status_to_state("P3"), "in");
        assert_eq!(map_status_to_state("ET"), "in");
        assert_eq!(map_status_to_state("IN1"), "in");
        assert_eq!(map_status_to_state("IN9"), "in");
        assert_eq!(map_status_to_state(""), "in"); // empty → falls through to "in"
        assert_eq!(map_status_to_state("LIVE"), "in"); // unknown → "in"
    }

    #[test]
    fn test_compute_current_season_format() {
        // Test the function doesn't panic and returns a 4-digit year string
        for fmt in &["cross-year", "fall-october", "fall-august", "calendar", "unknown"] {
            let result = compute_current_season(fmt);
            assert!(!result.is_empty(), "compute_current_season({}) returned empty", fmt);
            // Result should be either a 4-digit year or YYYY-YYYY format
            assert!(
                result.len() == 4 || (result.len() == 9 && result.contains("-")),
                "compute_current_season({}) = {:?}, expected YYYY or YYYY-YYYY",
                fmt, result
            );
        }
    }

    #[test]
    fn test_parse_api_date_timestamp() {
        // UNIX timestamp → UTC
        let dt = parse_api_date(Some(1709337600), None);
        assert!(dt.is_some());
        let dt = dt.unwrap();
        assert_eq!(dt.timestamp(), 1709337600);
    }

    #[test]
    fn test_parse_api_date_rfc3339() {
        let dt = parse_api_date(None, Some("2025-03-09T19:00:00Z"));
        assert!(dt.is_some());
        assert_eq!(dt.unwrap().format("%Y-%m-%d").to_string(), "2025-03-09");
    }

    #[test]
    fn test_parse_api_date_naive_datetime() {
        let dt = parse_api_date(None, Some("2025-03-09T19:00:00"));
        assert!(dt.is_some());
        assert_eq!(dt.unwrap().format("%Y-%m-%d").to_string(), "2025-03-09");
    }

    #[test]
    fn test_parse_api_date_date_only() {
        let dt = parse_api_date(None, Some("2025-03-09"));
        assert!(dt.is_some());
        assert_eq!(dt.unwrap().format("%Y-%m-%d").to_string(), "2025-03-09");
        assert_eq!(dt.unwrap().format("%H:%M:%S").to_string(), "00:00:00");
    }

    #[test]
    fn test_parse_api_date_with_offset() {
        let dt = parse_api_date(None, Some("2025-03-09T19:00:00+0000"));
        assert!(dt.is_some());
        assert_eq!(dt.unwrap().format("%Y-%m-%d").to_string(), "2025-03-09");
    }

    #[test]
    fn test_parse_api_date_prefers_timestamp() {
        let dt = parse_api_date(Some(1709337600), Some("2020-01-01T00:00:00Z"));
        assert!(dt.is_some());
        // Should use timestamp, not date string
        assert_eq!(dt.unwrap().format("%Y").to_string(), "2024"); // 1709337600 = March 2024
    }

    #[test]
    fn test_parse_api_date_invalid_returns_none() {
        assert!(parse_api_date(None, Some("not-a-date")).is_none());
        assert!(parse_api_date(None, Some("")).is_none());
        assert!(parse_api_date(None, None).is_none());
    }

    #[test]
    fn test_build_detail_live_with_timer() {
        // Live in progress with timer
        let detail = build_detail("Q3", Some("3rd Quarter"), Some("4:32"));
        assert!(detail.is_some());
        assert_eq!(detail.unwrap(), "Q3 · 4:32");
    }

    #[test]
    fn test_build_detail_live_no_timer() {
        // Live but no timer → use long status
        let detail = build_detail("HT", Some("Halftime"), None);
        assert!(detail.is_some());
        assert_eq!(detail.unwrap(), "Halftime");
    }

    #[test]
    fn test_build_detail_finished() {
        let detail = build_detail("FT", Some("Full Time"), None);
        assert!(detail.is_some());
        assert_eq!(detail.unwrap(), "Full Time");
    }

    #[test]
    fn test_build_detail_not_started() {
        // NS → not live or final → falls to last match
        let detail = build_detail("NS", Some("Not Started"), None);
        assert!(detail.is_some());
        assert_eq!(detail.unwrap(), "Not Started");
    }

    #[test]
    fn test_build_detail_nil_long() {
        let detail = build_detail("Q3", None, Some("2:00"));
        // Timer exists but no long status — since map_status_to_state("Q3") == "in" and
        // timer exists, it should still format with timer
        assert!(detail.is_some());
        // The match is: (_, _, Some(t)) if map == "in" → format
        assert_eq!(detail.unwrap(), "Q3 · 2:00");
    }

    #[test]
    fn test_build_detail_no_info() {
        let detail = build_detail("???", None, None);
        assert!(detail.is_none());
    }
}
