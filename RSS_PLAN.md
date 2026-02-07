# MyScrollr — Full RSS Implementation Plan

## Architecture Summary

**Pattern: Option C — `tracked_feeds` + `rss_items` with categorized default catalog**

```
tracked_feeds table (catalog)     user_streams.config.feeds (user selection)
+----------------------------+     +-------------------------------+
| url (PK)                   |     | { "feeds": [                  |
| name                       |     |   { "url": "https://...",     |
| category ("Tech", etc.)    |<----|     "name": "Hacker News" }, |
| is_default                 |     |   { "url": "https://custom",  |
| is_enabled                 |     |     "name": "My Blog" }       |
+------------+---------------+     | ]}                             |
             |                     +-------------------------------+
             |
             v
    rss_items table (articles)
    +------------------------+
    | feed_url (FK ref)      |
    | guid (UNIQUE w/ url)   |
    | title, link, desc      |
    | source_name            |
    | published_at           |
    +------------------------+
```

**Data flow:**
1. RSS service reads `tracked_feeds` (enabled feeds) -> fetches each URL -> parses XML -> upserts into `rss_items`
2. Sequin CDC detects `rss_items` changes -> webhooks to Go API -> Redis Pub/Sub -> SSE
3. Go API `/dashboard` joins `rss_items` with user's `user_streams.config.feeds` URLs -> returns only relevant items
4. Extension filters CDC events client-side by comparing `feed_url` against user's known feeds
5. Frontend `useRealtime.ts` does the same client-side filtering

---

## Execution Order

| # | Task | Scope | Dependencies | Test After? |
|---|------|-------|--------------|-------------|
| 1 | Database tables (`tracked_feeds`, `rss_items`) | Rust RSS service | None | No |
| 2 | Rust RSS ingestion service | `ingestion/rss_service/` | Task 1 | Yes (standalone) |
| 3 | Go API — RSS data in dashboard + health route | `api/` | Tasks 1-2 | Yes |
| 4 | Frontend — `useRealtime.ts` RSS CDC handler | `myscrollr.com/` | Task 3 | No |
| 5 | Frontend — Dashboard RSS config rewrite (catalog browser) | `myscrollr.com/` | Tasks 3-4 | Yes |
| 6 | Go API — `GET /rss/feeds` catalog endpoint | `api/` | Task 1 | Yes |
| 7 | Extension — types, background state, messaging | `extension/` | Task 3 | No |
| 8 | Extension — `RssItem.tsx` + `FeedBar`/`FeedTabs` integration | `extension/` | Task 7 | Yes |
| 9 | Infrastructure — Sequin CDC, Coolify deploy, env vars | Ops | Tasks 1-3 | Yes |

---

## Task 1: Database Tables

### `tracked_feeds` table

Created by the RSS Rust service in `database.rs` `create_tables()`.

