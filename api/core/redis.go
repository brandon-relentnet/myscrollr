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

// channelUserCacheKeys returns all per-user cache keys each channel owns,
// for a given user. Used by `InvalidateUserCaches` on CDC dispatch.
//
// The keys follow the convention `cache:<channel>:<userSub>` chosen by
// each channel API (channels/*/api/*.go constants). Core knows about them
// only by convention, not by importing — this respects the AGENTS.md
// channel-isolation rule (no shared Go types) while still letting core
// keep downstream caches in sync when CDC fires.
func channelUserCacheKeys(userSub string) []string {
	return []string{
		"cache:finance:" + userSub,
		"cache:sports:" + userSub,
		"cache:rss:" + userSub,
	}
}

// InvalidateUserCaches deletes all per-user cache entries that could
// contain stale data after a CDC event: core's /dashboard cache plus
// each channel's /internal/dashboard cache.
//
// Called from `Hub.dispatchToUser` on every CDC dispatch so a desktop
// safety-net refetch (triggered ~500ms after the SSE burst) cannot
// overwrite the optimistic in-memory merge with pre-event prices. See
// the comment on `dispatchToUser` for the full regression scenario.
//
// Uses a single Redis pipeline to do one round-trip (not N). At the
// observed peak of ~47 events/sec with <100 users, cost is under 5k
// ops/sec on Redis — negligible.
func InvalidateUserCaches(userSub string) {
	ctx := context.Background()
	keys := append([]string{RedisDashboardCachePrefix + userSub}, channelUserCacheKeys(userSub)...)
	if err := Rdb.Del(ctx, keys...).Err(); err != nil {
		log.Printf("[Cache] Failed to invalidate user caches for %s: %v", userSub, err)
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
