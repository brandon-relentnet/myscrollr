use std::{sync::Arc, fs, time::Duration};
use reqwest::Client;
use tokio::sync::Mutex;
use crate::log::{error, info, warn};
use crate::database::{
    PgPool, create_tables, get_tracked_feeds, seed_tracked_feeds,
    upsert_rss_item, cleanup_old_articles, FeedConfig, TrackedFeed, ParsedArticle,
};
pub use crate::types::RssHealth;

pub mod log;
pub mod database;
pub mod types;

pub async fn start_rss_service(pool: Arc<PgPool>, health_state: Arc<Mutex<RssHealth>>) {
    info!("Starting RSS service...");

    if let Err(e) = create_tables(&pool).await {
        error!("Failed to create database tables: {}", e);
        return;
    }

    // Always upsert default feeds from config on startup (ON CONFLICT DO NOTHING
    // ensures existing feeds and user customizations are never overwritten)
    match fs::read_to_string("./configs/feeds.json") {
        Ok(file_contents) => match serde_json::from_str::<Vec<FeedConfig>>(&file_contents) {
            Ok(config) => {
                info!("Upserting {} default feeds from configs/feeds.json...", config.len());
                if let Err(e) = seed_tracked_feeds(pool.clone(), config).await {
                    error!("Failed to seed default feeds: {}", e);
                }
            }
            Err(e) => error!("Failed to parse configs/feeds.json: {}", e),
        },
        Err(e) => warn!("configs/feeds.json not found: {}", e),
    }

    let feeds = get_tracked_feeds(pool.clone()).await;

    if feeds.is_empty() {
        error!("No feeds to track. RSS service idling.");
        return;
    }

    // Reset per-cycle counters
    health_state.lock().await.reset_cycle();

    info!("Polling {} RSS feeds...", feeds.len());
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("MyScrollr RSS Bot/1.0")
        .build()
        .unwrap_or_else(|_| Client::new());

    for feed in feeds {
        let client = client.clone();
        let pool = pool.clone();
        let health = health_state.clone();
        let feed_name = feed.name.clone();
        let feed_url = feed.url.clone();

        // Spawn each feed poll as its own task so that a panic in one feed
        // (e.g. from an unexpected parser issue) cannot kill the entire cycle
        let handle = tokio::task::spawn(async move {
            poll_feed(&client, &pool, &feed).await
        });

        match handle.await {
            Ok(Ok(count)) => {
                health.lock().await.record_success(count as u64);
            }
            Ok(Err(e)) => {
                error!("Error polling feed {} ({}): {}", feed_name, feed_url, e);
                health.lock().await.record_error(format!("{}: {}", feed_name, e));
            }
            Err(panic_err) => {
                error!("PANIC polling feed {} ({}): {}", feed_name, feed_url, panic_err);
                health.lock().await.record_error(format!("PANIC: {}", feed_name));
            }
        }
    }

    // Cleanup old articles (older than 7 days)
    match cleanup_old_articles(&pool).await {
        Ok(deleted) if deleted > 0 => {
            info!("Cleaned up {} old RSS articles", deleted);
        }
        Ok(_) => {} // Nothing to clean
        Err(e) => {
            warn!("Failed to cleanup old articles: {}", e);
        }
    }

    let health = health_state.lock().await;
    info!(
        "RSS poll cycle complete: {} feeds polled, {} items ingested, {} errors",
        health.feeds_polled, health.items_ingested, health.error_count
    );
}

async fn poll_feed(client: &Client, pool: &Arc<PgPool>, feed: &TrackedFeed) -> anyhow::Result<usize> {
    let response = client.get(&feed.url).send().await?;
    let bytes = response.bytes().await?;

    let parsed = feed_rs::parser::parse(&bytes[..])?;

    let mut count = 0;
    for entry in parsed.entries {
        let guid = entry.id.clone();
        // Skip entries with empty GUIDs
        if guid.is_empty() {
            continue;
        }

        let title = entry.title
            .map(|t| t.content)
            .unwrap_or_default();

        // Skip entries with no title
        if title.is_empty() {
            continue;
        }

        let link = entry.links
            .first()
            .map(|l| l.href.clone())
            .unwrap_or_default();

        let description = entry.summary
            .map(|s| s.content)
            .or_else(|| entry.content.and_then(|c| c.body))
            .unwrap_or_default();

        // Truncate description to 500 characters (char-based to avoid
        // panicking on multi-byte UTF-8 sequences like smart quotes)
        let description = if description.chars().count() > 500 {
            let mut truncated: String = description.chars().take(500).collect();
            truncated.push_str("...");
            truncated
        } else {
            description
        };

        // Strip HTML tags from description (basic approach)
        let description = strip_html_tags(&description);

        let published_at = entry.published
            .or(entry.updated)
            .map(|dt| dt.with_timezone(&chrono::Utc));

        let source_name = parsed.title
            .as_ref()
            .map(|t| t.content.clone())
            .unwrap_or_else(|| feed.name.clone());

        let article = ParsedArticle {
            feed_url: feed.url.clone(),
            guid,
            title,
            link,
            description,
            source_name,
            published_at,
        };

        if let Err(e) = upsert_rss_item(pool.clone(), article).await {
            warn!("Failed to upsert RSS item from {}: {}", feed.name, e);
            continue;
        }

        count += 1;
    }

    Ok(count)
}

/// Basic HTML tag stripper — removes angle-bracketed tags.
fn strip_html_tags(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_tag = false;

    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }

    // Collapse multiple whitespace and trim
    let collapsed: String = result.split_whitespace().collect::<Vec<&str>>().join(" ");
    collapsed
}
