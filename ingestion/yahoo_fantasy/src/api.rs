use anyhow::{Context, anyhow};
pub use oauth2::{http::header, reqwest::Client};
use secrecy::{ExposeSecret, SecretString};
use log::{error, info};

use crate::{debug::LeagueStats, error::YahooError, stats::StatDecode, types::{LeagueStandings, Leagues, Matchup, MatchupTeam, Matchups, Roster, Tokens, UserLeague}, utilities::write_stat_pairs_to_file, xml_leagues, xml_matchups, xml_roster, xml_settings::{self, Stat}, xml_standings};

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

    let users = cleaned.users.user;
    let games = users[0].games.game.clone();

    for game in games {
        let league_data = if let Some(leagues) = game.leagues {
            leagues.league.clone()
        } else {
            continue;
        };

        for league in league_data {
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
                season: league.season,
                game_code: league.game_code,
            };

            match user_league.game_code.as_str() {
                "nba" => nba.push(user_league),
                "nfl" => nfl.push(user_league),
                "nhl" => nhl.push(user_league),
                _ => (),
            }
        }
    }

    let leagues = Leagues {
        nba,
        nfl,
        nhl,
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

pub async fn get_team_roster<T> (team_key: &str, client: Client, tokens: &Tokens, opt_date: Option<String>) -> anyhow::Result<(Vec<Roster<T>>, Option<(String, String)>)> 
where 
    T: StatDecode + serde::de::DeserializeOwned + std::fmt::Display,
    <T as TryFrom<u32>>::Error: std::fmt::Display,
{
    let url = if let Some(date) = opt_date {
        format!("/team/{team_key}/roster;date={date}/players/stats")
    } else {
        format!("/team/{team_key}/roster/players/stats")
    };

    let (league_data, mut opt_tokens) = make_request(&url, client.clone(), &tokens, 2).await?;

    let cleaned: xml_roster::FantasyContent<T> = match serde_xml_rs::from_str(&league_data) {
        Ok(data) => data,
        Err(e) => {
            let error_msg = e.to_string();

            if error_msg.contains("TryFrom not implemented") && error_msg.contains("Stat ID") {
                let (league_key, _) = team_key.split_once(".t").unwrap();
                let (pairs, new_tokens, game_code) = get_stat_pairs(&client, tokens, league_key).await?;

                if let Some(new) = new_tokens {
                    opt_tokens = Some(new);
                }

                write_stat_pairs_to_file(&pairs, &game_code)?;

                serde_xml_rs::from_str::<xml_roster::FantasyContent<T>>(&league_data).inspect_err(|e| {
                    error!("Deserialization error in roster: {e}");
                })?
            } else {
                error!("Deserialization error in roster: {e}");
                return Err(anyhow::anyhow!("Failed to deserialize roster: {e}"));
            }
        }
    };

    let mut roster = Vec::new();

    let team = cleaned.team;
    let players = team.roster.players.player;
    for player in players.unwrap_or(Vec::new()) {
        let eligible = player.eligible_positions.position;
        let stats = player.player_stats.stats.stat;

        let model = Roster {
            id: player.player_id,
            key: player.player_key,
            name: player.name.full,
            first_name: player.name.first,
            last_name: player.name.last,
            team_abbreviation: player.editorial_team_abbr,
            team_full_name: player.editorial_team_full_name,
            uniform_number: player.uniform_number.unwrap_or("None".to_string()),
            position: player.display_position,
            selected_position: player.selected_position.position,
            eligible_positions: eligible,
            image_url: player.image_url,
            headshot: player.headshot.url,
            is_undroppable: player.is_undroppable,
            position_type: player.position_type,
            stats: stats,
            player_points: player.player_points,
        };

        roster.push(model);
    }

    return Ok((roster, opt_tokens));
}

pub async fn get_stat_pairs(client: &Client, tokens: &Tokens, league_key: &str) -> anyhow::Result<(Vec<Stat>, Option<(String, String)>, String)> {
    let mut new_tokens: Option<(String, String)> = None;

    let (league_data, opt_tokens) = make_request(&format!("/league/{league_key}/settings"), client.clone(), &tokens, 2).await?;

    if let Some(t) = opt_tokens {
        new_tokens = Some(t);
    }

    let cleaned: xml_settings::FantasyContent = serde_xml_rs::from_str(&league_data)?;
    let game_code = cleaned.league.game_code;
    let stats = cleaned.league.settings.stat_categories.stats.stat;
    Ok((stats, new_tokens, game_code))
}

pub async fn debug_league_stats(client: Client, tokens: &Tokens) -> anyhow::Result<(LeagueStats, Option<(String, String)>)> {
    let (leagues_info, _) = get_user_leagues(tokens, client.clone()).await?;

    let mut league_keys = Vec::new();

    leagues_info.nba.iter().for_each(|league| league_keys.push(&league.league_key));
    leagues_info.nfl.iter().for_each(|league| league_keys.push(&league.league_key));
    leagues_info.nhl.iter().for_each(|league| league_keys.push(&league.league_key));

    let mut stats = LeagueStats {
        nfl: Vec::new(),
        nba: Vec::new(),
        nhl: Vec::new(),
    };

    let mut new_tokens: Option<(String, String)> = None;

    for league_key in league_keys {
        let tokens_to_use = if let Some(tkns) = new_tokens.clone() {
            let mut tokens_clone = tokens.clone();
            tokens_clone.access_token = SecretString::new(tkns.0.into_boxed_str());
            tokens_clone.refresh_token = Some(SecretString::new(tkns.1.into_boxed_str()));

            tokens_clone
        } else {
            tokens.clone()
        };

        let (league_data, opt_tokens) = make_request(&format!("/league/{league_key}/settings"), client.clone(), &tokens_to_use, 2).await?;

        if let Some(t) = opt_tokens {
            new_tokens = Some(t);
        }
        
        let cleaned: xml_settings::FantasyContent = serde_xml_rs::from_str(&league_data)?;
        let game_code = cleaned.league.game_code;
        let stat = cleaned.league.settings.stat_categories.stats.stat;

        match game_code.as_str() {
            "nfl" => stats.nfl.push(stat),
            "nba" => stats.nba.push(stat),
            "nhl" => stats.nhl.push(stat),
            _ => ()
        }
    }

    return Ok((stats, new_tokens));
}

pub async fn get_matchups(team_key: &str, client: Client, tokens: &Tokens) -> anyhow::Result<(Matchups, Option<(String, String)>)> {
    let url = format!("/team/{team_key}/matchups");

    let (matchup_info, opt_tokens) = make_request(&url, client, tokens, 2).await?;

    let parsed: xml_matchups::FantasyContent = serde_xml_rs::from_str(&matchup_info)?;

    let mut output = Matchups {
        completed_matches: Vec::new(),
        active_matches: Vec::new(),
        future_matches: Vec::new(),
    };

    for matchup in parsed.team.matchups.matchup {
        let matchup_formatted = {
            let mut data = Vec::new();

            for mtch in matchup.teams.team {
                data.push(
                    MatchupTeam {
                        team_key: mtch.team_key,
                        team_name: mtch.name,
                        team_points: mtch.team_points.total,
                    }
                );
            }

            data
        };

        match matchup.status.as_str() {
            "postevent" => {
                output.completed_matches.push(Matchup { teams: matchup_formatted });
            }

            "midevent" => {
                output.active_matches.push(Matchup { teams: matchup_formatted });
            }

            "preevent" => {
                output.future_matches.push(Matchup { teams: matchup_formatted });
            }

            _ => ()
        }
    }

    return Ok((output, opt_tokens));
}