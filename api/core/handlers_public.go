package core

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	// PublicFeedCacheKey is the Redis key for the cached public feed.
	PublicFeedCacheKey = "cache:public:feed"

	// PublicFeedCacheTTL is how long the public feed is cached.
	PublicFeedCacheTTL = 30 * time.Second
)

// PublicFeedResponse is the response shape for GET /public/feed.
// It mirrors the DashboardResponse data map but without preferences/streams.
type PublicFeedResponse struct {
	Data map[string]interface{} `json:"data"`
}

// HandlePublicFeed returns an aggregated feed of finance + sports data.
// No authentication required. Results are cached in Redis for 30s.
//
// @Summary Public feed
// @Description Returns finance and sports data for anonymous/free-tier polling
// @Tags Public
// @Produce json
// @Success 200 {object} PublicFeedResponse
// @Router /public/feed [get]
func HandlePublicFeed(c *fiber.Ctx) error {
	// Check Redis cache first
	var cached PublicFeedResponse
	val, err := Rdb.Get(context.Background(), PublicFeedCacheKey).Result()
	if err == nil {
		if json.Unmarshal([]byte(val), &cached) == nil {
			c.Set("X-Cache", "HIT")
			return c.JSON(cached)
		}
	}

	// Build the response by calling finance and sports public endpoints
	res := PublicFeedResponse{
		Data: make(map[string]interface{}),
	}

	client := &http.Client{Timeout: HealthCheckTimeout}

	// Fetch from finance
	if intg := GetIntegration("finance"); intg != nil {
		data := fetchIntegrationPublic(client, intg, "/finance/public")
		for k, v := range data {
			res.Data[k] = v
		}
	}

	// Fetch from sports
	if intg := GetIntegration("sports"); intg != nil {
		data := fetchIntegrationPublic(client, intg, "/sports/public")
		for k, v := range data {
			res.Data[k] = v
		}
	}

	// Cache the combined result
	if cacheData, err := json.Marshal(res); err == nil {
		Rdb.Set(context.Background(), PublicFeedCacheKey, cacheData, PublicFeedCacheTTL)
	}

	c.Set("X-Cache", "MISS")
	return c.JSON(res)
}

// fetchIntegrationPublic calls an integration's public endpoint and returns
// the parsed response data. The response is expected to be an array (e.g.
// trades or games) which gets wrapped under the integration name key.
func fetchIntegrationPublic(client *http.Client, intg *IntegrationInfo, path string) map[string]interface{} {
	url := intg.InternalURL + path
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("[PublicFeed] %s fetch error: %v", intg.Name, err)
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("[PublicFeed] %s returned status %d", intg.Name, resp.StatusCode)
		return nil
	}

	// The integration public endpoints return raw arrays (e.g. []Trade or []Game).
	// Wrap them under the integration name to match the DashboardResponse.Data shape.
	var items interface{}
	if err := json.Unmarshal(body, &items); err != nil {
		log.Printf("[PublicFeed] %s unmarshal error: %v", intg.Name, err)
		return nil
	}

	return map[string]interface{}{
		intg.Name: items,
	}
}
