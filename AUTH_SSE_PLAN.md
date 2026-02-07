# MyScrollr — Authenticated SSE Refactor Plan

## Problem Summary

The SSE/CDC pipeline broadcasts ALL data to ALL anonymous clients. Per-user data (`user_preferences`, `user_streams`, `yahoo_*`, `rss_items`) is visible in anyone's network inspector. Client-side filtering by `logto_sub`/`guid` is security theater — not real security.

## Architecture: Before vs After

### Before (Broken)

```
Sequin CDC → POST /webhooks/sequin (no signature verification)
    → Broadcast(payload) — raw, unfiltered
    → Redis "events:broadcast" — single channel, all data
    → Hub — sends to ALL connected anonymous SSE clients
    → Every user sees every CDC record from every table
```

### After (Authenticated + Per-User)

```
Sequin CDC → POST /webhooks/sequin (Authorization header verified)
    → Parse metadata.table_name
    → Route by table → lookup subscribed users (Redis SMEMBERS)
    → For each subscribed logto_sub:
        Redis.Publish("events:user:{sub}", record)
    → Hub PSubscribe("events:user:*") delivers ONLY to that user's SSE connections
    → SSE requires ?token= query param (JWT validated at connect time)
```

## Data Routing Table

| Table | Routing Logic | Redis Channel |
|-------|--------------|---------------|
| `trades` | `SMEMBERS stream:subscribers:finance` → each user | `events:user:{sub}` |
| `games` | `SMEMBERS stream:subscribers:sports` → each user | `events:user:{sub}` |
| `rss_items` | Extract `feed_url` → `SMEMBERS rss:subscribers:{feed_url}` → each user | `events:user:{sub}` |
| `user_preferences` | Extract `logto_sub` from record → that user | `events:user:{sub}` |
| `user_streams` | Extract `logto_sub` from record → that user | `events:user:{sub}` |
| `yahoo_leagues` | `guid` → DB `yahoo_users.logto_sub` → that user | `events:user:{sub}` |
| `yahoo_standings` | `league_key` → DB join → `logto_sub` | `events:user:{sub}` |
| `yahoo_matchups` | `team_key` → DB join → `logto_sub` | `events:user:{sub}` |

## Redis Subscription Sets

Maintained by stream CRUD operations:

```
stream:subscribers:finance  → { "user_sub_1", "user_sub_2", ... }
stream:subscribers:sports   → { "user_sub_1", "user_sub_3", ... }
stream:subscribers:fantasy  → { "user_sub_2", ... }
rss:subscribers:{feed_url}  → { "user_sub_1", ... }
```

## Design Decisions

1. **EventSource auth via query param**: `GET /events?token=xxx` — EventSource API doesn't support custom headers
2. **Webhook verification**: Sequin sends `Authorization` header with bearer token matching `SEQUIN_WEBHOOK_SECRET`
3. **`/events/count`**: Stays public (just returns a number)
4. **No default streams**: Remove `seedDefaultStreams` and auto-seeding
5. **Token validation**: Once at connect time, not on every message
6. **Redis sets over DB queries**: For CDC routing performance (SMEMBERS is O(n) but extremely fast)

---

## Tasks

### Task 1: Extract shared JWT validation from `auth.go`

**File**: `api/auth.go`

- Extract core JWT validation (parse, verify JWKS, check issuer/audience) into `ValidateToken(tokenString string) (sub string, err error)`
- Refactor `LogtoAuth` middleware to call `ValidateToken` internally
- No behavioral change to existing protected routes

### Task 2: Rewrite `events.go` — Per-user Hub with PSubscribe

**File**: `api/events.go`

- New `Client` struct with `userID string` and `ch chan []byte`
- Hub tracks `map[string][]*Client` (userID → client list)
- Remove `Broadcast()` and `events:broadcast` constant
- `listenToRedis()` uses `PSubscribe("events:user:*")`, extracts sub from channel name, routes to correct clients
- New `RegisterClient(userID string) *Client`
- New `UnregisterClient(client *Client)`
- New `SendToUser(sub string, msg []byte)` — publishes to `events:user:{sub}`

### Task 3: Add Redis subscription set helpers to `redis.go`

**File**: `api/redis.go`

