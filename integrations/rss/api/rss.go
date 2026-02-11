package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// =============================================================================
// Constants
// =============================================================================

const (
	// CacheKeyRSSPrefix is the Redis key prefix for per-user RSS item caches.
	CacheKeyRSSPrefix = "cache:rss:"

	// CacheKeyRSSCatalog is the Redis key for the cached feed catalog.
	CacheKeyRSSCatalog = "cache:rss:catalog"

	// RSSItemsCacheTTL is how long per-user RSS items are cached.
	RSSItemsCacheTTL = 60 * time.Second

	// RSSCatalogCacheTTL is how long the feed catalog is cached.
	RSSCatalogCacheTTL = 5 * time.Minute

	// DefaultRSSItemsLimit caps the number of RSS items returned for dashboard.
	DefaultRSSItemsLimit = 50

	// MaxConsecutiveFailures is the threshold above which feeds are excluded
	// from the catalog.
	MaxConsecutiveFailures = 3

	// RedisRSSSubscribersPrefix is the Redis key prefix for per-feed-URL
	// subscriber sets.
	RedisRSSSubscribersPrefix = "rss:subscribers:"
)

// =============================================================================
// App
// =============================================================================

// App holds the shared dependencies for all handlers.
type App struct {
	db  *pgxpool.Pool
	rdb *redis.Client
}

// =============================================================================
// Public Routes (proxied by core gateway)
// =============================================================================

// getRSSFeedCatalog returns all enabled tracked feeds for the dashboard
// catalog browser.
func (a *App) getRSSFeedCatalog(c *fiber.Ctx) error {
	var catalog []TrackedFeed
	if GetCache(a.rdb, CacheKeyRSSCatalog, &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	rows, err := a.db.Query(context.Background(),
		fmt.Sprintf("SELECT url, name, category, is_default, consecutive_failures, last_error, last_success_at FROM tracked_feeds WHERE is_enabled = true AND consecutive_failures < %d ORDER BY category, name", MaxConsecutiveFailures))
	if err != nil {
		log.Printf("[RSS] Catalog query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch feed catalog",
		})
	}
	defer rows.Close()

	catalog = make([]TrackedFeed, 0)
	for rows.Next() {
		var f TrackedFeed
		if err := rows.Scan(&f.URL, &f.Name, &f.Category, &f.IsDefault, &f.ConsecutiveFailures, &f.LastError, &f.LastSuccessAt); err != nil {
			log.Printf("[RSS] Catalog scan error: %v", err)
			continue
		}
		catalog = append(catalog, f)
	}

	SetCache(a.rdb, CacheKeyRSSCatalog, catalog, RSSCatalogCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// deleteCustomFeed removes a non-default feed from the catalog.
// The core gateway sets X-User-Sub header for authenticated requests.
// Only the user who added the feed (added_by) can delete it.
func (a *App) deleteCustomFeed(c *fiber.Ctx) error {
	userSub := c.Get("X-User-Sub")
	if userSub == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
			Status: "unauthorized",
			Error:  "Authentication required",
		})
	}

	var req struct {
		URL string `json:"url"`
	}
	if err := c.BodyParser(&req); err != nil || req.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Request body must include a non-empty 'url' field",
		})
	}

	var isDefault bool
	var addedBy *string
	err := a.db.QueryRow(context.Background(),
		"SELECT is_default, added_by FROM tracked_feeds WHERE url = $1", req.URL).Scan(&isDefault, &addedBy)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(ErrorResponse{
			Status: "error",
			Error:  "Feed not found in catalog",
		})
	}
	if isDefault {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Status: "error",
			Error:  "Cannot delete a built-in default feed",
		})
	}
	// Only the user who added the feed can delete it
	if addedBy != nil && *addedBy != userSub {
		return c.Status(fiber.StatusForbidden).JSON(ErrorResponse{
			Status: "error",
			Error:  "You can only delete feeds that you added",
		})
	}

	_, _ = a.db.Exec(context.Background(), "DELETE FROM rss_items WHERE feed_url = $1", req.URL)
	_, err = a.db.Exec(context.Background(), "DELETE FROM tracked_feeds WHERE url = $1 AND is_default = false", req.URL)
	if err != nil {
		log.Printf("[RSS] Failed to delete custom feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}

	a.rdb.Del(context.Background(), RedisRSSSubscribersPrefix+req.URL)
	a.rdb.Del(context.Background(), CacheKeyRSSCatalog)

	log.Printf("[RSS] User %s deleted custom feed: %s", userSub, req.URL)
	return c.JSON(fiber.Map{"status": "ok", "message": "Custom feed deleted"})
}

// healthHandler proxies a health check to the internal Rust RSS ingestion service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, os.Getenv("INTERNAL_RSS_URL"))
}

// =============================================================================
// Internal Routes (called by core gateway)
// =============================================================================

