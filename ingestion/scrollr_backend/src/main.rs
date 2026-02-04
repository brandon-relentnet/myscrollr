use std::{env, net::{IpAddr, Ipv4Addr, SocketAddr}, path::PathBuf, sync::Arc};

use axum::{Json, Router, extract::{Path, Query, State}, http::{HeaderMap, HeaderValue, StatusCode, header::{self, REFERRER_POLICY}}, response::{Html, IntoResponse, Redirect, Response}, routing::get};
use axum_extra::extract::{CookieJar, cookie::{Cookie, SameSite}};
use axum_server::tls_rustls::RustlsConfig;
use futures_util::{StreamExt, future::join_all};
use dotenv::dotenv;
use rcgen::generate_simple_self_signed;
use scrollr_backend::{ErrorCodeResponse, RefreshBody, ServerState, get_access_token, update_tokens};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_rustls_acme::{AcmeConfig, caches::DirCache, tokio_rustls::rustls::ServerConfig};
use tower_http::{cors::{self, AllowOrigin, CorsLayer}, set_header::SetRequestHeaderLayer};
use scrollr_backend::log::{error, info, init_async_logger, warn};
use yahoo_fantasy::{api::{debug_league_stats, get_league_standings, get_matchups, get_team_roster, get_user_leagues}, exchange_for_token, stats::{BasketballStats, FootballStats, HockeyStats, StatDecode}, types::{LeagueStandings, Roster, Tokens}, yahoo};
use redis::Cmd;

#[tokio::main]
async fn main() {
    dotenv().ok();
    rustls::crypto::ring::default_provider().install_default().expect("Failed to install rustls crypto provider");
    let handles: Vec<tokio::task::JoinHandle<()>> = Vec::new();

    match init_async_logger("./logs") {
        Ok(_) => info!("Async logging initialized successfully"),
        Err(e) => eprintln!("Failed to set logger: {}", e)
    }

    // Check if ACME should be enabled (defaults to true for backwards compatibility)
    let acme_enabled = env::var("ACME_ENABLED")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase() == "true";

    let web_state = ServerState::new().await;

    let app = Router::new()
        .route("/yahoo/health", get(yahoo_health))
        .route("/yahoo/start", get(get_yahoo_handler))
        .route("/yahoo/callback", get(yahoo_callback))
        .route("/yahoo/leagues", get(user_leagues).post(user_leagues))
        .route("/yahoo/league/{league_key}/standings", get(league_standings).post(league_standings))
        .route("/yahoo/team/{teamKey}/roster", get(team_roster).post(team_roster))
        .route("/yahoo/team/{teamKey}/matchups", get(team_matchups).post(team_matchups))
        .route("/yahoo/debug/stats", get(get_debug_league_stats))
        .route("/health", get(|| async { "Hello, World!" }))
        .layer(
            SetRequestHeaderLayer::if_not_present(
                header::HeaderName::from_static("x-frame-options"),
                HeaderValue::from_static("DENY")
            )
        )
        .layer(
            CorsLayer::new()
                .allow_methods(cors::Any)
                .allow_headers(cors::Any)
                .allow_origin(AllowOrigin::list([
                    "https://myscrollr.com".parse().unwrap(),
                    "https://dev.olvyx.com".parse().unwrap(),
                    "https://api.enanimate.dev".parse().unwrap(),
                ]))
        )
        .with_state(web_state);

    let ipv4_addr = Ipv4Addr::from([0, 0, 0, 0]);
    let addr = SocketAddr::new(IpAddr::V4(ipv4_addr), 8443);

    info!("Listening on address: {}", addr);
    let domain_name = env::var("DOMAIN_NAME").expect("DOMAIN_NAME must be set");

    if acme_enabled {
        info!("ACME certificate acquisition enabled");
        let contact_email = env::var("CONTACT_EMAIL").expect("CONTACT_EMAIL must be set when ACME_ENABLED=true");
        let cache_dir = PathBuf::from("./acme_cache");

        let mut state = AcmeConfig::new(vec![domain_name])
            .contact(vec![format!("mailto:{}", contact_email)])
            .cache_option(Some(cache_dir).map(DirCache::new))
            .directory_lets_encrypt(true)
            .state();

        let rustls_config = ServerConfig::builder()
            .with_no_client_auth()
            .with_cert_resolver(state.resolver());
        let acceptor = state.axum_acceptor(Arc::new(rustls_config));

        tokio::spawn(async move {
            loop {
                match state.next().await.expect("ACME Error") {
                    Ok(ok) => info!("event: {:?}", ok),
                    Err(err) => error!("error: {:?}", err),
                }
            }
        });

        axum_server::bind(addr)
            .acceptor(acceptor)
            .serve(app.into_make_service())
            .await
            .expect("Failed to bind to port");
    } else {
        info!("ACME certificate acquisition disabled - using self-signed certificates");

        let subject_alt_names = vec![domain_name.clone(), "localhost".to_string(), "127.0.0.1".to_string()];
        let cert_key = generate_simple_self_signed(subject_alt_names)
            .expect("Failed to generate self-signed certificate");

        let cert_pem = cert_key.cert.pem();
        let key_pem = cert_key.key_pair.serialize_pem();

        let rustls_config = RustlsConfig::from_pem(
            cert_pem.as_bytes().to_vec(), 
            key_pem.as_bytes().to_vec()
        )
        .await
        .expect("Failed to create rustls config");

        axum_server::bind_rustls(addr, rustls_config)
            .serve(app.into_make_service())
            .await
            .expect("Failed to start server");
    }

    join_all(handles).await;

    println!("Closing...")
}

