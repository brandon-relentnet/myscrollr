package core

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// setupMiniRedis replaces the global `Rdb` with an in-memory miniredis instance
// for the duration of a test. Returns a cleanup function to call with defer.
func setupMiniRedis(t *testing.T) (*miniredis.Miniredis, func()) {
	t.Helper()

	mr := miniredis.RunT(t)
	previousRdb := Rdb
	Rdb = redis.NewClient(&redis.Options{Addr: mr.Addr()})

	return mr, func() {
		_ = Rdb.Close()
		Rdb = previousRdb
	}
}

// TestInvalidateDashboardCache is the baseline happy-path — the helper should
// delete the expected key so future fetches re-populate the cache with fresh
// data.
func TestInvalidateDashboardCache(t *testing.T) {
	mr, cleanup := setupMiniRedis(t)
	defer cleanup()

	const userSub = "user_abc_123"
	cacheKey := RedisDashboardCachePrefix + userSub

	payload, _ := json.Marshal(map[string]string{"data": "stale"})
	mr.Set(cacheKey, string(payload))
	if !mr.Exists(cacheKey) {
		t.Fatalf("precondition: cache key %q should exist after manual Set", cacheKey)
	}

	InvalidateDashboardCache(userSub)

	if mr.Exists(cacheKey) {
		t.Errorf("InvalidateDashboardCache(%q) left key %q in redis; expected deletion", userSub, cacheKey)
	}
}

// TestCDCDispatchInvalidatesCache is the regression test for the 2026-04-24
// "finance symbols jitter" bug.
//
// Scenario the bug produced:
//
//  1. GET /dashboard caches response in Redis for 30s (DashboardCacheTTL)
//  2. Prices for AAPL update in Postgres
//  3. Sequin publishes a CDC event to Redis topic cdc:finance:AAPL
//  4. Hub's listenToTopics fans out to subscribed users via dispatchToUser
//  5. Desktop receives the SSE event and merges it into its TanStack
//     Query cache (optimistic UI update — UI shows new price)
//  6. Desktop's safety-net `invalidateQueries` fires ~500ms later,
//     causing a fresh GET /dashboard
//  7. WITHOUT the fix: the 30s Redis cache returns STALE pre-CDC data
//     and the optimistic merge is overwritten → UI visibly regresses
//     to the old price → next CDC event pushes forward again → endless
//     jitter for up to 30s.
//
// The fix: dispatchToUser invalidates the dashboard cache for the target
// user immediately before (or during) the SSE send. Any refetch that
// lands after will see cache-miss and serve fresh data.
//
// This test asserts: after dispatchToUser is invoked for a user, that
// user's dashboard cache key is gone from Redis, regardless of whether
// the user has any live SSE clients attached.
func TestDispatchToUserInvalidatesDashboardCache(t *testing.T) {
	mr, cleanup := setupMiniRedis(t)
	defer cleanup()

	// Hub must exist to call dispatchToUser. listenToTopics / workers are
	// not needed for the test — we're testing the dispatch function in
	// isolation.
	prevHub := globalHub
	globalHub = &Hub{
		registry:   &topicRegistry{},
		dispatchCh: make(chan dispatchJob, 1),
	}
	defer func() { globalHub = prevHub }()

	const userSub = "user_jitter_test"
	cacheKey := RedisDashboardCachePrefix + userSub

	// Seed a "stale" cached dashboard — simulates a recent poll having
	// populated Redis with data from BEFORE the incoming CDC event.
	stale, _ := json.Marshal(map[string]interface{}{
		"data": map[string]interface{}{
			"finance": []map[string]interface{}{
				{"symbol": "AAPL", "price": 150.20},
			},
		},
	})
	mr.Set(cacheKey, string(stale))
	if !mr.Exists(cacheKey) {
		t.Fatalf("precondition: stale dashboard cache must exist in redis")
	}

	// Simulate a CDC event being dispatched to this user. We don't
	// register a real client — the user may be offline when the CDC
	// fires, but the cache invalidation must still happen so their
	// NEXT fetch gets fresh data.
	payload := []byte(`{"data":[{"action":"update","record":{"symbol":"AAPL","price":150.60},"metadata":{"table_name":"trades"}}]}`)
	globalHub.dispatchToUser(userSub, payload)

	// Cache invalidation may be kicked off in a goroutine to keep the
	// dispatch hot-path non-blocking. Give it a tiny window to complete.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if !mr.Exists(cacheKey) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if mr.Exists(cacheKey) {
		t.Errorf("dispatchToUser(%q, ...) left dashboard cache in Redis; stale data would now overwrite optimistic UI updates", userSub)
	}
}

// TestDispatchToUserWithNoClientsStillInvalidates covers the edge case
// where the user has no active SSE connection (ticker/main app closed
// but dashboard cache from earlier poll is still in Redis). A CDC event
// should still clear that cache so when the user reopens the app, the
// fresh-from-DB dashboard is served on first poll.
func TestDispatchToUserWithNoClientsStillInvalidates(t *testing.T) {
	mr, cleanup := setupMiniRedis(t)
	defer cleanup()

	prevHub := globalHub
	globalHub = &Hub{
		registry:   &topicRegistry{},
		dispatchCh: make(chan dispatchJob, 1),
	}
	defer func() { globalHub = prevHub }()

	const userSub = "user_offline_but_cached"
	cacheKey := RedisDashboardCachePrefix + userSub

	mr.Set(cacheKey, `{"data":{"finance":[{"symbol":"TSLA","price":200}]}}`)

	// No register() call — user is "offline"
	globalHub.dispatchToUser(userSub, []byte(`{"data":[]}`))

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if !mr.Exists(cacheKey) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	if mr.Exists(cacheKey) {
		t.Errorf("dispatchToUser should invalidate cache even when user has no live SSE clients; otherwise the cache serves stale data on next poll after reconnect")
	}
}

// TestInvalidateIdempotent — calling invalidate on a user who has no cache
// entry must be a safe no-op (no panic, no error log spam).
func TestInvalidateIdempotent(t *testing.T) {
	_, cleanup := setupMiniRedis(t)
	defer cleanup()

	// Key does not exist.
	InvalidateDashboardCache("never_cached_user")

	// Verify Redis is reachable after the op (sanity check).
	if err := Rdb.Ping(context.Background()).Err(); err != nil {
		t.Errorf("Redis ping failed after no-op invalidate: %v", err)
	}
}
