use axum::{routing::get, Router, Json, extract::State};
use dotenv::dotenv;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use sports_service::{
    init_sports_service, poll_live, poll_schedule, poll_standings, poll_teams,
    SportsHealth, RateLimiter,
    log::init_async_logger, database::initialize_pool,
};

#[derive(Clone)]
struct AppState {
    health: Arc<Mutex<SportsHealth>>,
}

/// Interval for the schedule poll (upcoming games + cleanup).
const SCHEDULE_POLL_SECS: u64 = 30 * 60; // 30 minutes

#[tokio::main]
async fn main() {
    dotenv().ok();
    let _ = init_async_logger("./logs");

    let health = Arc::new(Mutex::new(SportsHealth::new()));

    // Cancellation token for coordinated shutdown
    let cancel = CancellationToken::new();

    // Start HTTP server immediately so K8s startup probes pass
    let state = AppState { health: health.clone() };
    let app = Router::new()
        .route("/health", get(health_handler))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("Sports Service listening on {} (connecting to DB...)", addr);

    // Spawn background task for DB connection + service init
    let health_bg = health.clone();
    let cancel_bg = cancel.clone();
    tokio::spawn(async move {
        let mut retries = 5;
        let pool = loop {
            match initialize_pool().await {
                Ok(p) => break Arc::new(p),
                Err(e) => {
                    if retries == 0 {
                        eprintln!("[FATAL] Failed to init DB after retries: {}", e);
                        return;
                    }
                    eprintln!("[DB] Failed to connect, retrying in 2s... ({} attempts left) Error: {}", retries, e);
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    retries -= 1;
                }
            }
        };

        // ── Initialize service (tables, migrations, seeding) ─────────────
        let (client, leagues) = match init_sports_service(&pool).await {
            Some(result) => result,
            None => {
                println!("Sports service initialization failed. Serving health endpoint only.");
                return;
            }
        };

        // Pro plan: 7,500 requests/day per sport API. Each sport host
        // (basketball, football, hockey, etc.) has its own independent budget.
        let sports: Vec<String> = leagues
            .iter()
            .map(|l| l.sport_api.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        let rate_limiter = Arc::new(RateLimiter::new(&sports, 7500));

        let client = Arc::new(client);
        let leagues = Arc::new(leagues);

        // ── Fast poll: live scores (today only, 30s live / 1min idle) ─────
        let pool_live = pool.clone();
        let client_live = client.clone();
        let leagues_live = leagues.clone();
        let health_live = health_bg.clone();
        let rl_live = rate_limiter.clone();
        let cancel_live = cancel_bg.clone();
        tokio::spawn(async move {
            println!("Starting live poll loop (adaptive intervals)...");
            loop {
                tokio::select! {
                    _ = cancel_live.cancelled() => {
                        println!("Live poll loop shutting down...");
                        break;
                    }
                    _ = async {
                        poll_live(&pool_live, &client_live, &leagues_live, &health_live, &rl_live).await;

                        // Adaptive interval: poll more frequently when there are live games
                        let interval = {
                            let h = health_live.lock().await;
                            if h.leagues_live > 0 {
                                30  // 30s when live games are happening
                            } else {
                                60  // 1 min when no live games
                            }
                        };

                        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                    } => {}
                }
            }
        });

        // ── Slow poll: schedule + cleanup (today + 7 days, every 30 min) ──
        let pool_sched = pool.clone();
        let client_sched = client.clone();
        let leagues_sched = leagues.clone();
        let rl_sched = rate_limiter.clone();
        let cancel_sched = cancel_bg.clone();
        tokio::spawn(async move {
            println!("Starting schedule poll loop (every {} min)...", SCHEDULE_POLL_SECS / 60);
            // Run immediately on startup to populate the schedule
            poll_schedule(&pool_sched, &client_sched, &leagues_sched, &rl_sched).await;
            loop {
                tokio::select! {
                    _ = cancel_sched.cancelled() => {
                        println!("Schedule poll loop shutting down...");
                        break;
                    }
                    _ = async {
                        tokio::time::sleep(std::time::Duration::from_secs(SCHEDULE_POLL_SECS)).await;
                        poll_schedule(&pool_sched, &client_sched, &leagues_sched, &rl_sched).await;
                    } => {}
                }
            }
        });

        // ── Daily poll: standings (every 24 hours) ───────────────────────
        let pool_standings = pool.clone();
        let client_standings = client.clone();
        let leagues_standings = leagues.clone();
        let rl_standings = rate_limiter.clone();
        let cancel_standings = cancel_bg.clone();
        tokio::spawn(async move {
            println!("Starting standings poll loop (daily)...");
            poll_standings(&pool_standings, &client_standings, &leagues_standings, &rl_standings).await;
            loop {
                tokio::select! {
                    _ = cancel_standings.cancelled() => {
                        println!("Standings poll loop shutting down...");
                        break;
                    }
                    _ = async {
                        tokio::time::sleep(std::time::Duration::from_secs(86400)).await;
                        poll_standings(&pool_standings, &client_standings, &leagues_standings, &rl_standings).await;
                    } => {}
                }
            }
        });

        // ── Weekly poll: teams (every 7 days) ────────────────────────────
        let pool_teams = pool.clone();
        let client_teams = client.clone();
        let leagues_teams = leagues.clone();
        let rl_teams = rate_limiter.clone();
        let cancel_teams = cancel_bg.clone();
        tokio::spawn(async move {
            println!("Starting teams poll loop (weekly)...");
            poll_teams(&pool_teams, &client_teams, &leagues_teams, &rl_teams).await;
            loop {
                tokio::select! {
                    _ = cancel_teams.cancelled() => {
                        println!("Teams poll loop shutting down...");
                        break;
                    }
                    _ = async {
                        tokio::time::sleep(std::time::Duration::from_secs(604800)).await;
                        poll_teams(&pool_teams, &client_teams, &leagues_teams, &rl_teams).await;
                    } => {}
                }
            }
        });
    });

    let cancel_for_shutdown = cancel.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            println!("Sports Service received shutdown signal");
            cancel_for_shutdown.cancel();
        })
        .await
        .unwrap();

    println!("Sports Service shut down gracefully");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn health_handler(State(state): State<AppState>) -> Json<SportsHealth> {
    let health = state.health.lock().await.get_health();
    Json(health)
}