```sql
CREATE TABLE IF NOT EXISTS tracked_feeds (
    url             TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'General',
    is_default      BOOLEAN NOT NULL DEFAULT false,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- `url` is the PK — guarantees one entry per feed URL across all users
- `is_default` marks feeds from the seed catalog (prevents deletion)
- `is_enabled` lets us disable a feed globally without deleting it
- `category` groups feeds for the dashboard catalog UI

### `rss_items` table

Also created by the RSS Rust service.

```sql
CREATE TABLE IF NOT EXISTS rss_items (
    id              SERIAL PRIMARY KEY,
    feed_url        TEXT NOT NULL REFERENCES tracked_feeds(url) ON DELETE CASCADE,
    guid            TEXT NOT NULL,
    title           TEXT NOT NULL,
    link            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    source_name     TEXT NOT NULL DEFAULT '',
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(feed_url, guid)
);
```

- `(feed_url, guid)` uniqueness prevents duplicate articles per feed
- `ON DELETE CASCADE` from `tracked_feeds` — if a feed is removed, all its articles go too
- `source_name` is derived from the feed's `<title>` element (e.g., "Hacker News", "TechCrunch")

### Feed sync: user_streams -> tracked_feeds

When a user adds a custom feed URL via the dashboard, the Go API's `UpdateStream` handler should also INSERT the URL into `tracked_feeds` (with `is_default = false`) so the RSS service starts fetching it. This is an upsert — if the URL already exists in `tracked_feeds`, it's a no-op.

**File changes:**
- `api/streams.go` — After updating an RSS stream's config, extract all `feeds[].url` values and upsert each into `tracked_feeds`

---

## Task 2: Rust RSS Ingestion Service

New Cargo workspace member at `ingestion/rss_service/`. Port 3004.

### Files to create

| File | Purpose |
|------|---------|
| `rss_service/Cargo.toml` | Package deps (same base as sports + `feed-rs` crate for RSS/Atom parsing) |
| `rss_service/src/main.rs` | Entry: dotenv, logger, DB pool, spawn polling loop, Axum `/health` |
| `rss_service/src/lib.rs` | `start_rss_service()`: create tables, seed defaults, poll feeds, upsert items |
| `rss_service/src/database.rs` | `initialize_pool()`, `create_tables()`, `get_tracked_feeds()`, `seed_tracked_feeds()`, `upsert_rss_item()` |
| `rss_service/src/log.rs` | Async logger (copy from sports_service, rename log file to `rss.log`) |
| `rss_service/src/types.rs` | `RssHealth` struct with `record_success()`/`record_error()`/`get_health()` |
| `rss_service/configs/feeds.json` | Default feed catalog (~25-30 feeds across 6-8 categories) |
| `rss_service/Dockerfile` | 3-stage cargo-chef build (copy from sports_service, change binary name + port) |

### Default feeds catalog (`configs/feeds.json`)

```json
[
  { "name": "Hacker News", "url": "https://hnrss.org/frontpage", "category": "Tech" },
  { "name": "TechCrunch", "url": "https://techcrunch.com/feed/", "category": "Tech" },
  { "name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "category": "Tech" },
  { "name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "category": "Tech" },
  { "name": "Wired", "url": "https://www.wired.com/feed/rss", "category": "Tech" },
  { "name": "MIT Technology Review", "url": "https://www.technologyreview.com/feed/", "category": "Tech" },
  { "name": "Bloomberg Markets", "url": "https://feeds.bloomberg.com/markets/news.rss", "category": "Finance" },
  { "name": "CNBC Top News", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", "category": "Finance" },
  { "name": "MarketWatch", "url": "https://feeds.marketwatch.com/marketwatch/topstories/", "category": "Finance" },
  { "name": "Yahoo Finance", "url": "https://finance.yahoo.com/news/rssindex", "category": "Finance" },
  { "name": "Investopedia", "url": "https://www.investopedia.com/feedbuilder/feed/getfeed?feedName=rss_headline", "category": "Finance" },
  { "name": "ESPN Top Headlines", "url": "https://www.espn.com/espn/rss/news", "category": "Sports News" },
  { "name": "CBS Sports", "url": "https://www.cbssports.com/rss/headlines/", "category": "Sports News" },
  { "name": "Bleacher Report", "url": "https://bleacherreport.com/articles/feed", "category": "Sports News" },
  { "name": "BBC News", "url": "https://feeds.bbci.co.uk/news/rss.xml", "category": "World News" },
  { "name": "Reuters World", "url": "https://www.reutersagency.com/feed/", "category": "World News" },
  { "name": "AP News", "url": "https://rsshub.app/apnews/topics/apf-topnews", "category": "World News" },
  { "name": "NPR News", "url": "https://feeds.npr.org/1001/rss.xml", "category": "World News" },
  { "name": "Al Jazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml", "category": "World News" },
  { "name": "Nature", "url": "https://www.nature.com/nature.rss", "category": "Science" },
  { "name": "NASA Breaking News", "url": "https://www.nasa.gov/news-release/feed/", "category": "Science" },
  { "name": "Science Daily", "url": "https://www.sciencedaily.com/rss/all.xml", "category": "Science" },
  { "name": "Product Hunt", "url": "https://www.producthunt.com/feed", "category": "Startups" },
  { "name": "Indie Hackers", "url": "https://www.indiehackers.com/feed.xml", "category": "Startups" },
  { "name": "CSS Tricks", "url": "https://css-tricks.com/feed/", "category": "Dev" },
  { "name": "Smashing Magazine", "url": "https://www.smashingmagazine.com/feed/", "category": "Dev" },
  { "name": "Dev.to", "url": "https://dev.to/feed", "category": "Dev" }
]
```

### Polling logic (`lib.rs`)

```
start_rss_service(pool, health):
  1. create_tables(pool)
  2. seed_tracked_feeds(pool, configs/feeds.json)  // ON CONFLICT DO NOTHING
  3. feeds = get_tracked_feeds(pool)  // WHERE is_enabled = true
  4. for each feed:
       a. HTTP GET feed.url (timeout 15s, User-Agent header)
       b. Parse with feed-rs (handles RSS 0.9/1.0/2.0, Atom)
       c. Extract: title, link, description (truncated to 500 chars),
          guid (or link as fallback), published date
       d. source_name = feed.name (from tracked_feeds)
       e. upsert_rss_item(pool, item)  // ON CONFLICT (feed_url, guid) DO UPDATE
       f. health.record_success()
  5. Cleanup: DELETE FROM rss_items WHERE published_at < now() - interval '7 days'
```

Poll interval: **5 minutes** (matches sports_service).

### Dependencies (`Cargo.toml`)

Same as sports_service plus:
- `feed-rs = "2.3"` — robust RSS/Atom parser
- `reqwest` with `rustls-tls` feature (already used by sports_service)

### Workspace changes

**`ingestion/Cargo.toml`:**
Add `"rss_service"` to workspace members.

**`ingestion/Makefile`:**
Add `IMG_RSS := scrollr-rss`, `build-rss`, `run-rss` targets, update `build-all` and `clean`.

---

## Task 3: Go API Changes

### New struct in `models.go`

```go
type RssItem struct {
    ID          int        `json:"id"`
    FeedURL     string     `json:"feed_url"`
    GUID        string     `json:"guid"`
    Title       string     `json:"title"`
    Link        string     `json:"link"`
    Description string     `json:"description"`
    SourceName  string     `json:"source_name"`
    PublishedAt *time.Time `json:"published_at"`
    CreatedAt   time.Time  `json:"created_at"`
    UpdatedAt   time.Time  `json:"updated_at"`
}
```

Add to `DashboardResponse`:
```go
Rss []RssItem `json:"rss"`
```

### New struct for feed catalog

```go
type TrackedFeed struct {
    URL       string `json:"url"`
    Name      string `json:"name"`
    Category  string `json:"category"`
    IsDefault bool   `json:"is_default"`
}
```

### `GetDashboard` — Section 5: RSS items

After the streams section, add per-user RSS query:
- Get user's RSS stream -> extract feed URLs from config
- Query `rss_items WHERE feed_url = ANY(user_urls)` ORDER BY `published_at DESC` LIMIT 50
- Cache per-user with 60s TTL

### New route: `GET /rss/feeds`

Returns the `tracked_feeds` catalog for the dashboard feed browser. Public route (no auth).

### Health route

```go
app.Get("/rss/health", RssHealth)
func RssHealth(c *fiber.Ctx) error { return proxyInternalHealth(c, os.Getenv("INTERNAL_RSS_URL")) }
```

### Health aggregate

Add `"rss"` to the services map in `HealthCheck()`.

### Rate limiter skip

Add `/rss/health` and `/rss/feeds` to the `Next` function.

### Stream update -> tracked_feeds sync

In `UpdateStream`, after a successful RSS stream config update, upsert each feed URL into `tracked_feeds` (with `is_default = false`, `category = 'Custom'`).

### Environment variable

New: `INTERNAL_RSS_URL` (default: `http://localhost:3004`)

### File changes summary

| File | Changes |
|------|---------|
| `api/models.go` | Add `RssItem`, `TrackedFeed` structs; add `Rss []RssItem` to `DashboardResponse` |
| `api/main.go` | Add RSS section to `GetDashboard`; add routes; update health aggregate + rate limiter |
| `api/rss.go` (new) | `GetRSSFeedCatalog`, `getUserRSSFeedURLs`, `queryRSSItems`, `syncRSSFeedsToTracked` |
| `api/streams.go` | After RSS stream update, call `syncRSSFeedsToTracked` |

---

## Task 4: Frontend — `useRealtime.ts` RSS CDC Handler

Add `rss_items` table routing in `handleStreamData`:
- Upsert by `(feed_url, guid)` composite key
- Sort by `published_at` DESC, limit 50
- Add `latestRssItems: RssItem[]` to state and return value

**File:** `myscrollr.com/src/hooks/useRealtime.ts`

---

## Task 5: Frontend — Dashboard RSS Config Rewrite

Replace the existing `RssStreamConfig` component with a **categorized feed catalog browser**:

### New RSS Config UI Layout

```
+-----------------------------------------------------------+
| RSS Feeds                             [On Ticker toggle]   |
+-----------------------------------------------------------+
| Your Feeds (3 active)                                      |
| +-------------------------------------------------------+ |
| | Hacker News          Tech         [Remove]             | |
| | Bloomberg Markets    Finance      [Remove]             | |
| | My Custom Blog       Custom       [Remove]             | |
| +-------------------------------------------------------+ |
|                                                            |
| +-- Add Custom Feed --------------------------------+     |
| | Name: [          ]  URL: [                    ]   |     |
| |                                     [Add Feed]    |     |
| +---------------------------------------------------+     |
|                                                            |
| -- Browse Feed Catalog ---------------------------------   |
| [All] [Tech] [Finance] [Sports News] [World News] ...     |
|                                                            |
| Tech                                                       |
| +---------------+ +---------------+ +---------------+      |
| | TechCrunch    | | The Verge     | | Ars Technica  |      |
| | [+ Add]       | | [Added]       | | [+ Add]       |      |
| +---------------+ +---------------+ +---------------+      |
+-----------------------------------------------------------+
```

### New API client method

```typescript
export const rssApi = {
    getCatalog: () => request<TrackedFeed[]>('/rss/feeds'),
};
```

### Behavior

1. On mount, fetch `GET /rss/feeds` (the catalog)
2. Display user's current feeds (from `stream.config.feeds`) at the top
3. Show "Add Custom Feed" form (existing functionality, preserved)
4. Show "Browse Feed Catalog" with category filter tabs
5. Each catalog feed shows "Add" if not in user's feeds, "Added" if already subscribed
6. Clicking "Add" updates `stream.config.feeds` via `streamsApi.update`

**File:** `myscrollr.com/src/routes/dashboard.tsx` — rewrite `RssStreamConfig` component

---

## Task 6: Go API — `GET /rss/feeds` Catalog Endpoint

Detailed in Task 3. Broken out because the dashboard UI (Task 5) depends on it.

**File:** `api/rss.go`

---

## Task 7: Extension — Types, Background State, Messaging

### `extension/utils/types.ts`

- Add `RssItem` interface
- Add `rss: RssItem[]` to `DashboardResponse`

### `extension/utils/messaging.ts`

- Add `rssItems: RssItem[]` to `StateUpdateMessage` and `StateSnapshotMessage`

### `extension/entrypoints/background/sse.ts`

- Add `let rssItems: RssItem[] = []` module-scoped state
- Add `upsertRssItem()` / `removeRssItem()` helpers
- Add `rss_items` table routing in `processCDCRecord`
- Update `getState()` and `mergeDashboardData()` to include `rssItems`

### `extension/entrypoints/background/messaging.ts`

- Include `rssItems` in all `broadcast` calls, `STATE_SNAPSHOT` responses, and `mergeDashboardData` calls

---

## Task 8: Extension — RssItem Component + FeedBar/FeedTabs Integration

### New: `extension/entrypoints/scrollbar.content/RssItem.tsx`

Two modes (compact/comfort), following TradeItem/GameItem pattern:
- **Compact:** Single row — source name, title (truncated), time ago
- **Comfort:** Two lines — source name + time ago on top, title + description below
- Title is a clickable link (`<a href={item.link} target="_blank">`)

### `FeedTabs.tsx`

Add `{ id: 'rss', label: 'RSS' }` to TABS constant.

### `FeedBar.tsx`

Add `rssItems` prop and `{activeTab === 'rss' && ...}` rendering branch.

### `App.tsx`

Add `rssItems` state, handle in `STATE_UPDATE`/`INITIAL_DATA`/`STATE_SNAPSHOT`, pass to FeedBar.

---

## Task 9: Infrastructure

### Sequin CDC
- Add `rss_items` table to Sequin monitoring
- Reminder: `user_streams` table also still needs to be added

### Coolify Deployment
- Deploy `rss_service` Docker container on port 3004
- Set env vars: `DATABASE_URL`, `PORT=3004`
- Set `INTERNAL_RSS_URL` on the Go API container

### Environment Variables
- Go API: `INTERNAL_RSS_URL` (new)
- RSS Service: `DATABASE_URL`, `PORT` (same pattern as other services)

---

## File Changes Summary

### New files

| File | Task | Description |
|------|------|-------------|
| `ingestion/rss_service/Cargo.toml` | 2 | Package manifest |
| `ingestion/rss_service/src/main.rs` | 2 | Service entry point |
| `ingestion/rss_service/src/lib.rs` | 2 | Polling + parsing logic |
| `ingestion/rss_service/src/database.rs` | 1,2 | Pool, table creation, queries |
| `ingestion/rss_service/src/log.rs` | 2 | Async logger |
| `ingestion/rss_service/src/types.rs` | 2 | RssHealth struct |
| `ingestion/rss_service/configs/feeds.json` | 2 | Default feed catalog |
| `ingestion/rss_service/Dockerfile` | 2 | Docker build |
| `api/rss.go` | 3,6 | RSS helpers + catalog endpoint |
| `extension/entrypoints/scrollbar.content/RssItem.tsx` | 8 | RSS item component |

### Modified files

| File | Tasks | Changes |
|------|-------|---------|
| `ingestion/Cargo.toml` | 2 | Add `rss_service` to workspace members |
| `ingestion/Makefile` | 2 | Add `build-rss`/`run-rss`, update `build-all`/`clean` |
| `api/models.go` | 3 | Add `RssItem`, `TrackedFeed`; update `DashboardResponse` |
| `api/main.go` | 3 | RSS in `GetDashboard`, health route, health aggregate, rate limiter |
| `api/streams.go` | 3 | `syncRSSFeedsToTracked` on RSS stream config update |
| `myscrollr.com/src/hooks/useRealtime.ts` | 4 | Add `rss_items` CDC handler, `latestRssItems` state |
| `myscrollr.com/src/api/client.ts` | 5 | Add `rssApi.getCatalog()` |
| `myscrollr.com/src/routes/dashboard.tsx` | 5 | Rewrite `RssStreamConfig` with catalog browser |
| `extension/utils/types.ts` | 7 | Add `RssItem` interface, update `DashboardResponse` |
| `extension/utils/messaging.ts` | 7 | Add `rssItems` to message types |
| `extension/entrypoints/background/sse.ts` | 7 | Add `rssItems` state, CDC routing, upsert/remove |
| `extension/entrypoints/background/messaging.ts` | 7 | Include `rssItems` in all broadcasts/snapshots |
| `extension/entrypoints/scrollbar.content/App.tsx` | 8 | Add `rssItems` state, handle in messages |
| `extension/entrypoints/scrollbar.content/FeedBar.tsx` | 8 | Add `rssItems` prop, RSS rendering branch |
| `extension/entrypoints/scrollbar.content/FeedTabs.tsx` | 8 | Add RSS tab to TABS |

---

## Key Design Decisions (Locked In)

1. **Option C architecture** — `tracked_feeds` table as catalog + `rss_items` table for articles
2. **Categorized default catalog** — ~27 feeds across 7 categories (Tech, Finance, Sports News, World News, Science, Startups, Dev)
3. **User feed selection stored in `user_streams.config.feeds`** — both default catalog picks and custom URLs
4. **Go API syncs custom URLs to `tracked_feeds`** — so the RSS service discovers them automatically
5. **Per-user RSS filtering at API level** — `/dashboard` joins user's feed URLs with `rss_items`
6. **Client-side CDC filtering** — extension/frontend filter `rss_items` CDC events by comparing `feed_url` against user's known feeds
7. **5-minute poll interval** — consistent with sports_service
8. **7-day article retention** — RSS service cleans up old articles on each poll cycle
9. **Public catalog endpoint** — `GET /rss/feeds` returns the full catalog (no auth needed)
