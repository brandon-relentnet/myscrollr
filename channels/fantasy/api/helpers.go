package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// HealthProxyTimeout is the HTTP timeout for proxying health checks.
const HealthProxyTimeout = 5 * time.Second

// =============================================================================
// Redis Subscriber SET Helpers (used for CDC resolution)
// =============================================================================

// GetSubscribers returns all user subs in a Redis subscription set.
func GetSubscribers(rdb *redis.Client, ctx context.Context, setKey string) ([]string, error) {
	return rdb.SMembers(ctx, setKey).Result()
}

// AddSubscriber adds a user to a Redis subscriber set.
func AddSubscriber(rdb *redis.Client, ctx context.Context, setKey, userSub string) {
	if err := rdb.SAdd(ctx, setKey, userSub).Err(); err != nil {
		log.Printf("[Redis] Failed to add subscriber %s to %s: %v", userSub, setKey, err)
	}
}

// RemoveSubscriber removes a user from a Redis subscriber set.
func RemoveSubscriber(rdb *redis.Client, ctx context.Context, setKey, userSub string) {
	if err := rdb.SRem(ctx, setKey, userSub).Err(); err != nil {
		log.Printf("[Redis] Failed to remove subscriber %s from %s: %v", userSub, setKey, err)
	}
}

// =============================================================================
// Health Proxy
// =============================================================================

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

// =============================================================================
// Encryption
// =============================================================================

// Encrypt encrypts a plaintext string using AES-256-GCM and returns a
// base64-encoded ciphertext.
func Encrypt(plaintext string) (string, error) {
	key := os.Getenv("ENCRYPTION_KEY")
	decodedKey, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decodedKey) != 32 {
		return "", fmt.Errorf("invalid ENCRYPTION_KEY")
	}

	block, err := aes.NewCipher(decodedKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// =============================================================================
// URL / Environment Helpers
// =============================================================================

// CleanFQDN reads COOLIFY_FQDN from the environment and returns the bare
// hostname with any scheme prefix (https://, http://) and trailing slash
// stripped. Returns an empty string if the variable is not set.
func CleanFQDN() string {
	fqdn := os.Getenv("COOLIFY_FQDN")
	if fqdn == "" {
		return ""
	}
	fqdn = strings.TrimPrefix(fqdn, "https://")
	fqdn = strings.TrimPrefix(fqdn, "http://")
	fqdn = strings.TrimSuffix(fqdn, "/")
	return fqdn
}

// ValidateURL cleans a URL string, ensuring it has a scheme prefix.
// Returns the fallback if the input is empty.
func ValidateURL(urlStr, fallback string) string {
	if urlStr == "" {
		return fallback
	}
	urlStr = strings.TrimSpace(urlStr)
	if !strings.HasPrefix(urlStr, "http://") && !strings.HasPrefix(urlStr, "https://") {
		urlStr = "https://" + urlStr
	}
	return strings.TrimSuffix(urlStr, "/")
}

// GetUserSub reads the X-User-Sub header set by the core gateway for
// authenticated requests. Returns empty string if not present.
func GetUserSub(c *fiber.Ctx) string {
	return c.Get("X-User-Sub")
}
