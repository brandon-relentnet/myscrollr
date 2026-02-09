# Scrollr Integration Developer Guide

This guide explains how to add a new data integration to the Scrollr API.

## Architecture Overview

Scrollr uses a **plugin-style integration system**. Each integration is an independent Go package under `api/integrations/` that plugs into the core server via a minimal interface + optional capability interfaces.

```
main.go
  └── Registers integrations into core.Server
        └── core/ handles: middleware, auth, SSE, streams CRUD, webhooks
              └── Delegates to integrations via type assertions
```

**Key principle:** Only implement what you need. A simple "broadcast" integration (like finance/sports) only needs ~8 methods. A complex integration with per-resource routing and stream hooks (like RSS) implements more.

## Interface Reference

### Core Interface (required)

Every integration **must** implement these 3 methods:

```go
type Integration interface {
    Name() string                                                    // "finance", "sports", etc.
    DisplayName() string                                             // "Finance", "Sports", etc.
    RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) // Mount HTTP endpoints
}
```

| Method | Purpose |
|--------|---------|
| `Name()` | Short identifier. Used as stream type, dashboard key, health path, log prefix. Must be unique. |
| `DisplayName()` | Human-readable label for logs and admin UIs. |
| `RegisterRoutes()` | Mount your HTTP endpoints. Use `authMiddleware` for protected routes. |

### Optional Capability Interfaces

The core server checks for these via Go type assertions (`if h, ok := intg.(CDCHandler); ok`). **Only implement the ones you need** — no stub methods required.

#### `CDCHandler`

Enables your integration to receive and route Sequin CDC events.

```go
type CDCHandler interface {
    HandlesTable(tableName string) bool
    RouteCDCRecord(ctx context.Context, record CDCRecord, payload []byte) error
}
```

**When to implement:** Your integration owns database tables whose changes should be pushed to users in real time.

**CDC routing patterns:**

| Pattern | Use Case | Example |
|---------|----------|---------|
| Broadcast | All subscribers of a stream type | Finance, Sports |
| Record owner | Route to user identified in the record | user_preferences |
| Per-resource | Route to users subscribed to a specific resource | RSS (per feed URL) |
| Join resolution | Resolve record fields via DB joins | Fantasy (guid → logto_sub) |

#### `DashboardProvider`

Enables your integration to contribute data to `GET /dashboard`.

```go
type DashboardProvider interface {
    GetDashboardData(ctx context.Context, userSub string, stream StreamInfo) (interface{}, error)
}
```

**When to implement:** Your integration has data to show on the user's dashboard.

**Common pattern:** Check Redis cache first → query DB → cache the result → return.

#### `StreamLifecycle`

Enables your integration to react to stream CRUD events.

```go
type StreamLifecycle interface {
    OnStreamCreated(ctx context.Context, userSub string, config map[string]interface{}) error
    OnStreamUpdated(ctx context.Context, userSub string, oldConfig, newConfig map[string]interface{}) error
    OnStreamDeleted(ctx context.Context, userSub string, config map[string]interface{}) error
    OnSyncSubscriptions(ctx context.Context, userSub string, config map[string]interface{}, enabled bool) error
}
```

**When to implement:** You need to manage per-resource Redis subscription sets, sync external resources, or invalidate caches when streams change.

**When NOT to implement:** Simple broadcast integrations (finance, sports, fantasy). The core already manages the basic `stream:subscribers:<type>` Redis sets automatically.

| Hook | Called when | Use case |
|------|-----------|----------|
| `OnStreamCreated` | After INSERT into user_streams | Sync config resources (e.g. RSS: upsert feed URLs to tracked_feeds) |
| `OnStreamUpdated` | After UPDATE on user_streams | Diff old/new config, update subscription sets, invalidate caches |
| `OnStreamDeleted` | After DELETE from user_streams | Clean up caches and subscription sets |
| `OnSyncSubscriptions` | On dashboard load (warm-up) | Rebuild per-resource Redis sets from DB state |

#### `HealthChecker`

