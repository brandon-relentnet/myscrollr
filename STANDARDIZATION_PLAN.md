# Code Quality Standardization Plan

**Date:** 2026-02-08
**Scope:** Code quality improvements across Go API, React frontend, and WXT extension
**Out of scope:** Accessibility, documentation updates, shared Rust crate, dashboard component extraction, Yahoo JSONB typing, git conventions

---

## Overall Scores (Pre-Standardization)

| Component | Score | Strongest Area | Weakest Area |
|-----------|-------|----------------|--------------|
| Go API | 2.9/5 | Naming (4), Redis (4) | Error handling (2), Magic values (2), HTTP responses (2) |
| Rust Ingestion | 3.3/5 | Logging (5), Naming (4) | Code duplication (2), DB patterns (2) |
| Frontend | 3.3/5 | Animation (5), Styling (4) | Accessibility (2), Comments (2) |
| Extension | 4.4/5 | WXT (5), Storage (5), SSE (5), Auth (5) | Popup typing (4) |
| Cross-Component | 4.0/5 | Domain naming (5), API contracts (5) | Config formats (3), Git conventions (3) |
| **Monorepo Overall** | **3.6/5** | | |

---

## Phase 1 -- Go API

### 1.1 Create `api/constants.go`

Extract ~40 named constants from hardcoded values scattered across 10 Go files. Group by domain:

#### Cache TTLs

| Constant | Value | Used In |
|----------|-------|---------|
| `SportsCacheTTL` | `30 * time.Second` | `main.go:314,425` |
| `FinanceCacheTTL` | `30 * time.Second` | `main.go:352,408` |
| `RSSItemsCacheTTL` | `60 * time.Second` | `main.go:440` |
| `RSSCatalogCacheTTL` | `5 * time.Minute` | `rss.go:54` |
| `YahooCacheTTL` | `5 * time.Minute` | `yahoo.go:235,253,285,317,349`, `main.go:459` |

#### Auth / OAuth

| Constant | Value | Used In |
|----------|-------|---------|
| `JWKSRefreshInterval` | `time.Hour` | `auth.go:41` |
| `JWKSRefreshRateLimit` | `5 * time.Minute` | `auth.go:42` |
| `JWKSRefreshTimeout` | `10 * time.Second` | `auth.go:43` |
| `OAuthStateExpiry` | `10 * time.Minute` | `yahoo.go:129,131` |
| `OAuthStateBytes` | `16` | `yahoo.go:123` |
| `YahooAuthCookieExpiry` | `24 * time.Hour` | `yahoo.go:97,160` |
| `YahooRefreshCookieExpiry` | `30 * 24 * time.Hour` | `yahoo.go:162` |
| `TokenToGuidTTL` | `24 * time.Hour` | `yahoo.go:189` |

#### HTTP Timeouts

| Constant | Value | Used In |
|----------|-------|---------|
| `HealthProxyTimeout` | `5 * time.Second` | `main.go:232` |
| `HealthCheckTimeout` | `2 * time.Second` | `main.go:266` |
| `YahooAPITimeout` | `10 * time.Second` | `yahoo.go:80,166` |
| `LogtoProxyTimeout` | `10 * time.Second` | `extension_auth.go:189` |

#### Database Pool

| Constant | Value | Used In |
|----------|-------|---------|
| `DBMaxConns` | `20` | `database.go:78` |
| `DBMinConns` | `2` | `database.go:79` |
| `DBMaxConnIdleTime` | `30 * time.Minute` | `database.go:80` |
| `DBMaxRetries` | `5` | `database.go:84` |
| `DBRetryDelay` | `2 * time.Second` | `database.go:95` |

#### SSE

| Constant | Value | Used In |
|----------|-------|---------|
| `SSEHeartbeatInterval` | `15 * time.Second` | `handlers_stream.go:61` |
| `SSERetryIntervalMs` | `3000` | `handlers_stream.go:66` |
| `SSEClientBufferSize` | `100` | `events.go:118` |

#### Rate Limiting

| Constant | Value | Used In |
|----------|-------|---------|
| `RateLimitMax` | `120` | `main.go:116` |
| `RateLimitExpiration` | `1 * time.Minute` | `main.go:117` |

#### Query Limits

| Constant | Value | Used In |
|----------|-------|---------|
| `DefaultSportsLimit` | `50` | `main.go:297` |
| `DashboardSportsLimit` | `20` | `main.go:416` |
| `DefaultRSSItemsLimit` | `50` | `rss.go:106` |

#### Redis Key Prefixes