#[axum::debug_handler]
async fn get_yahoo_handler(State(web_state): State<ServerState>) -> Response {
    // Clean up expired CSRF tokens
    web_state.cleanup_expired_csrf_tokens().await;

    // Clone values to avoid holding borrows across await points
    let client_id = web_state.client_id.clone();
    let client_secret = web_state.client_secret.expose_secret().to_string();
    let callback_url = web_state.yahoo_callback.clone();

    let (redirect_url, csrf_token) = match yahoo(client_id, client_secret, callback_url).await {
        Ok(data) => data,
        Err(e) => {
            error!("Yahoo auth initiation failed: {}", e);
            return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to initiate authentication");
        }
    };

    // Store CSRF token in Redis with 10 minute expiration
    {
        let mut conn = match web_state.redis_pool.get().await {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to get Redis connection: {}", e);
                return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
            }
        };

        let key = format!("csrf:{}", csrf_token);
        let _: () = match Cmd::set_ex(&key, "1", 600).query_async(&mut *conn).await {
            Ok(v) => v,
            Err(e) => {
                error!("Failed to store CSRF token in Redis: {}", e);
                return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
            }
        };
    }

    let mut response = Redirect::temporary(&redirect_url).into_response();

    response.headers_mut().insert(
        REFERRER_POLICY,
        HeaderValue::from_static("no-referrer")
    );

    response
}

#[derive(Deserialize)]
struct CodeResponse {
    code: String,
    state: String,
}

