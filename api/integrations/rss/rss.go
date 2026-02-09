package rss

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/brandon-relentnet/myscrollr/api/core"
	"github.com/brandon-relentnet/myscrollr/api/integration"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Integration implements the core Integration interface plus CDCHandler,
// DashboardProvider, StreamLifecycle, and HealthChecker for RSS feeds.
type Integration struct {
	db         *pgxpool.Pool
	rdb        *redis.Client
	sendToUser integration.SendToUserFunc
}

// New creates a new RSS integration.
func New(db *pgxpool.Pool, rdb *redis.Client, sendToUser integration.SendToUserFunc) *Integration {
	return &Integration{
		db:         db,
		rdb:        rdb,
		sendToUser: sendToUser,
	}
}

// --- Core Interface ---

func (r *Integration) Name() string       { return "rss" }
func (r *Integration) DisplayName() string { return "RSS" }

func (r *Integration) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	router.Get("/rss/health", r.healthHandler)
	router.Get("/rss/feeds", r.getRSSFeedCatalog)
	router.Delete("/rss/feeds", authMiddleware, r.deleteCustomFeed)
}

// --- CDCHandler ---

func (r *Integration) HandlesTable(tableName string) bool {
	return tableName == "rss_items"
}

func (r *Integration) RouteCDCRecord(ctx context.Context, record integration.CDCRecord, payload []byte) error {
	feedURL, ok := record.Record["feed_url"].(string)
	if !ok || feedURL == "" {
		return nil
	}
	subs, err := core.GetSubscribers(ctx, core.RedisRSSSubscribersPrefix+feedURL)
	if err != nil {
		return fmt.Errorf("failed to get RSS subscribers for %s: %w", feedURL, err)
	}
	for _, sub := range subs {
		r.sendToUser(sub, payload)
	}
	return nil
}

// --- DashboardProvider ---

func (r *Integration) GetDashboardData(ctx context.Context, userSub string, stream integration.StreamInfo) (interface{}, error) {
	feedURLs := r.getUserRSSFeedURLs(userSub)
	if len(feedURLs) == 0 {
		return make([]core.RssItem, 0), nil
	}

	cacheKey := core.CacheKeyRSSPrefix + userSub
	var items []core.RssItem
	if core.GetCache(cacheKey, &items) {
		return items, nil
	}

	items = r.queryRSSItems(feedURLs)
	if items == nil {
		items = make([]core.RssItem, 0)
	}
	core.SetCache(cacheKey, items, core.RSSItemsCacheTTL)
	return items, nil
}

// --- StreamLifecycle ---

func (r *Integration) OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error {
	go r.syncRSSFeedsToTracked(config)
	return nil
}

func (r *Integration) OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error {
	if newConfig == nil {
		return nil
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
			core.RemoveSubscriber(ctx, core.RedisRSSSubscribersPrefix+u, userSub)
		}
	}

	// Invalidate per-user RSS cache
	r.rdb.Del(ctx, core.CacheKeyRSSPrefix+userSub)

	// Sync new feed URLs to tracked_feeds
	go r.syncRSSFeedsToTracked(newConfig)
	return nil
}

func (r *Integration) OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error {
	// Invalidate per-user RSS cache
	r.rdb.Del(ctx, core.CacheKeyRSSPrefix+userSub)
	return nil
}

func (r *Integration) OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error {
	if !enabled {
		return nil
	}
	feedURLs := extractFeedURLsFromStreamConfig(config)
	for _, url := range feedURLs {
		core.AddSubscriber(ctx, core.RedisRSSSubscribersPrefix+url, userSub)
	}
	return nil
}

// --- HealthChecker ---

func (r *Integration) InternalServiceURL() string { return os.Getenv("INTERNAL_RSS_URL") }

// --- Internal helpers ---

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