| Constant | Value | Used In |
|----------|-------|---------|
| `CacheKeySports` | `"cache:sports"` | `main.go:291,314,398,408,415,425` |
| `CacheKeyFinance` | `"cache:finance"` | `main.go:329,352,398,408` |
| `CacheKeyRSSPrefix` | `"cache:rss:"` | `main.go:434`, `streams.go:364,432` |
| `CacheKeyRSSCatalog` | `"cache:rss:catalog"` | `rss.go:28,54,191,236` |
| `CacheKeyYahooLeaguesPrefix` | `"cache:yahoo:leagues:"` | `main.go:449`, `yahoo.go:217,220`, `users.go:164` |
| `CacheKeyYahooStandingsPrefix` | `"cache:yahoo:standings:"` | `yahoo.go:268` |
| `CacheKeyYahooMatchupsPrefix` | `"cache:yahoo:matchups:"` | `yahoo.go:300` |
| `CacheKeyYahooRosterPrefix` | `"cache:yahoo:roster:"` | `yahoo.go:332` |
| `RedisStreamSubscribersPrefix` | `"stream:subscribers:"` | `streams.go:64,92,103`, `handlers_webhook.go:101` |
| `RedisRSSSubscribersPrefix` | `"rss:subscribers:"` | `streams.go:75,96,107,359`, `handlers_webhook.go:150`, `rss.go:188` |
| `RedisEventsUserPrefix` | `"events:user:"` | `events.go:71,76,80,108` |
| `RedisCSRFPrefix` | `"csrf:"` | `yahoo.go:129,148` |
| `RedisYahooStateLogtoPrefix` | `"yahoo_state_logto:"` | `yahoo.go:131,152` |
| `RedisTokenToGuidPrefix` | `"token_to_guid:"` | `yahoo.go:72,189` |

#### Miscellaneous

| Constant | Value | Used In |
|----------|-------|---------|
| `HSTSMaxAge` | `5184000` | `main.go:83` |
| `DefaultPort` | `"8080"` | `main.go:188` |
| `MaxConsecutiveFailures` | `3` | `rss.go:34` |
| `RedisScanCount` | `100` | `users.go:171` |
| `DefaultAllowedOrigins` | `"https://myscrollr.com,https://api.myscrollr.relentnet.dev"` | `main.go:98` |
| `DefaultFrontendURL` | `"https://myscrollr.com"` | `main.go:200`, `yahoo.go:196` |
| `AuthPopupCloseDelayMs` | `1500` | `yahoo.go:202` |
| `TokenCacheKeyPrefixLen` | `10` | `yahoo.go:220` |

**Files touched:** All 15 Go files (find-replace inline values with constant names)
**New file:** `api/constants.go`

---

### 1.2 Standardize Error Responses

#### A. Replace `fiber.Map` error returns with `ErrorResponse` struct

| File:Line | Current | Change To |
|-----------|---------|-----------|
| `handlers_webhook.go:30` | `fiber.Map{"error": "Unauthorized"}` | `ErrorResponse{Status: "unauthorized", Error: "Unauthorized"}` |
| `handlers_webhook.go:38` | `fiber.Map{"error": "No valid CDC records"}` | `ErrorResponse{Status: "error", Error: "No valid CDC records"}` |

#### B. Replace `http.Status*` with `fiber.Status*`

23 instances across 2 files:

| File | Count | Lines |
|------|-------|-------|
| `streams.go` | 16 | 124, 133, 158, 169, 176, 200, 206, 227, 246, 254, 266, 325, 331, 387, 406, 413 |
| `users.go` | 7 | 24, 41, 58, 79, 130, 152, 187 |

After replacement, remove `"net/http"` import from both files if no longer used.

#### C. Fix `Status` field values for 401 responses

7 instances that use `Status: "error"` for HTTP 401 (should be `"unauthorized"`):

| File:Line | Current Status | Fix |
|-----------|---------------|-----|
| `streams.go:124` | `"error"` | `"unauthorized"` |
| `streams.go:158` | `"error"` | `"unauthorized"` |
| `streams.go:246` | `"error"` | `"unauthorized"` |
| `streams.go:387` | `"error"` | `"unauthorized"` |
| `users.go:24` | `"error"` | `"unauthorized"` |
| `users.go:58` | `"error"` | `"unauthorized"` |
| `users.go:130` | `"error"` | `"unauthorized"` |

**Convention after fix:** `"unauthorized"` for 401, `"error"` for all other error codes (400, 403, 404, 409, 500, 502).

---

### 1.3 Standardize Auth Extraction

#### A. Replace direct `c.Locals("user_id")` with `getUserID(c)`

3 sites use direct extraction instead of the helper:

| File:Line | Current | Change To |
|-----------|---------|-----------|
| `preferences.go:71` | `logtoSub, ok := c.Locals("user_id").(string)` | `userID := getUserID(c)` |
| `preferences.go:101` | `logtoSub, ok := c.Locals("user_id").(string)` | `userID := getUserID(c)` |
| `main.go:373` | `logtoSub, _ := c.Locals("user_id").(string)` | `userID := getUserID(c)` |

#### B. Rename `logtoSub` to `userID`

Update all downstream references in `preferences.go` and `main.go` (GetDashboard).

#### C. Add proper 401 guard to `GetDashboard`

`main.go:373` currently silently proceeds with an empty user ID. Add the same guard pattern used everywhere else:

```go
userID := getUserID(c)
if userID == "" {
    return c.Status(fiber.StatusUnauthorized).JSON(ErrorResponse{
        Status: "unauthorized",
        Error:  "Authentication required",
    })
}
```

---

### 1.4 Standardize Database Error Handling

#### A. Scan error pattern: log + continue (skip bad rows)