// handleInternalCDC receives CDC records from the core gateway and returns the
// list of users who should receive these records.
//
// RSS uses per-feed-URL routing: for each CDC record, we extract the feed_url
// field and look up which users are subscribed to that specific feed via the
// Redis set rss:subscribers:{feed_url}. The returned user list is the union
// of all subscribers across all feed URLs in the batch.
func (a *App) handleInternalCDC(c *fiber.Ctx) error {
	var req struct {
		Records []CDCRecord `json:"records"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()
	userSet := make(map[string]bool)

	for _, rec := range req.Records {
		feedURL, ok := rec.Record["feed_url"].(string)
		if !ok || feedURL == "" {
			continue
		}
		subs, err := GetSubscribers(a.rdb, ctx, RedisRSSSubscribersPrefix+feedURL)
		if err != nil {
			log.Printf("[RSS CDC] Failed to get subscribers for %s: %v", feedURL, err)
			continue
		}
		for _, sub := range subs {
			userSet[sub] = true
		}
	}

	users := make([]string, 0, len(userSet))
	for sub := range userSet {
		users = append(users, sub)
	}

	return c.JSON(fiber.Map{"users": users})
}

// handleInternalDashboard returns RSS items for a user's dashboard.
// Query param: user={logto_sub}
func (a *App) handleInternalDashboard(c *fiber.Ctx) error {
	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"rss": []RssItem{}})
	}

	// Check per-user cache first
	cacheKey := CacheKeyRSSPrefix + userSub
	var items []RssItem
	if GetCache(a.rdb, cacheKey, &items) {
		return c.JSON(fiber.Map{"rss": items})
	}

	// Get user's RSS feed URLs from their stream config
	feedURLs := a.getUserRSSFeedURLs(userSub)
	if len(feedURLs) == 0 {
		return c.JSON(fiber.Map{"rss": []RssItem{}})
	}

	items = a.queryRSSItems(feedURLs)
	if items == nil {
		items = make([]RssItem, 0)
	}

	SetCache(a.rdb, cacheKey, items, RSSItemsCacheTTL)
	return c.JSON(fiber.Map{"rss": items})
}

// handleInternalHealth is a simple liveness check for the core gateway.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "healthy"})
}

// =============================================================================
// Stream Lifecycle (RSS is the ONLY integration that implements this)
// =============================================================================

// handleStreamLifecycle handles stream lifecycle events dispatched by the core
// gateway. Events: created, updated, deleted, sync.
func (a *App) handleStreamLifecycle(c *fiber.Ctx) error {
	var req struct {
		Event     string                 `json:"event"`
		User      string                 `json:"user"`
		Config    map[string]interface{} `json:"config"`
		OldConfig map[string]interface{} `json:"old_config"`
		Enabled   bool                   `json:"enabled"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Invalid request body",
		})
	}

	ctx := context.Background()

	switch req.Event {
	case "created":
		a.onStreamCreated(req.User, req.Config)

	case "updated":
		a.onStreamUpdated(ctx, req.User, req.OldConfig, req.Config)

	case "deleted":
		a.onStreamDeleted(ctx, req.User, req.Config)

	case "sync":
		a.onSyncSubscriptions(ctx, req.User, req.Config, req.Enabled)

	default:
		log.Printf("[RSS Lifecycle] Unknown event: %s", req.Event)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// onStreamCreated syncs feeds to tracked_feeds table when a new RSS stream
// is created. Runs in a goroutine so it doesn't block the response.
func (a *App) onStreamCreated(userSub string, config map[string]interface{}) {
	go a.syncRSSFeedsToTracked(userSub, config)
}

// onStreamUpdated handles feed list changes when a stream is updated.
// 1. Diffs old vs new feed URLs, removes user from stale subscriber sets
// 2. Invalidates per-user cache
// 3. Syncs new feeds to tracked_feeds
func (a *App) onStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) {
	if newConfig == nil {
		return
	}

	// Diff old vs new feed URLs and remove user from stale subscriber sets
	oldFeedURLs := extractFeedURLsFromStreamConfig(oldConfig)
	newFeedURLs := extractFeedURLsFromStreamConfig(newConfig)
	newURLSet := make(map[string]bool, len(newFeedURLs))
	for _, u := range newFeedURLs {
		newURLSet[u] = true
	}
	for _, u := range oldFeedURLs {
		if !newURLSet[u] {
			RemoveSubscriber(a.rdb, ctx, RedisRSSSubscribersPrefix+u, userSub)
		}
	}

	// Invalidate per-user RSS cache
	a.rdb.Del(ctx, CacheKeyRSSPrefix+userSub)

	// Sync new feed URLs to tracked_feeds
	go a.syncRSSFeedsToTracked(userSub, newConfig)
}