Indicates your integration has a backing ingestion service.

```go
type HealthChecker interface {
    InternalServiceURL() string // e.g. "http://finance:3001"
}
```

**When to implement:** Your integration has a separate ingestion service whose health should be monitored.

**Effect:** The core health endpoint (`GET /health`) will probe `<InternalServiceURL>/health` and include the result. The core also auto-exempts `/<name>/health` from rate limiting.

#### `Configurable`

Advertises a JSON Schema for your stream config.

```go
type Configurable interface {
    ConfigSchema() json.RawMessage
}
```

**When to implement:** You want the frontend to validate or auto-generate forms for your stream config.

## Lifecycle

### Startup sequence

```
1. main.go: Load env, connect DB, connect Redis, init Hub, init Auth
2. main.go: Create integrations via New(...)
3. main.go: Call Init() on integrations that need it (e.g. Fantasy)
4. main.go: Register integrations via srv.RegisterIntegration(...)
5. core:    srv.Setup() →
              a. Publish registry to package-level IntegrationRegistry
              b. Build ValidStreamTypes map from registered Names
              c. Setup middleware (rate limit exemptions for health paths)
              d. Setup routes (core routes + intg.RegisterRoutes for each)
6. core:    srv.Listen() → start HTTP server
```

### Runtime flow

#### CDC Event Processing

```
Sequin CDC webhook → POST /webhooks/sequin
  → Verify secret
  → Parse records (batched or single)
  → For each record:
      → Check table name
      → Core tables (user_preferences, user_streams) → RouteToRecordOwner
      → Other tables → iterate IntegrationRegistry:
          → if intg implements CDCHandler AND HandlesTable(table):
              → RouteCDCRecord(ctx, record, payload)
```

#### Dashboard Aggregation

```
GET /dashboard (authenticated)
  → Get user preferences
  → Get user streams
  → Build enabledStreams map
  → Kick off SyncStreamSubscriptions in background
  → For each integration:
      → if user has enabled stream of this type
         AND intg implements DashboardProvider:
          → GetDashboardData(ctx, userSub, streamInfo)
          → Add result to response.data[intg.Name()]
```

#### Stream CRUD Lifecycle

```
POST /users/me/streams  (CreateStream)
  → Validate stream type against ValidStreamTypes
  → INSERT into user_streams
  → If enabled: addStreamSubscriptions (core Redis set management)
  → If intg implements StreamLifecycle: OnStreamCreated(ctx, userSub, config)

PUT /users/me/streams/:type  (UpdateStream)
  → Fetch old config for diffing
  → UPDATE user_streams
  → Update Redis subscription sets based on enabled state
  → If intg implements StreamLifecycle: OnStreamUpdated(ctx, userSub, oldConfig, newConfig)

DELETE /users/me/streams/:type  (DeleteStream)
  → Fetch config before delete
  → DELETE from user_streams
  → removeStreamSubscriptions (core Redis set cleanup)
  → If intg implements StreamLifecycle: OnStreamDeleted(ctx, userSub, config)
```

## Available `core/` Helpers

These functions and variables are exported from `core/` for use by integration packages:

### Database

| Function | Signature | Purpose |
|----------|-----------|---------|
| `DBPool` | `*pgxpool.Pool` | Global Postgres connection pool |
| `Encrypt` | `(plaintext string) (string, error)` | AES-256-GCM encrypt (for tokens) |
| `Decrypt` | `(ciphertext string) (string, error)` | AES-256-GCM decrypt |

### Redis

| Function | Signature | Purpose |
|----------|-----------|---------|
| `Rdb` | `*redis.Client` | Global Redis client |
| `GetCache` | `(key string, target interface{}) bool` | Deserialize cached value |
| `SetCache` | `(key string, value interface{}, ttl time.Duration)` | Serialize and cache with TTL |
| `AddSubscriber` | `(ctx, setKey, userSub string) error` | Add user to subscription set |
| `RemoveSubscriber` | `(ctx, setKey, userSub string) error` | Remove user from subscription set |
| `GetSubscribers` | `(ctx, setKey string) ([]string, error)` | Get all users in subscription set |