async fn yahoo_callback(Query(tokens): Query<CodeResponse>, State(web_state): State<ServerState>, jar: CookieJar) -> Response {
    // Validate CSRF token via Redis
    {
        let mut conn = match web_state.redis_pool.get().await {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to get Redis connection: {}", e);
                return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
            }
        };

        let key = format!("csrf:{}", tokens.state);
        let exists: bool = match Cmd::del(&key).query_async(&mut *conn).await {
            Ok(count) => {
                let count: i32 = count;
                count > 0
            },
            Err(e) => {
                error!("Failed to check/delete CSRF token in Redis: {}", e);
                return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
            }
        };

        if !exists {
            error!("Invalid or expired CSRF token received: {}", tokens.state);
            return ErrorCodeResponse::new(StatusCode::BAD_REQUEST, "Invalid or expired CSRF token");
        }
    }

    // Clone values to avoid holding borrows across await points
    let client_id = web_state.client_id.clone();
    let client_secret = web_state.client_secret.expose_secret().to_string();
    let callback_url = web_state.yahoo_callback.clone();

    let tokens_option = exchange_for_token(
        tokens.code,
        client_id,
        client_secret,
        tokens.state,
        callback_url
    ).await;

    let tokens = match tokens_option {
        Some(t) => t,
        None => {
            error!("Failed to exchange authorization code for tokens");
            return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve tokens");
        }
    };

    let access_token = tokens.access_token.expose_secret().to_string();
    let refresh_token = tokens.refresh_token
        .as_ref()
        .map(|t| t.expose_secret().to_string())
        .unwrap_or_default();

    let cookie_auth = Cookie::build(("yahoo-auth", access_token.clone()))
        .path("/yahoo")
        .secure(true)
        .http_only(true) 
        .same_site(SameSite::Lax)
        .build();

    let cookie_refresh = Cookie::build(("yahoo-refresh", refresh_token.clone()))
        .path("/yahoo")
        .secure(true)
        .http_only(true)
        .same_site(SameSite::Lax)
        .build();

    let html_content = format!(
        r###"<!doctype html><html><head><meta charset="utf-8"><title>Auth Complete</title></head>
            <body style="font-family: ui-sans-serif, system-ui;">
                <script>
                (function() {{ 
                    try {{ 
                        if (window.opener) {{ 
                            // POST MESSAGE: Sending the access token back to the main app window
                            window.opener.postMessage({{ 
                                type: 'yahoo-auth', 
                                accessToken: {0},
                                refreshToken: {1}
                            }}, '*'); 
                        }}
                    }} catch(e) {{ 
                        console.error("Error sending token via postMessage:", e);
                    }}
                    // Always close the popup window after a brief delay
                    setTimeout(function(){{ window.close(); }}, 1500);
                }})();
                </script>
                <p>Authentication successful. You can close this window.</p>
            </body></html>"###,
        serde_json::to_string(&access_token).unwrap_or_else(|_| "\"error\"".to_string()),
        serde_json::to_string(&refresh_token).unwrap_or_else(|_| "\"error\"".to_string()),
    );
    let cookies = jar.add(cookie_auth).add(cookie_refresh);

    // Update Yahoo health with successful OAuth
    {
        let mut health = web_state.yahoo_health.lock().await;
        health.update_oauth_status(true);
    }

    (cookies, Html(html_content)).into_response()
}

