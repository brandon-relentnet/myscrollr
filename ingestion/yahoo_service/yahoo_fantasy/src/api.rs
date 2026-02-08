use anyhow::{Context, anyhow};
pub use oauth2::{http::header, reqwest::Client};
use secrecy::ExposeSecret;
use log::{error, info};
use chrono::{Datelike, Utc};

use crate::{error::YahooError, types::{LeagueStandings, Leagues, Tokens, UserLeague}, xml_leagues, xml_standings};

pub(crate) const YAHOO_BASE_API: &str = "https://fantasysports.yahooapis.com/fantasy/v2";

pub(crate) async fn make_request(endpoint: &str, client: Client, tokens: &Tokens, mut retries_allowed: u8) -> anyhow::Result<(String, Option<(String, String)>)> {
    let mut new_tokens: Option<(String, String)> = None;
    let mut roster_date = true;

    while retries_allowed > 0 {
        let access_token = if let Some(ref token) = new_tokens {
            token.0.clone()
        } else {
            tokens.access_token.expose_secret().to_string()
        };

        let use_endpoint = if roster_date == false {
            let cleaned_endpoint = if let Some(semicolon_pos) = endpoint.find(';') {
                if let Some(slash_pos) = endpoint[semicolon_pos..].find('/') {
                    format!("{}{}", &endpoint[..semicolon_pos], &endpoint[semicolon_pos + slash_pos..])
                } else {
                    endpoint.to_string()
                }
            } else {
                endpoint.to_string()
            };

            cleaned_endpoint
        } else {
            endpoint.to_string()
        };

        let url = format!("{YAHOO_BASE_API}{use_endpoint}");
        let response = client.get(&url)
            .bearer_auth(access_token)
            .header(header::ACCEPT, "application/xml")
            .send()
            .await
            .with_context(|| format!("Failed to make request to {url}"))?
            .text()
            .await
            .with_context(|| format!("Failed casting response to text: {url}"))?;

        let status = YahooError::check_response(response.clone(), tokens.client_id.clone(), tokens.client_secret.clone(), tokens.callback_url.clone(), tokens.refresh_token.clone()).await;
        retries_allowed -= 1;
        match status {
            YahooError::Ok => return Ok((response, new_tokens)),
            YahooError::NewTokens(a, b) => new_tokens = Some((a, b)),
            YahooError::Failed => return Err(anyhow!("Request failed and could not be recovered")),
            YahooError::Error(e) => {
                info!("{e}");

                match e.as_str() {
                    "date unsupported" => roster_date = false,
                    _ => info!("{e}"),
                }
            },
        }
    }

    Err(anyhow!("Exceeded number of retries allowed"))
}

pub async fn get_user_leagues(tokens: &Tokens, client: Client) -> anyhow::Result<(Leagues, Option<(String, String)>)> {
    let (league_data, opt_tokens) = make_request(&format!("/users;use_login=1/games/leagues"), client, &tokens, 2).await?;

    let cleaned: xml_leagues::FantasyContent = serde_xml_rs::from_str(&league_data).inspect_err(|e| error!("Deserialization error in leagues: {e}"))?;

    let mut nba = Vec::new();
    let mut nfl = Vec::new();
    let mut nhl = Vec::new();
    let mut mlb = Vec::new();

    let users = cleaned.users.user;
    let games = users[0].games.game.clone();

    for game in games {
        let league_data = if let Some(leagues) = game.leagues {
            leagues.league.clone()
        } else {
            continue;
        };

        for league in league_data {
            let current_year = Utc::now().year() as u16;
            let is_finished = match league.is_finished {
                Some(1) => true,
                Some(0) => false,
                // Yahoo doesn't return is_finished for predraft/unplayed leagues.
                // Only mark as definitely finished if the season is 2+ years old.
                // Current year and previous year leagues could still be in-season
                // (e.g. NBA 2025 season runs Oct 2025 - Apr 2026).
                None => league.season < current_year.saturating_sub(1),
                _ => false,
            };

            info!(
                "League {} ({}) season={} is_finished={} (raw={:?}) current_week={:?} draft_status={}",
                league.league_key, league.name, league.season,
                is_finished, league.is_finished, league.current_week, league.draft_status
            );

            let user_league = UserLeague {
                league_key: league.league_key,
                league_id: league.league_id,
                name: league.name,
                url: league.url,
                logo_url: league.logo_url,
                draft_status: league.draft_status,
                num_teams: league.num_teams,
                scoring_type: league.scoring_type,
                league_type: league.league_type,
                current_week: league.current_week,
                start_week: league.start_week,
                end_week: league.end_week,
                is_finished,
                season: league.season,
                game_code: league.game_code,
            };

            match user_league.game_code.as_str() {
                "nba" => nba.push(user_league),
                "nfl" => nfl.push(user_league),
                "nhl" => nhl.push(user_league),
                "mlb" => mlb.push(user_league),
                _ => (),
            }
        }
    }

    let leagues = Leagues {
        nba,
        nfl,
        nhl,
        mlb,
    };
    
    return Ok((leagues, opt_tokens));
}

pub async fn get_league_standings(league_key: &str, client: Client, tokens: &Tokens) -> anyhow::Result<(Vec<LeagueStandings>, Option<(String, String)>)> {
    let (league_data, opt_tokens) = make_request(&format!("/league/{league_key}/standings"), client, &tokens, 2).await?;

    let cleaned: xml_standings::FantasyContent = serde_xml_rs::from_str(&league_data).inspect_err(|e| error!("Deserialization error in standings: {e}"))?;

    let mut standings = Vec::new();
    let league = cleaned.league;
    let teams = league.standings.teams.team;
    
    for team in teams {
        let team_standings = team.team_standings;
        let outcome_total = team_standings.outcome_totals;

        let (wins, losses, ties, percentage) = if let Some(totals) = outcome_total {
            (
                totals.wins,
                totals.losses,
                totals.ties,
                totals.percentage.unwrap_or_else(|| "0.0".to_string())
            )
        } else {
            (
                0,
                0,
                0,
                "0.0".to_string()
            )
        };

        let games_back = team_standings.games_back.unwrap_or("0.0".to_string());
        standings.push(
            LeagueStandings {
                team_key: team.team_key,
                team_id: team.team_id,
                name: team.name,
                url: team.url,
                team_logo: team.team_logos.team_logo[0].url.clone(),
                wins,
                losses,
                ties,
                percentage,
                games_back: games_back,
                points_for: team_standings.points_for.unwrap_or("0".to_string()),
                points_against: team_standings.points_against.unwrap_or("0".to_string()),
            }
        );
    }

    return Ok((standings, opt_tokens));
}

