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

// InternalHealthTimeout is the aggregate timeout for a /internal/health
// request, covering DB ping + Redis ping + ingestion probe.
const InternalHealthTimeout = 3 * time.Second

// GetCache attempts to retrieve and deserialize a value from Redis.
// Returns true if the cache hit was successful.
func GetCache(rdb *redis.Client, ctx context.Context, key string, target interface{}) bool {
	val, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(val), target)
	return err == nil
}

// SetCache serializes and stores a value in Redis with an expiration.
func SetCache(rdb *redis.Client, ctx context.Context, key string, value interface{}, expiration time.Duration) {
	data, err := json.Marshal(value)
	if err != nil {
		log.Printf("[Redis Error] Failed to marshal cache data for %s: %v", key, err)
		return
	}

	err = rdb.Set(ctx, key, data, expiration).Err()
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

// buildReadyURL returns the /health/ready endpoint on the given base URL.
// Idempotent for trailing slashes and pre-existing /health or /health/ready.
func buildReadyURL(baseURL string) string {
	url := strings.TrimSuffix(baseURL, "/")
	switch {
	case strings.HasSuffix(url, "/health/ready"):
		return url
	case strings.HasSuffix(url, "/health"):
		return url + "/ready"
	default:
		return url + "/health/ready"
	}
}

// probeIngestion checks the downstream Rust ingestion service's
// /health/ready endpoint and returns the HTTP status code it emitted.
func probeIngestion(ctx context.Context, internalURL string) (int, error) {
	if internalURL == "" {
		return 0, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, buildReadyURL(internalURL), nil)
	if err != nil {
		return 0, err
	}
	httpClient := &http.Client{Timeout: HealthProxyTimeout}
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// maxHealthResponseBytes limits the body size read from internal health endpoints.
const maxHealthResponseBytes = 1 << 20 // 1 MB

// ProxyInternalHealth proxies a health check to an internal service URL.
// Used by the public /rss/health endpoint so operators can curl the full
// Rust-side payload without having to exec into the cluster.
func ProxyInternalHealth(c *fiber.Ctx, httpClient *http.Client, internalURL string) error {
	if internalURL == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "unknown",
			Error:  "Internal URL not configured",
		})
	}

	targetURL := buildReadyURL(internalURL)
	resp, err := httpClient.Get(targetURL)
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(ErrorResponse{
			Status: "down",
			Error:  err.Error(),
		})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHealthResponseBytes))
	if err != nil {
		log.Printf("[RSS] Failed to read health response body: %v", err)
	}
	c.Set("Content-Type", "application/json")
	return c.Status(resp.StatusCode).Send(body)
}
