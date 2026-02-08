package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client

func ConnectRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL must be set")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Unable to parse REDIS_URL: %v", err)
	}

	rdb = redis.NewClient(opts)

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Unable to connect to Redis: %v", err)
	}

	log.Println("Successfully connected to Redis")
}

// GetCache attempts to retrieve and deserialize a value from Redis
func GetCache(key string, target interface{}) bool {
	val, err := rdb.Get(context.Background(), key).Result()
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(val), target)
	return err == nil
}

// SetCache serializes and stores a value in Redis with an expiration
func SetCache(key string, value interface{}, expiration time.Duration) {
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

// PublishRaw publishes pre-serialised bytes to a Redis channel
func PublishRaw(channel string, data []byte) error {
	return rdb.Publish(context.Background(), channel, data).Err()
}

// PSubscribe listens to Redis channels matching a pattern
func PSubscribe(ctx context.Context, pattern string) *redis.PubSub {
	return rdb.PSubscribe(ctx, pattern)
}

// --- Subscription Set Helpers ---
// Used to track which users subscribe to which data types.
// Keys follow the convention:
//   stream:subscribers:{type}  (e.g. stream:subscribers:finance)
//   rss:subscribers:{feed_url} (e.g. rss:subscribers:https://example.com/feed.xml)

// AddSubscriber adds a user to a subscription set
func AddSubscriber(ctx context.Context, setKey, userSub string) error {
	return rdb.SAdd(ctx, setKey, userSub).Err()
}

// RemoveSubscriber removes a user from a subscription set
func RemoveSubscriber(ctx context.Context, setKey, userSub string) error {
	return rdb.SRem(ctx, setKey, userSub).Err()
}

// GetSubscribers returns all user subs in a subscription set
func GetSubscribers(ctx context.Context, setKey string) ([]string, error) {
	return rdb.SMembers(ctx, setKey).Result()
}
