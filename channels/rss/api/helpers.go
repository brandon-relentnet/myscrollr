package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// HealthProxyTimeout is the HTTP timeout for proxying health checks.
const HealthProxyTimeout = 5 * time.Second

// GetCache attempts to retrieve and deserialize a value from Redis.
// Returns true if the cache hit was successful.
func GetCache(rdb *redis.Client, key string, target interface{}) bool {
	val, err := rdb.Get(context.Background(), key).Result()
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(val), target)
	return err == nil
}

// SetCache serializes and stores a value in Redis with an expiration.
func SetCache(rdb *redis.Client, key string, value interface{}, expiration time.Duration) {
	data, err := json.Marshal(value)
	if err != nil {
		log.Printf("[Redis Error] Failed to marshal cache data for %s: %v", key, err)
		return
	}

	err = rdb.Set(context.Background(), key, data, expiration).Err()
	if err != nil {
		log.Printf("[Redis Error] Failed to set cache for %s: %v", key, err)
	}
}

// GetSubscribers returns all user subs in a Redis subscription set.
func GetSubscribers(rdb *redis.Client, ctx context.Context, setKey string) ([]string, error) {
	return rdb.SMembers(ctx, setKey).Result()
}

// AddSubscriber adds a user sub to a Redis subscription set.
func AddSubscriber(rdb *redis.Client, ctx context.Context, setKey, userSub string) error {
	return rdb.SAdd(ctx, setKey, userSub).Err()
}

// RemoveSubscriber removes a user sub from a Redis subscription set.
func RemoveSubscriber(rdb *redis.Client, ctx context.Context, setKey, userSub string) error {
	return rdb.SRem(ctx, setKey, userSub).Err()
}

// buildHealthURL ensures the URL ends with /health.
func buildHealthURL(baseURL string) string {
	url := strings.TrimSuffix(baseURL, "/")
	if !strings.HasSuffix(url, "/health") {
		url = url + "/health"
	}
	return url
}

// ProxyInternalHealth proxies a health check to an internal service URL.
func ProxyInternalHealth(c *fiber.Ctx, internalURL string) error {
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "unknown",
			Error:  "Internal URL not configured",
		})
	}

	targetURL := buildHealthURL(internalURL)
	httpClient := &http.Client{Timeout: HealthProxyTimeout}
	resp, err := httpClient.Get(targetURL)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "down",
			Error:  err.Error(),
		})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}
