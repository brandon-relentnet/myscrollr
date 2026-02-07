package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
)

// RssHealth proxies the health check to the RSS ingestion service.
func RssHealth(c *fiber.Ctx) error {
	return proxyInternalHealth(c, os.Getenv("INTERNAL_RSS_URL"))
}

// GetRSSFeedCatalog returns all enabled tracked feeds for the dashboard catalog browser.
//
// @Summary Get RSS feed catalog
// @Description Returns all enabled feeds from the tracked_feeds catalog, grouped by category
// @Tags RSS
// @Produce json
// @Success 200 {array} TrackedFeed
// @Router /rss/feeds [get]
func GetRSSFeedCatalog(c *fiber.Ctx) error {
	var catalog []TrackedFeed
	if GetCache("cache:rss:catalog", &catalog) {
		c.Set("X-Cache", "HIT")
		return c.JSON(catalog)
	}

	rows, err := dbPool.Query(context.Background(),
		"SELECT url, name, category, is_default FROM tracked_feeds WHERE is_enabled = true ORDER BY category, name")
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
		if err := rows.Scan(&f.URL, &f.Name, &f.Category, &f.IsDefault); err != nil {
			log.Printf("[RSS] Catalog scan error: %v", err)
			continue
		}
		catalog = append(catalog, f)
	}

	SetCache("cache:rss:catalog", catalog, 5*time.Minute)
	c.Set("X-Cache", "MISS")
	return c.JSON(catalog)
}

// getUserRSSFeedURLs extracts the feed URLs from a user's RSS stream config.
// Returns nil if the user has no RSS stream or no feeds configured.
func getUserRSSFeedURLs(logtoSub string) []string {
	var configJSON []byte
	err := dbPool.QueryRow(context.Background(), `
		SELECT config FROM user_streams
		WHERE logto_sub = $1 AND stream_type = 'rss'
	`, logtoSub).Scan(&configJSON)
	if err != nil {
		return nil
	}

	return extractFeedURLsFromConfig(configJSON)
}

// extractFeedURLsFromConfig parses a config JSONB blob and returns feed URLs.
// Expected format: {"feeds": [{"url": "...", "name": "..."}, ...]}
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

// queryRSSItems fetches the latest RSS items for the given feed URLs.
func queryRSSItems(feedURLs []string) []RssItem {
	if len(feedURLs) == 0 {
		return nil
	}

	rows, err := dbPool.Query(context.Background(), `
		SELECT id, feed_url, guid, title, link, description, source_name, published_at, created_at, updated_at
		FROM rss_items
		WHERE feed_url = ANY($1)
		ORDER BY published_at DESC NULLS LAST
		LIMIT 50
	`, feedURLs)
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

// DeleteCustomFeed removes a non-default feed from the catalog and cleans up its items and Redis sets.
//
// @Summary Delete a custom RSS feed from the catalog
// @Description Removes a custom (non-default) feed from tracked_feeds, its rss_items, and Redis subscriber sets
// @Tags RSS
// @Accept json
// @Produce json
// @Param body body object true "Feed URL to delete" example({"url":"https://example.com/feed.xml"})
// @Success 200 {object} object{status=string,message=string}
// @Failure 400 {object} ErrorResponse
// @Failure 403 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Security LogtoAuth
// @Router /rss/feeds [delete]
func DeleteCustomFeed(c *fiber.Ctx) error {
	var req struct {
		URL string `json:"url"`
	}
	if err := c.BodyParser(&req); err != nil || req.URL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(ErrorResponse{
			Status: "error",
			Error:  "Request body must include a non-empty 'url' field",
		})
	}

	// Verify the feed exists and is not a default feed
	var isDefault bool
	err := dbPool.QueryRow(context.Background(),
		"SELECT is_default FROM tracked_feeds WHERE url = $1", req.URL).Scan(&isDefault)
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

	// Delete rss_items for this feed URL
	_, _ = dbPool.Exec(context.Background(),
		"DELETE FROM rss_items WHERE feed_url = $1", req.URL)

	// Delete the tracked feed
	_, err = dbPool.Exec(context.Background(),
		"DELETE FROM tracked_feeds WHERE url = $1 AND is_default = false", req.URL)
	if err != nil {
		log.Printf("[RSS] Failed to delete custom feed %s: %v", req.URL, err)
		return c.Status(fiber.StatusInternalServerError).JSON(ErrorResponse{
			Status: "error",
			Error:  "Failed to delete feed",
		})
	}

	// Clean up Redis subscriber set for this feed URL
	rdb.Del(context.Background(), "rss:subscribers:"+req.URL)

	// Invalidate catalog cache
	rdb.Del(context.Background(), "cache:rss:catalog")

	return c.JSON(fiber.Map{"status": "ok", "message": "Custom feed deleted"})
}

// syncRSSFeedsToTracked upserts feed URLs from a user's RSS stream config
// into the tracked_feeds table so the RSS service discovers and fetches them.
func syncRSSFeedsToTracked(config map[string]interface{}) {
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

		_, err := dbPool.Exec(context.Background(), `
			INSERT INTO tracked_feeds (url, name, category, is_default, is_enabled)
			VALUES ($1, $2, 'Custom', false, true)
			ON CONFLICT (url) DO NOTHING
		`, feed.URL, name)
		if err != nil {
			log.Printf("[RSS] Failed to sync feed %s to tracked_feeds: %v", feed.URL, err)
		}
	}

	// Invalidate the catalog cache so new custom feeds appear
	rdb.Del(context.Background(), "cache:rss:catalog")
}