// onStreamDeleted removes the user from all per-feed-URL subscriber sets and
// invalidates per-user cache when a stream is removed.
func (a *App) onStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) {
	feedURLs := extractFeedURLsFromStreamConfig(config)
	for _, url := range feedURLs {
		RemoveSubscriber(a.rdb, ctx, RedisRSSSubscribersPrefix+url, userSub)
	}
	a.rdb.Del(ctx, CacheKeyRSSPrefix+userSub)
}

// onSyncSubscriptions adds or removes the user from per-feed-URL subscriber
// sets based on the enabled flag. Called on dashboard load to warm sets.
func (a *App) onSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) {
	feedURLs := extractFeedURLsFromStreamConfig(config)
	for _, url := range feedURLs {
		if enabled {
			AddSubscriber(a.rdb, ctx, RedisRSSSubscribersPrefix+url, userSub)
		} else {
			RemoveSubscriber(a.rdb, ctx, RedisRSSSubscribersPrefix+url, userSub)
		}
	}
}

// =============================================================================
// Database Helpers
// =============================================================================

// getUserRSSFeedURLs extracts the feed URLs from a user's RSS stream config.
func (a *App) getUserRSSFeedURLs(logtoSub string) []string {
	var configJSON []byte
	err := a.db.QueryRow(context.Background(), `
		SELECT config FROM user_streams
		WHERE logto_sub = $1 AND stream_type = 'rss'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}
	return extractFeedURLsFromConfig(configJSON)
}

// queryRSSItems fetches the latest RSS items for the given feed URLs.
func (a *App) queryRSSItems(feedURLs []string) []RssItem {
	if len(feedURLs) == 0 {
		return nil
	}

	rows, err := a.db.Query(context.Background(), `
		SELECT id, feed_url, guid, title, link, description, source_name, published_at, created_at, updated_at
		FROM rss_items
		WHERE feed_url = ANY($1)
		ORDER BY published_at DESC NULLS LAST
		LIMIT $2
	`, feedURLs, DefaultRSSItemsLimit)
	if err != nil {
		log.Printf("[RSS] Items query failed: %v", err)
		return nil
	}
	defer rows.Close()

	items := make([]RssItem, 0)
	for rows.Next() {
		var item RssItem
		if err := rows.Scan(
			&item.ID, &item.FeedURL, &item.GUID, &item.Title, &item.Link,
			&item.Description, &item.SourceName, &item.PublishedAt,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			log.Printf("[RSS] Items scan error: %v", err)
			continue
		}
		items = append(items, item)
	}
	return items
}

// syncRSSFeedsToTracked upserts feed URLs from a user's RSS stream config
// into the tracked_feeds table so the RSS ingestion service discovers and
// fetches them.
func (a *App) syncRSSFeedsToTracked(userSub string, config map[string]interface{}) {
	configJSON, err := json.Marshal(config)
	if err != nil {
		log.Printf("[RSS] Failed to marshal config for sync: %v", err)
		return
	}

	var parsed struct {
		Feeds []struct {
			URL  string `json:"url"`
			Name string `json:"name"`
		} `json:"feeds"`
	}
	if err := json.Unmarshal(configJSON, &parsed); err != nil {
		log.Printf("[RSS] Failed to parse feeds from config: %v", err)
		return
	}

	for _, feed := range parsed.Feeds {
		if feed.URL == "" {
			continue
		}
		name := feed.Name
		if name == "" {
			name = feed.URL
		}

		_, err := a.db.Exec(context.Background(), `
			INSERT INTO tracked_feeds (url, name, category, is_default, is_enabled, added_by)
			VALUES ($1, $2, 'Custom', false, true, $3)
			ON CONFLICT (url) DO NOTHING
		`, feed.URL, name, userSub)
		if err != nil {
			log.Printf("[RSS] Failed to sync feed %s to tracked_feeds: %v", feed.URL, err)
		}
	}

	// Invalidate the catalog cache so new custom feeds appear
	a.rdb.Del(context.Background(), CacheKeyRSSCatalog)
}

// =============================================================================
// Config Parsing Helpers
// =============================================================================

// extractFeedURLsFromStreamConfig extracts feed URLs from a stream's config map.
func extractFeedURLsFromStreamConfig(config map[string]interface{}) []string {
	if config == nil {
		return nil
	}
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil
	}
	return extractFeedURLsFromConfig(configJSON)
}

// extractFeedURLsFromConfig parses a config JSONB blob and returns feed URLs.
func extractFeedURLsFromConfig(configJSON []byte) []string {
	var config struct {
		Feeds []struct {
			URL string `json:"url"`
		} `json:"feeds"`
	}
	if err := json.Unmarshal(configJSON, &config); err != nil {
		return nil
	}

	urls := make([]string, 0, len(config.Feeds))
	for _, f := range config.Feeds {
		if f.URL != "" {
			urls = append(urls, f.URL)
		}
	}
	return urls
}
