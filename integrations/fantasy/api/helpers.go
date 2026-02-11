package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
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