- `AddSubscriber(ctx, setKey, userSub)` — SADD
- `RemoveSubscriber(ctx, setKey, userSub)` — SREM
- `GetSubscribers(ctx, setKey)` — SMEMBERS
- `PSubscribe(ctx, pattern)` — pattern subscription
- `PublishRaw(channel, data []byte)` — publish pre-serialised bytes

### Task 4: Rewrite `handlers_webhook.go` — Per-user CDC routing

**File**: `api/handlers_webhook.go`

- Verify `Authorization` header against `SEQUIN_WEBHOOK_SECRET`
- Parse CDC records, route by `metadata.table_name`
- For each table, lookup subscribers and publish to per-user channels
- Handle both single-record and batched (`data[]`) Sequin formats

### Task 5: Rewrite `handlers_stream.go` — Authenticated SSE endpoint

**File**: `api/handlers_stream.go`

- Extract token from `?token=` query param
- Call `ValidateToken(token)` to get `sub`
- Reject unauthenticated connections with 401
- `RegisterClient(sub)` and stream to that client

### Task 6: Update `streams.go` — Redis subscription management + remove seeding

**File**: `api/streams.go`

- Remove `defaultStreams` var and `seedDefaultStreams()` function
- On Create: `AddSubscriber("stream:subscribers:{type}", userID)` + RSS feed URLs
- On Update: toggle subscriber based on enabled flag, rebuild RSS sets on config change
- On Delete: `RemoveSubscriber` + clean RSS sets
- Remove auto-seed from `GetStreams`
- New `syncStreamSubscriptions(userID)` to warm Redis sets

### Task 7: Update `main.go` — Remove seed calls, warm Redis on dashboard

**File**: `api/main.go`

- Remove `seedDefaultStreams` call from `GetDashboard`
- Call `syncStreamSubscriptions(logtoSub)` in `GetDashboard` to warm Redis sets

### Task 8: Update `rss.go` — RSS subscriber set management

**File**: `api/rss.go`

- New `syncRSSSubscribers(userID, feedURLs)` for Redis set management
- Called from stream CRUD when type is RSS

### Task 9: Update extension SSE — Authenticated connection

**File**: `extension/entrypoints/background/sse.ts`

- `startSSE()` becomes async, acquires token via `getValidToken()`
- If no token, don't connect (user not logged in)
- Pass token as `?token=` query param to EventSource
- Re-acquire token on reconnect

### Task 10: Remove `logto_sub` guards from extension preferences

**File**: `extension/entrypoints/background/preferences.ts`

- Remove `logto_sub !== currentSub` checks — server already filtered

### Task 11: Conditional SSE on auth in extension background

**File**: `extension/entrypoints/background/index.ts`

- Only start SSE if authenticated
- Wire auth expiry to stop SSE

### Task 12: SSE lifecycle on login/logout in extension messaging

**File**: `extension/entrypoints/background/messaging.ts`

- Start SSE after login, stop SSE on logout
- Pass RSS items in `mergeDashboardData`

### Task 13: Authenticated EventSource in frontend

**File**: `myscrollr.com/src/hooks/useRealtime.ts`

- Accept `getToken` function, pass token as `?token=` query param
- Remove all client-side `logto_sub`/`guid` filtering
- Remove `userGuidRef`, `userSubRef`, `setUserSub`

### Task 14: Type-check and verify

- `cd extension && npm run compile`
- `cd myscrollr.com && npx tsc --noEmit`

## Execution Order

```
Phase 1 — Go API:
  Task 1: Extract ValidateToken
  Task 2: Rewrite events.go
  Task 3: Redis helpers
  Task 4: Rewrite handlers_webhook.go [depends 2,3]
  Task 5: Rewrite handlers_stream.go  [depends 1,2]
  Task 6: Update streams.go           [depends 3]
  Task 7: Update main.go              [depends 6]
  Task 8: Update rss.go               [depends 3]

Phase 2 — Extension:
  Task 9:  Authenticated SSE
  Task 10: Remove logto_sub guards
  Task 11: Conditional SSE on auth
  Task 12: SSE lifecycle in messaging

Phase 3 — Frontend:
  Task 13: Authenticated EventSource

Phase 4 — Verification:
  Task 14: Type-check everything
```