### Event Routing

| Function | Signature | Purpose |
|----------|-----------|---------|
| `SendToUser` | `(sub string, msg []byte)` | Publish to a user's Redis channel |
| `RouteToStreamSubscribers` | `(ctx, setKey string, payload []byte)` | Send to all users in a set |
| `RouteToRecordOwner` | `(record map[string]interface{}, field string, payload []byte)` | Send to user identified in record |

### HTTP

| Function | Signature | Purpose |
|----------|-----------|---------|
| `ProxyInternalHealth` | `(c *fiber.Ctx, internalURL string) error` | Proxy a health check to a service |
| `GetUserID` | `(c *fiber.Ctx) string` | Extract logto_sub from auth context |
| `LogtoAuth` | `fiber.Handler` | JWT validation middleware |

### Constants

All Redis key prefixes, cache TTLs, and query limits are defined in `core/constants.go`.

### Models

Common model structs (`Trade`, `Game`, `RssItem`, `Stream`, `ErrorResponse`, etc.) are in `core/models.go`.

## Step-by-Step: Adding a New Integration

1. **Copy the template:**
   ```bash
   cp -r api/integrations/_template api/integrations/myservice
   ```

2. **Rename the package:**
   - Change `package _template` to `package myservice`
   - Find/replace `example` with `myservice` throughout the file

3. **Define your struct and constructor:**
   - Keep only the dependencies you need (`*pgxpool.Pool`, `*redis.Client`, `SendToUserFunc`, `RouteToStreamSubscribersFunc`)

4. **Implement the core interface:**
   - `Name()` — return your unique short name
   - `DisplayName()` — return a human-readable label
   - `RegisterRoutes()` — mount your endpoints

5. **Implement optional interfaces:**
   - Uncomment and fill in only what you need
   - Delete the commented-out blocks for interfaces you don't use

6. **Add models** (if needed):
   - Add your model structs to `core/models.go` or create a `models.go` in your package

7. **Add constants** (if needed):
   - Add cache keys and TTLs to `core/constants.go`

8. **Register in `main.go`:**
   ```go
   import "github.com/brandon-relentnet/myscrollr/api/integrations/myservice"

   // Simple:
   srv.RegisterIntegration(myservice.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers))

   // With Init:
   myIntg := myservice.New(core.DBPool, core.Rdb, core.SendToUser)
   myIntg.Init()
   srv.RegisterIntegration(myIntg)
   ```

9. **Deploy:**
   - Push to staging — the Dockerfile handles `go build`
   - Configure any new env vars in Coolify
   - If you have a new ingestion service, set up its `INTERNAL_*_URL` env var

10. **Frontend:**
    - Add your stream type to the dashboard UI
    - Add CDC record processing to `useRealtime.ts`
    - Add the stream type to the extension's `FeedCategory` type and tab order

## Existing Integrations Reference

| Integration | Interfaces | Tables | CDC Routing | Stream Hooks |
|-------------|-----------|--------|-------------|-------------|
| **Finance** | Core + CDCHandler + DashboardProvider + HealthChecker | `trades` | Broadcast to `stream:subscribers:finance` | None (core handles) |
| **Sports** | Core + CDCHandler + DashboardProvider + HealthChecker | `games` | Broadcast to `stream:subscribers:sports` | None (core handles) |
| **RSS** | Core + CDCHandler + DashboardProvider + StreamLifecycle + HealthChecker | `rss_items`, `tracked_feeds` | Per-feed-URL routing via `rss:subscribers:{url}` | Syncs feeds to tracked_feeds, manages per-URL subscription sets |
| **Fantasy** | Core + CDCHandler + DashboardProvider + HealthChecker | `yahoo_leagues`, `yahoo_standings`, `yahoo_matchups`, `yahoo_rosters` | Join resolution (guid/league_key/team_key → logto_sub) | None (core handles) |