Adopt the safer pattern already used in `rss.go` and `streams.go`. Fix these inconsistencies:

| File:Line | Current Behavior | Fix |
|-----------|-----------------|-----|
| `main.go:300-309` (GetSports) | Returns 500 to client on scan error | Change to `log + continue` |
| `main.go:338-347` (GetFinance) | Returns 500 to client on scan error | Change to `log + continue` |

#### B. Fix `GetDashboard` silent error swallowing

`main.go:396-427` uses `if err == nil { ... }` which silently drops query errors. Change to log the error before continuing:

```go
if err != nil {
    log.Printf("[Dashboard] Failed to query sports: %v", err)
}
```

#### C. Standardize `rows.Close()` to always use `defer`

`main.go:407` calls `rows.Close()` inline. Change to `defer rows.Close()` immediately after the query, matching all other files.

---

## Phase 2 -- Frontend

### 2.1 Eliminate Non-Yahoo `any` Types

5 fixable instances (7 auto-generated and 6 Yahoo-related are skipped):

| # | File:Line | Issue | Fix |
|---|-----------|-------|-----|
| 1 | `useRealtime.ts:111` | `data: any` on `handleStreamData` | Type as `SSEPayload` interface: `{ data?: CDCEvent[] }` |
| 2 | `useRealtime.ts:117` | `event: any` in forEach | Resolved by #1 — event becomes `CDCEvent` |
| 3 | `dashboard.tsx:1529` | `(stream.config as any)?.feeds` | Define `RssStreamConfig` interface, narrow with type guard |
| 4 | `dashboard.tsx:1530` | `(stream.config as any).feeds` | Resolved by #3 |
| 5 | `api/client.ts:17` | Empty `interface RequestOptions extends RequestInit {}` | Remove interface, use `RequestInit` directly |

#### New types to add:

```typescript
// In useRealtime.ts or a shared types file
interface CDCEvent {
  metadata?: { table_name?: string }
  record?: Record<string, unknown>
  changes?: Record<string, unknown> | null
  action?: string
}

interface SSEPayload {
  data?: CDCEvent[]
}

// In dashboard.tsx or api/client.ts
interface RssStreamConfig {
  feeds?: Array<{ name: string; url: string }>
}
```

---

### 2.2 Standardize API Calling Patterns

Audit all `fetch()` calls in dashboard.tsx that bypass `authenticatedFetch`. Ensure:
- All protected API calls use `authenticatedFetch` from `api/client.ts`
- Empty catch blocks have a comment explaining why the error is intentionally swallowed
- No hardcoded API URLs (all should use the exported `API_BASE`)

---

## Phase 3 -- Extension

### 3.1 Fix Popup Type Safety

**File:** `extension/entrypoints/popup/App.tsx`

#### A. Type the message handler (lines 48-55)

Replace `Record<string, unknown>` with the `BackgroundMessage` discriminated union:

```typescript
// Before
const handler = (message: unknown) => {
  const msg = message as Record<string, unknown>
  if (msg.type === 'AUTH_STATUS' && typeof msg.authenticated === 'boolean') { ... }
  if (msg.type === 'CONNECTION_STATUS' && typeof msg.status === 'string') { ... }
}

// After
import type { BackgroundMessage } from '~/utils/messaging'

const handler = (message: BackgroundMessage) => {
  switch (message.type) {
    case 'AUTH_STATUS':
      setAuthenticated(message.authenticated)
      break
    case 'CONNECTION_STATUS':
      setStatus(message.connectionStatus)
      break
  }
}
```

#### B. Type outgoing messages (lines 30, 116, 120)

Import `ClientMessage` type and use it:

```typescript
import type { ClientMessage } from '~/utils/messaging'

const getState: ClientMessage = { type: 'GET_STATE' }
browser.runtime.sendMessage(getState)
```

#### C. Replace template literal classes with `clsx` (lines 132-138, 150-154)

`clsx` is already a dependency (`^2.1.1`) but not imported in this file. Add import and replace 2 instances.

---

## Verification

After all changes:

1. **Go API:** `cd api && go build -o scrollr_api` — must compile cleanly
2. **Frontend:** `cd myscrollr.com && npm run build` — must build with no errors
3. **Extension:** `cd extension && npm run build` — must build for Chrome MV3 with no errors

---

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Go magic values | ~66 instances, 0 constants | 0 instances, ~40 constants |
| Go error response inconsistencies | 9 (2 fiber.Map + 7 wrong Status) | 0 |
| Go status code package mixing | 23 `http.Status*` instances | 0 (all `fiber.Status*`) |
| Go auth extraction methods | 2 methods, 3 variable names | 1 method, 1 variable name |
| Frontend `any` types (non-Yahoo) | 5 instances | 0 |
| Extension popup type issues | 6 unsafe casts + 2 template literals | 0 |

**Expected post-standardization scores:**

| Component | Before | After (estimated) |
|-----------|--------|-------------------|
| Go API | 2.9/5 | ~3.8/5 |
| Frontend | 3.3/5 | ~3.6/5 |
| Extension | 4.4/5 | ~4.7/5 |
| **Monorepo Overall** | **3.6/5** | **~3.9/5** |