// getUserRSSFeedURLs extracts the feed URLs from a user's RSS stream config.
func (r *Integration) getUserRSSFeedURLs(logtoSub string) []string {
	var configJSON []byte
	err := r.db.QueryRow(context.Background(), `
		SELECT config FROM user_streams
		WHERE logto_sub = $1 AND stream_type = 'rss'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}
	return extractFeedURLsFromConfig(configJSON)
}

// queryRSSItems fetches the latest RSS items for the given feed URLs.
func (r *Integration) queryRSSItems(feedURLs []string) []core.RssItem {
	if len(feedURLs) == 0 {
		return nil
	}

	rows, err := r.db.Query(context.Background(), `
		SELECT id, feed_url, guid, title, link, description, source_name, published_at, created_at, updated_at
		FROM rss_items
		WHERE feed_url = ANY($1)
		ORDER BY published_at DESC NULLS LAST
		LIMIT $2
	`, feedURLs, core.DefaultRSSItemsLimit)
	if err != nil {
		log.Printf("[RSS] Items query failed: %v", err)
		return nil
	}
	defer rows.Close()

	items := make([]core.RssItem, 0)
	for rows.Next() {
		var item core.RssItem
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
// into the tracked_feeds table so the RSS service discovers and fetches them.
func (r *Integration) syncRSSFeedsToTracked(config map[string]interface{}) {
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

		_, err := r.db.Exec(context.Background(), `
			INSERT INTO tracked_feeds (url, name, category, is_default, is_enabled)
			VALUES ($1, $2, 'Custom', false, true)
			ON CONFLICT (url) DO NOTHING
		`, feed.URL, name)
		if err != nil {
			log.Printf("[RSS] Failed to sync feed %s to tracked_feeds: %v", feed.URL, err)
		}
	}

	// Invalidate the catalog cache so new custom feeds appear
	r.rdb.Del(context.Background(), core.CacheKeyRSSCatalog)
}

// --- HTTP Handlers ---

func (r *Integration) healthHandler(c *fiber.Ctx) error {
	return core.ProxyInternalHealth(c, r.InternalServiceURL())
}

// getRSSFeedCatalog returns all enabled tracked feeds for the dashboard catalog browser.
// @Summary Get RSS feed catalog
// @Description Returns all enabled feeds from the tracked_feeds catalog
// @Tags RSS
// @Produce json
// @Success 200 {array} core.TrackedFeed
// @Router /rss/feeds [get]
func (r *Integration) getRSSFeedCatalog(c *fiber.Ctx) error {
	var catalog []core.TrackedFeed
	if core.GetCache(core.CacheKeyRSSCatalog, &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	rows, err := r.db.Query(context.Background(),
		fmt.Sprintf("SELECT url, name, category, is_default FROM tracked_feeds WHERE is_enabled = true AND consecutive_failures < %d ORDER BY category, name", core.MaxConsecutiveFailures))
	if err != nil {
		log.Printf("[RSS] Catalog query failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Failed to fetch feed catalog",
		})
	}
	defer rows.Close()

	catalog = make([]core.TrackedFeed, 0)
	for rows.Next() {
		var f core.TrackedFeed
		if err := rows.Scan(&f.URL, &f.Name, &f.Category, &f.IsDefault); err != nil {
			log.Printf("[RSS] Catalog scan error: %v", err)
			continue
		}
		catalog = append(catalog, f)
	}

	core.SetCache(core.CacheKeyRSSCatalog, catalog, core.RSSCatalogCacheTTL)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// deleteCustomFeed removes a non-default feed from the catalog.
// @Summary Delete a custom RSS feed from the catalog
// @Description Removes a custom (non-default) feed from tracked_feeds
// @Tags RSS
// @Accept json
// @Produce json
// @Success 200 {object} object{status=string,message=string}
// @Security LogtoAuth
// @Router /rss/feeds [delete]
func (r *Integration) deleteCustomFeed(c *fiber.Ctx) error {
	var req struct {
		URL string `json:"url"`
	}
	if err := c.BodyParser(&req); err != nil || req.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Request body must include a non-empty 'url' field",
		})
	}

	var isDefault bool
	err := r.db.QueryRow(context.Background(),
		"SELECT is_default FROM tracked_feeds WHERE url = $1", req.URL).Scan(&isDefault)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Feed not found in catalog",
		})
	}
	if isDefault {
		return c.Status(fiber.StatusForbidden).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Cannot delete a built-in default feed",
		})
	}

	_, _ = r.db.Exec(context.Background(), "DELETE FROM rss_items WHERE feed_url = $1", req.URL)
	_, err = r.db.Exec(context.Background(), "DELETE FROM tracked_feeds WHERE url = $1 AND is_default = false", req.URL)
	if err != nil {
		log.Printf("[RSS] Failed to delete custom feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(core.ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}

	r.rdb.Del(context.Background(), core.RedisRSSSubscribersPrefix+req.URL)
	r.rdb.Del(context.Background(), core.CacheKeyRSSCatalog)

	return c.JSON(fiber.Map{"status": "ok", "message": "Custom feed deleted"})
}