async fn user_leagues(jar: CookieJar, State(web_state): State<ServerState>, headers: HeaderMap, refresh_token: Option<Json<RefreshBody>>) -> Response {
    let token_option = get_access_token(jar.clone(), headers, web_state.clone(), refresh_token);

    if token_option.is_none() { return ErrorCodeResponse::new(StatusCode::UNAUTHORIZED, "Unauthorized, missing access_token"); }

    let initial_tokens = token_option.unwrap();

    let response = get_user_leagues(&initial_tokens, web_state.client).await;

    if let Err(e) = response {
        error!("Error fetching leagues for user: {}", e);
        web_state.yahoo_health.lock().await.record_error(format!("get_user_leagues error: {}", e));
        return ErrorCodeResponse::new(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch leagues: {}", e).as_str());
    }

    let (leagues, new_tokens) = response.unwrap();
    let mut headers = HeaderMap::new();
    let updated_cookies = update_tokens(&mut headers, jar, new_tokens, &initial_tokens.access_type);

    web_state.yahoo_health.lock().await.record_successful_call();

    (headers, updated_cookies, Json(leagues)).into_response()
}

async fn league_standings(Path(league_key): Path<String>, jar: CookieJar, State(web_state): State<ServerState>, headers: HeaderMap, refresh_token: Option<Json<RefreshBody>>) -> Response {
    let token_option = get_access_token(jar.clone(), headers, web_state.clone(), refresh_token);
    if token_option.is_none() { return ErrorCodeResponse::new(StatusCode::UNAUTHORIZED, "Unauthorized, missing access_token"); }

    let initial_tokens = token_option.unwrap();

    let response = get_league_standings(&league_key, web_state.client, &initial_tokens).await;

    if let Err(e) = response {
        error!("Error fetching standings for {}: {}", league_key, e);
        web_state.yahoo_health.lock().await.record_error(format!("get_league_standings error for {}: {}", league_key, e));
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let (standings, new_tokens) = response.unwrap();
    let mut headers = HeaderMap::new();
    let updated_cookies = update_tokens(&mut headers, jar, new_tokens, &initial_tokens.access_type);

    web_state.yahoo_health.lock().await.record_successful_call();

    #[derive(Serialize)]
    struct Standings {
        standings: Vec<LeagueStandings>,
    }

    (headers, updated_cookies, Json(Standings { standings })).into_response()
}

#[derive(Deserialize)]
struct RosterQuery {
    date: Option<String>,
    sport: String,
}

async fn team_roster(Query(query): Query<RosterQuery>, Path(team_key): Path<String>, jar: CookieJar, State(web_state): State<ServerState>, headers: HeaderMap, refresh_token: Option<Json<RefreshBody>>) -> Response {
    let token_option = get_access_token(jar.clone(), headers, web_state.clone(), refresh_token);
    if token_option.is_none() { return ErrorCodeResponse::new(StatusCode::UNAUTHORIZED, "Unauthorized, missing access_token"); }

    let initial_tokens = token_option.unwrap();

    fn create_response<T>(roster_vec: Vec<Roster<T>>, jar: CookieJar, new_tokens: Option<(String, String)>, inital_tokens: Tokens) -> Response 
    where 
        T: StatDecode + std::fmt::Display + serde::Serialize,
        <T as TryFrom<u32>>::Error: std::fmt::Display
    {
        let mut headers = HeaderMap::new();
        let updated_cookies = update_tokens(&mut headers, jar, new_tokens, &inital_tokens.access_type);

        let response_json = json!({
            "roster": roster_vec,
        });

        (headers, updated_cookies, Json(response_json)).into_response()
    }

    let result = match query.sport.as_str() {
        "nfl" | "football" => {
            let response = get_team_roster::<FootballStats>(&team_key, web_state.client.clone(), &initial_tokens, query.date.clone()).await;
            match response {
                Ok((roster, new_tokens)) => Ok(create_response(roster, jar.clone(), new_tokens, initial_tokens.clone())),
                Err(e) => Err(e)
            }
        }

        "nba" | "basketball" => {
            let response = get_team_roster::<BasketballStats>(&team_key, web_state.client.clone(), &initial_tokens, query.date.clone()).await;
            match response {
                Ok((roster, new_tokens)) => Ok(create_response(roster, jar.clone(), new_tokens, initial_tokens.clone())),
                Err(e) => Err(e)
            }
        }

        "nhl" | "hockey" => {
            let response = get_team_roster::<HockeyStats>(&team_key, web_state.client.clone(), &initial_tokens, query.date.clone()).await;
            match response {
                Ok((roster, new_tokens)) => Ok(create_response(roster, jar.clone(), new_tokens, initial_tokens.clone())),
                Err(e) => Err(e)
            }
        }

        _ => {
            error!("Unsupported sport type: {}", query.sport);
            return StatusCode::BAD_REQUEST.into_response();
        }
    };

    if let Err(e) = result {
        let error_msg = e.to_string();

        // Check if this is a sport validation error and auto-retry with correct sport
        if error_msg.contains("Sport validation failed") {
            // Extract the correct sport from the URL in the error message
            let correct_sport = if error_msg.contains("football.fantasysports.yahoo.com") {
                Some("football")
            } else if error_msg.contains("basketball.fantasysports.yahoo.com") {
                Some("basketball")
            } else if error_msg.contains("hockey.fantasysports.yahoo.com") {
                Some("hockey")
            } else {
                None
            };

            if let Some(sport) = correct_sport {
                warn!("Sport mismatch detected. Auto-retrying with correct sport: {}, team_key: {}", sport, team_key);

                // Retry with the correct sport
                let retry_result = match sport {
                    "football" => {
                        get_team_roster::<FootballStats>(&team_key, web_state.client, &initial_tokens, query.date).await
                            .map(|(roster, new_tokens)| create_response(roster, jar, new_tokens, initial_tokens))
                    }
                    "basketball" => {
                        get_team_roster::<BasketballStats>(&team_key, web_state.client, &initial_tokens, query.date).await
                            .map(|(roster, new_tokens)| create_response(roster, jar, new_tokens, initial_tokens))
                    }
                    "hockey" => {
                        get_team_roster::<HockeyStats>(&team_key, web_state.client, &initial_tokens, query.date).await
                            .map(|(roster, new_tokens)| create_response(roster, jar, new_tokens, initial_tokens))
                    }
                    _ => unreachable!()
                };

                return match retry_result {
                    Ok(mut response) => {
                        // Add a warning header to inform the client about the auto-correction
                        let headers = response.headers_mut();
                        let _ = headers.insert(
                            "X-Sport-Auto-Corrected",
                            HeaderValue::from_str(&format!("Requested '{}' but team plays '{}'", query.sport, sport)).unwrap_or(HeaderValue::from_static("true"))
                        );
                        web_state.yahoo_health.lock().await.record_successful_call();
                        response
                    }
                    Err(retry_err) => {
                        error!("Retry failed for {} with correct sport {}: {}", team_key, sport, retry_err);
                        web_state.yahoo_health.lock().await.record_error(format!("get_team_roster retry failed for {}: {}", team_key, retry_err));
                        StatusCode::INTERNAL_SERVER_ERROR.into_response()
                    }
                };
            }

            // If we couldn't detect the sport, return the validation error
            return ErrorCodeResponse::new(
                StatusCode::BAD_REQUEST,
                &error_msg
            );
        }

        error!("Error fetching roster for {}: {}", team_key, e);
        web_state.yahoo_health.lock().await.record_error(format!("get_team_roster error for {}: {}", team_key, e));
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    web_state.yahoo_health.lock().await.record_successful_call();
    result.unwrap()
}

async fn get_debug_league_stats(jar: CookieJar, State(web_state): State<ServerState>, headers: HeaderMap, refresh_token: Option<Json<RefreshBody>>) -> Response {
    let token_option = get_access_token(jar.clone(), headers, web_state.clone(), refresh_token);
    if token_option.is_none() { return ErrorCodeResponse::new(StatusCode::UNAUTHORIZED, "Unauthorized, missing access_token"); }

    let initial_tokens = token_option.unwrap();

    let response = debug_league_stats(web_state.client, &initial_tokens).await;

    if let Err(e) = response {
        error!("Error fetching league_stats: {}", e);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let (stats, new_tokens) = response.unwrap();
    let mut headers = HeaderMap::new();
    let updated_cookies = update_tokens(&mut headers, jar, new_tokens, &initial_tokens.access_type);

    (headers, updated_cookies, Json(stats)).into_response()
}

async fn yahoo_health(State(web_state): State<ServerState>) -> impl IntoResponse {
    let health = web_state.yahoo_health.lock().await.get_health();

    Json(health)
}

async fn team_matchups(Path(team_key): Path<String>, jar: CookieJar, State(web_state): State<ServerState>, headers: HeaderMap, refresh_token: Option<Json<RefreshBody>>) -> Response {
    let token_option = get_access_token(jar.clone(), headers, web_state.clone(), refresh_token);
    if token_option.is_none() { return ErrorCodeResponse::new(StatusCode::UNAUTHORIZED, "Unauthorized, missing access_token"); }

    let initial_tokens = token_option.unwrap();
    let response = get_matchups(&team_key, web_state.client, &initial_tokens).await;

    if let Err(e) = response {
        error!("Error fetching matchups for {}: {}", team_key, e);
        web_state.yahoo_health.lock().await.record_error(format!("get_matchups error for {}: {}", team_key, e));
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let (matchups, new_tokens) = response.unwrap();
    let mut headers = HeaderMap::new();
    let updated_cookies = update_tokens(&mut headers, jar, new_tokens, &initial_tokens.access_type);

    web_state.yahoo_health.lock().await.record_successful_call();

    (headers, updated_cookies, Json(matchups)).into_response()
}