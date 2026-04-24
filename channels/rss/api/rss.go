package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
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
	db         *pgxpool.Pool
	rdb        *redis.Client
	httpClient *http.Client
	sfGroup    singleflight.Group
}

// =============================================================================
// Public Routes (proxied by core gateway)
// =============================================================================

// getRSSFeedCatalog returns all enabled tracked feeds for the dashboard
// catalog browser.
func (a *App) getRSSFeedCatalog(c *fiber.Ctx) error {
	ctx := c.Context()
	includeFailing := c.Query("include_failing") == "true"

	// Use separate cache keys so the two variants don't collide
	cacheKey := CacheKeyRSSCatalog
	if includeFailing {
		cacheKey = CacheKeyRSSCatalog + ":all"
	}

	var catalog []TrackedFeed
	if GetCache(a.rdb, ctx, cacheKey, &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	// Singleflight: collapse concurrent cache-miss requests into one DB query
	result, err, _ := a.sfGroup.Do(cacheKey, func() (interface{}, error) {
		query := "SELECT url, name, category, is_default, consecutive_failures, last_error, last_success_at FROM tracked_feeds WHERE is_enabled = true"
		var rows pgx.Rows
		var qErr error
		if includeFailing {
			rows, qErr = a.db.Query(ctx, query+" ORDER BY category, name")
		} else {
			rows, qErr = a.db.Query(ctx, query+" AND consecutive_failures < $1 ORDER BY category, name", MaxConsecutiveFailures)
		}
		if qErr != nil {
			return nil, qErr
		}
		defer rows.Close()

		var feeds []TrackedFeed
		for rows.Next() {
			var f TrackedFeed
			if err := rows.Scan(&f.URL, &f.Name, &f.Category, &f.IsDefault, &f.ConsecutiveFailures, &f.LastError, &f.LastSuccessAt); err != nil {
				log.Printf("[RSS] Catalog scan error: %v", err)
				continue
			}
			feeds = append(feeds, f)
		}
		return feeds, nil
	})
	if err != nil {
		log.Printf("[RSS] Catalog query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch feed catalog",
		})
	}
	catalog = result.([]TrackedFeed)
	if catalog == nil {
		catalog = make([]TrackedFeed, 0)
	}

	SetCache(a.rdb, ctx, cacheKey, catalog, RSSCatalogCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// deleteCustomFeed removes a non-default feed from the catalog.
// The core gateway sets X-User-Sub header for authenticated requests.
// Only the user who added the feed (added_by) can delete it.
func (a *App) deleteCustomFeed(c *fiber.Ctx) error {
	ctx := c.Context()

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
	err := a.db.QueryRow(ctx,
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

	// Wrap both deletes in a transaction so a failure partway through
	// cannot leave rss_items gone while tracked_feeds still points at a
	// now-empty feed row. Rollback is always safe to call after Commit.
	tx, err := a.db.Begin(ctx)
	if err != nil {
		log.Printf("[RSS] Failed to begin delete transaction for feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "DELETE FROM rss_items WHERE feed_url = $1", req.URL); err != nil {
		log.Printf("[RSS] Failed to delete items for feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed items",
		})
	}

	if _, err := tx.Exec(ctx, "DELETE FROM tracked_feeds WHERE url = $1 AND is_default = false", req.URL); err != nil {
		log.Printf("[RSS] Failed to delete custom feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("[RSS] Failed to commit delete transaction for feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}

	a.rdb.Del(ctx, RedisRSSSubscribersPrefix+req.URL)
	a.rdb.Del(ctx, CacheKeyRSSCatalog)
	a.rdb.Del(ctx, CacheKeyRSSCatalog+":all")

	log.Printf("[RSS] User %s deleted custom feed: %s", userSub, req.URL)
	return c.JSON(fiber.Map{"status": "ok", "message": "Custom feed deleted"})
}

// healthHandler proxies a health check to the internal Rust RSS ingestion service.
func (a *App) healthHandler(c *fiber.Ctx) error {
	return ProxyInternalHealth(c, a.httpClient, os.Getenv("INTERNAL_RSS_URL"))
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

	ctx := c.Context()

	// Collect unique feed URLs first
	urlSet := make(map[string]struct{})
	for _, rec := range req.Records {
		feedURL, ok := rec.Record["feed_url"].(string)
		if !ok || feedURL == "" {
			continue
		}
		urlSet[feedURL] = struct{}{}
	}

	if len(urlSet) == 0 {
		return c.JSON(fiber.Map{"users": []string{}})
	}

	// Pipeline all SMEMBERS calls into a single Redis round-trip
	pipe := a.rdb.Pipeline()
	cmds := make(map[string]*redis.StringSliceCmd, len(urlSet))
	for feedURL := range urlSet {
		cmds[feedURL] = pipe.SMembers(ctx, RedisRSSSubscribersPrefix+feedURL)
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		log.Printf("[RSS CDC] Redis pipeline failed: %v", err)
	}

	userSet := make(map[string]bool)
	for feedURL, cmd := range cmds {
		subs, err := cmd.Result()
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
	ctx := c.Context()

	userSub := c.Query("user")
	if userSub == "" {
		return c.JSON(fiber.Map{"rss": []RssItem{}})
	}

	// Check per-user cache first
	cacheKey := CacheKeyRSSPrefix + userSub
	var items []RssItem
	if GetCache(a.rdb, ctx, cacheKey, &items) {
		return c.JSON(fiber.Map{"rss": items})
	}

	// Get user's RSS feed URLs from their channel config
	feedURLs := a.getUserRSSFeedURLs(ctx, userSub)
	if len(feedURLs) == 0 {
		return c.JSON(fiber.Map{"rss": []RssItem{}})
	}

	items = a.queryRSSItems(ctx, feedURLs)
	if items == nil {
		items = make([]RssItem, 0)
	}

	SetCache(a.rdb, ctx, cacheKey, items, RSSItemsCacheTTL)
	return c.JSON(fiber.Map{"rss": items})
}

// handleInternalHealth is the endpoint the core gateway and k8s probes hit.
//
// It verifies that this API's own dependencies (Postgres, Redis) are reachable
// and that the downstream Rust ingestion service's /health/ready returns 200.
// Any failure returns HTTP 503 so the k8s readinessProbe can mark the pod
// NotReady. Previously returned a static `{"status":"healthy"}` no matter what.
func (a *App) handleInternalHealth(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), InternalHealthTimeout)
	defer cancel()

	result := fiber.Map{"status": "healthy"}
	degraded := false

	if err := a.db.Ping(ctx); err != nil {
		result["database"] = "unhealthy: " + err.Error()
		degraded = true
	} else {
		result["database"] = "healthy"
	}

	if err := a.rdb.Ping(ctx).Err(); err != nil {
		result["redis"] = "unhealthy: " + err.Error()
		degraded = true
	} else {
		result["redis"] = "healthy"
	}

	if internalURL := os.Getenv("INTERNAL_RSS_URL"); internalURL != "" {
		code, ingestErr := probeIngestion(ctx, internalURL)
		result["ingestion_http_status"] = code
		if ingestErr != nil {
			result["ingestion"] = "unreachable: " + ingestErr.Error()
			degraded = true
		} else if code != fiber.StatusOK {
			result["ingestion"] = fmt.Sprintf("not ready: HTTP %d", code)
			degraded = true
		} else {
			result["ingestion"] = "healthy"
		}
	}

	if degraded {
		result["status"] = "degraded"
		return c.Status(fiber.StatusServiceUnavailable).JSON(result)
	}
	return c.JSON(result)
}

// =============================================================================
// Channel Lifecycle (RSS is the ONLY channel that implements this)
// =============================================================================

// handleChannelLifecycle handles channel lifecycle events dispatched by the core
// gateway. Events: created, updated, deleted, sync.
func (a *App) handleChannelLifecycle(c *fiber.Ctx) error {
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

	ctx := c.Context()

	switch req.Event {
	case "created":
		a.onChannelCreated(req.User, req.Config)

	case "updated":
		a.onChannelUpdated(ctx, req.User, req.OldConfig, req.Config)

	case "deleted":
		a.onChannelDeleted(ctx, req.User, req.Config)

	case "sync":
		a.onSyncSubscriptions(ctx, req.User, req.Config, req.Enabled)

	default:
		log.Printf("[RSS Lifecycle] Unknown event: %s", req.Event)
	}

	return c.JSON(fiber.Map{"ok": true})
}

// onChannelCreated syncs feeds to tracked_feeds table when a new RSS channel
// is created. Runs in a goroutine so it doesn't block the response.
func (a *App) onChannelCreated(userSub string, config map[string]interface{}) {
	go a.syncRSSFeedsToTracked(userSub, config)
}

// onChannelUpdated handles feed list changes when a channel is updated.
// 1. Diffs old vs new feed URLs, removes user from stale subscriber sets
// 2. Invalidates per-user cache
// 3. Syncs new feeds to tracked_feeds
func (a *App) onChannelUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) {
	if newConfig == nil {
		return
	}

	// Diff old vs new feed URLs and remove user from stale subscriber sets
	oldFeedURLs := extractFeedURLsFromChannelConfig(oldConfig)
	newFeedURLs := extractFeedURLsFromChannelConfig(newConfig)
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

// onChannelDeleted removes the user from all per-feed-URL subscriber sets and
// invalidates per-user cache when a channel is removed.
func (a *App) onChannelDeleted(ctx context.Context, userSub string, config map[string]interface{}) {
	feedURLs := extractFeedURLsFromChannelConfig(config)
	for _, url := range feedURLs {
		RemoveSubscriber(a.rdb, ctx, RedisRSSSubscribersPrefix+url, userSub)
	}
	a.rdb.Del(ctx, CacheKeyRSSPrefix+userSub)
}

// onSyncSubscriptions adds or removes the user from per-feed-URL subscriber
// sets based on the enabled flag. Called on dashboard load to warm sets.
func (a *App) onSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) {
	feedURLs := extractFeedURLsFromChannelConfig(config)
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

// getUserRSSFeedURLs extracts the feed URLs from a user's RSS channel config.
func (a *App) getUserRSSFeedURLs(ctx context.Context, logtoSub string) []string {
	var configJSON []byte
	err := a.db.QueryRow(ctx, `
		SELECT config FROM user_channels
		WHERE logto_sub = $1 AND channel_type = 'rss'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}
	return extractFeedURLsFromConfig(configJSON)
}

// queryRSSItems fetches the latest RSS items for the given feed URLs.
func (a *App) queryRSSItems(ctx context.Context, feedURLs []string) []RssItem {
	if len(feedURLs) == 0 {
		return nil
	}

	rows, err := a.db.Query(ctx, `
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

	items := make([]RssItem, 0, DefaultRSSItemsLimit)
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

// syncRSSFeedsToTracked upserts feed URLs from a user's RSS channel config
// into the tracked_feeds table so the RSS ingestion service discovers and
// fetches them.
func (a *App) syncRSSFeedsToTracked(userSub string, config map[string]interface{}) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[RSS] PANIC in syncRSSFeedsToTracked for user %s: %v", userSub, r)
		}
	}()

	// Use a dedicated timeout context since this runs in a background goroutine
	// (not tied to any HTTP request lifecycle).
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

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

		_, err := a.db.Exec(ctx, `
			INSERT INTO tracked_feeds (url, name, category, is_default, is_enabled, added_by)
			VALUES ($1, $2, 'Custom', false, true, $3)
			ON CONFLICT (url) DO NOTHING
		`, feed.URL, name, userSub)
		if err != nil {
			log.Printf("[RSS] Failed to sync feed %s to tracked_feeds: %v", feed.URL, err)
		}
	}

	// Invalidate the catalog cache so new custom feeds appear
	a.rdb.Del(ctx, CacheKeyRSSCatalog)
	a.rdb.Del(ctx, CacheKeyRSSCatalog+":all")
}

// =============================================================================
// Config Parsing Helpers
// =============================================================================

// extractFeedURLsFromChannelConfig extracts feed URLs from a channel's config
// map by walking it directly (avoids a marshal→unmarshal round-trip).
func extractFeedURLsFromChannelConfig(config map[string]interface{}) []string {
	if config == nil {
		return nil
	}

	feedsRaw, ok := config["feeds"]
	if !ok {
		return nil
	}
	feedsSlice, ok := feedsRaw.([]interface{})
	if !ok {
		return nil
	}

	urls := make([]string, 0, len(feedsSlice))
	for _, item := range feedsSlice {
		feedMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if u, ok := feedMap["url"].(string); ok && u != "" {
			urls = append(urls, u)
		}
	}
	return urls
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
