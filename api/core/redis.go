package core

import (
	"context"
	"log"
	"os"

	"github.com/redis/go-redis/v9"
)

// Rdb is the global Redis client. Exported so channel packages can access it
// for direct operations (e.g. cache invalidation).
var Rdb *redis.Client

// ConnectRedis initialises the Redis client from the REDIS_URL env var.
func ConnectRedis() {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatal("REDIS_URL must be set")
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Unable to parse REDIS_URL: %v", err)
	}

	Rdb = redis.NewClient(opts)

	if err := Rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Unable to connect to Redis: %v", err)
	}

	log.Println("Successfully connected to Redis")
}

// PublishRaw publishes pre-serialised bytes to a Redis channel.
func PublishRaw(channel string, data []byte) error {
	return Rdb.Publish(context.Background(), channel, data).Err()
}

// PublishBatch publishes the same payload to multiple Redis channels in a single
// pipeline round-trip. Returns the number of errors encountered.
func PublishBatch(channels []string, data []byte) int {
	if len(channels) == 0 {
		return 0
	}

	ctx := context.Background()
	pipe := Rdb.Pipeline()
	for _, ch := range channels {
		pipe.Publish(ctx, ch, data)
	}

	cmds, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		log.Printf("[Redis] Pipeline publish error: %v", err)
	}

	errCount := 0
	for _, cmd := range cmds {
		if cmd.Err() != nil {
			errCount++
		}
	}
	return errCount
}

// PSubscribe listens to Redis channels matching one or more patterns.
func PSubscribe(ctx context.Context, patterns ...string) *redis.PubSub {
	return Rdb.PSubscribe(ctx, patterns...)
}

// InvalidateDashboardCache removes the cached dashboard response for a user.
// Called after channel CRUD or preference updates to ensure the next poll gets fresh data.
func InvalidateDashboardCache(userSub string) {
	if err := Rdb.Del(context.Background(), RedisDashboardCachePrefix+userSub).Err(); err != nil {
		log.Printf("[Cache] Failed to invalidate dashboard cache for %s: %v", userSub, err)
	}
}

// --- Subscription Set Helpers ---
// Used to track which users subscribe to which data types.
// Keys follow the convention:
//   channel:subscribers:{type}  (e.g. channel:subscribers:finance)
//   rss:subscribers:{feed_url}  (e.g. rss:subscribers:https://example.com/feed.xml)

// AddSubscriber adds a user to a subscription set.
func AddSubscriber(ctx context.Context, setKey, userSub string) error {
	return Rdb.SAdd(ctx, setKey, userSub).Err()
}

// RemoveSubscriber removes a user from a subscription set.
func RemoveSubscriber(ctx context.Context, setKey, userSub string) error {
	return Rdb.SRem(ctx, setKey, userSub).Err()
}

// AddSubscriberMulti adds a user to multiple subscription sets in a single
// pipeline round-trip. Used for sports per-league sets where a single subscribe
// action touches 8+ Redis keys.
func AddSubscriberMulti(ctx context.Context, setKeys []string, userSub string) error {
	if len(setKeys) == 0 {
		return nil
	}
	pipe := Rdb.Pipeline()
	for _, key := range setKeys {
		pipe.SAdd(ctx, key, userSub)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// RemoveSubscriberMulti removes a user from multiple subscription sets in a
// single pipeline round-trip.
func RemoveSubscriberMulti(ctx context.Context, setKeys []string, userSub string) error {
	if len(setKeys) == 0 {
		return nil
	}
	pipe := Rdb.Pipeline()
	for _, key := range setKeys {
		pipe.SRem(ctx, key, userSub)
	}
	_, err := pipe.Exec(ctx)
	return err
}


