# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyScrollr is a multi-component platform aggregating financial market data (via Finnhub), sports scores (via ESPN), RSS news feeds, and Yahoo Fantasy Sports integration. It includes a web frontend, browser extension, Go API, and Rust ingestion workers. Deployed on a self-hosted Coolify instance with PostgreSQL, Redis, Logto (auth), and Sequin (CDC) as supporting infrastructure.

| Component | Technology | Files | Purpose |
|-----------|------------|-------|---------|
| **Frontend** | React 19, Vite 7, TanStack Router, Tailwind v4 | 26 TS/TSX | User interface at myscrollr.com |
| **Extension** | WXT v0.20, React 19, Tailwind v4 | 27 TS/TSX | Chrome/Firefox browser extension with scrollbar feed overlay |
| **API** | Go 1.21, Fiber v2, pgx, Redis | 24 Go files (~4k LOC) | Public API server (port 8080), modular monolith with plugin-style integration system |
| **Ingestion** | Rust (edition 2024), Axum, SQLx, tokio | 31 .rs files | 4 independent data collection services + 1 internal library |
| **Database** | PostgreSQL | 13 tables | Data persistence (programmatic schema, no migrations) |
| **Cache** | Redis | — | Caching, token storage, per-user Pub/Sub routing, subscription sets |

## Architecture

### Real-Time Data Pipeline

```
Finnhub WS ──> Finance Service (Rust:3001) ──┐
ESPN HTTP  ──> Sports Service  (Rust:3002) ──┤
Yahoo API  ──> Yahoo Service   (Rust:3003) ──┼──> PostgreSQL ──> Sequin CDC
RSS Feeds  ──> RSS Service     (Rust:3004) ──┘        |
                                                       v
                                              Webhook > Go API (8080)
                                                       |
                                              Per-user Redis Pub/Sub
                                              (events:user:{sub})
                                                       |
                                              Authenticated SSE
                                              (?token= JWT)
                                                       |
                                         +-------------+---------------+
                                    Frontend (React)          Extension (WXT)
                                    myscrollr.com              Chrome/Firefox
```

**Data flow**: Rust services write to PostgreSQL -> Sequin (external CDC) detects changes -> webhooks to `POST /webhooks/sequin` -> Go API routes each CDC record to the relevant users via Redis subscription sets -> publishes to per-user Redis channels `events:user:{sub}` -> Event Hub pattern-subscribes to `events:user:*` and dispatches to the correct authenticated SSE client(s) -> Frontend `useRealtime` hook and Extension background script consume and process CDC records.

### Per-User Event Routing

The webhook handler inspects `metadata.table_name` and routes CDC events to only the subscribed users:

| Table | Routing Strategy |
|-------|-----------------|
| `trades` | All users in Redis set `stream:subscribers:finance` |
| `games` | All users in Redis set `stream:subscribers:sports` |
| `rss_items` | Users subscribed to the specific `feed_url` via Redis set `rss:subscribers:{feed_url}` |
| `user_preferences` | Directly to the record owner (by `logto_sub` field) |
| `user_streams` | Directly to the record owner (by `logto_sub` field) |
| `yahoo_leagues` | Resolve `guid` to `logto_sub` via `yahoo_users` table |
| `yahoo_standings` | Resolve `league_key` to `logto_sub` via `yahoo_leagues` + `yahoo_users` join |
| `yahoo_matchups` | Extract league key from `team_key` (e.g. `nfl.l.12345.t.1` -> `nfl.l.12345`), then resolve via join |
| `yahoo_rosters` | Same team_key resolution as matchups |

Redis subscription sets are maintained by the streams CRUD API and warmed on every dashboard load via `syncStreamSubscriptions()`.

### Authentication

- **Frontend**: `@logto/react` SDK with PKCE flow. App ID: `ogbulfshvf934eeli4t9u`
- **Extension**: Separate Logto OAuth client. App ID: `kq298uwwusrvw8m6yn6b4`
- **Backend API**: `LogtoAuth` middleware validates JWT access tokens (Bearer header or cookie), JWKS with auto-refresh
- **SSE**: Authenticated via `?token=` query parameter (EventSource does not support custom headers)
- **Yahoo**: Separate OAuth2 flow at `/yahoo/start` with refresh tokens encrypted (AES-256-GCM) in PostgreSQL

## Build Commands

### Frontend (`myscrollr.com/`)

```bash
cd myscrollr.com
npm install             # Install dependencies
npm run dev             # Development server (port 3000)
npm run build           # Build for production
npm run preview         # Serve production build
npm run lint            # Lint
npm run format          # Format
```

### Browser Extension (`extension/`)

```bash
cd extension
npm install             # Install dependencies
npm run dev             # Dev mode (opens Chrome with extension)
npm run dev:firefox     # Dev mode (Firefox)
npm run build           # Build for Chrome MV3
npm run build:firefox   # Build for Firefox MV2
npm run zip             # Package for Chrome Web Store
npm run zip:firefox     # Package for Firefox Add-ons
npm run postinstall     # wxt prepare (generates types)
```

### Rust Ingestion Services (`ingestion/`)

Each service is an independent Cargo crate (no workspace `Cargo.toml`). Build and run individually:

```bash
cd ingestion/finance_service && cargo run    # Port 3001
cd ingestion/sports_service && cargo run     # Port 3002
cd ingestion/yahoo_service && cargo run      # Port 3003
cd ingestion/rss_service && cargo run        # Port 3004
```

Each service has its own `Dockerfile` for production builds using cargo-chef multi-stage pattern with `debian:trixie-slim` runtime.

### Go API (`api/`)

```bash
cd api
go build -o scrollr_api
./scrollr_api

# Swagger docs (requires swag CLI)
swag init
```

## Key Services

### Rust Ingestion (`ingestion/`)

Four independent Rust crates (not a Cargo workspace). All services use Axum, SQLx, tokio. Docker builds use cargo-chef for layer caching with `debian:trixie-slim` runtime.

| Package | Port | Purpose | Polling Interval | Key Dependencies |
|---------|------|---------|-----------------|------------------|
| `finance_service` | 3001 | Finnhub WebSocket for real-time market data | Persistent WebSocket connection | tokio-tungstenite, reqwest |
| `sports_service` | 3002 | ESPN API polling for scores | 60 seconds | reqwest, chrono |
| `yahoo_service` | 3003 | Active sync worker for Yahoo Fantasy users | 120 seconds (configurable via `SYNC_INTERVAL_SECS`) | yahoo_fantasy lib, aes-gcm, redis |
| `rss_service` | 3004 | RSS/Atom/JSON Feed polling and article ingestion | 300 seconds (5 minutes) | feed-rs, reqwest, chrono |
| `yahoo_fantasy` | (lib) | Internal library: Yahoo OAuth2 flows, XML parsing | — | oauth2 5.0, quick-xml, serde-xml-rs |

**Config files**:
- `finance_service/configs/subscriptions.json` — 50 tracked symbols (45 stocks + 5 crypto via Binance)
- `sports_service/configs/leagues.json` — 8 leagues (NFL, NBA, NHL, MLB, College Football, Men's College Basketball, Women's College Basketball, College Baseball)
- `rss_service/configs/feeds.json` — 117 default feeds across 8 categories (Tech, Dev & AI, Business & Finance, News & Politics, Science & Health, Sports, Entertainment, Design)

**RSS Service features**:
- **Feed quarantine**: Feeds with 288+ consecutive failures (~24 hours) are excluded from regular polling and retried every 288 cycles
- **Smart upserts**: Uses `IS DISTINCT FROM` to prevent redundant Sequin CDC events on unchanged articles
- **Article cleanup**: Automatically deletes articles older than 7 days
- **Task isolation**: Each feed poll runs in a separate `tokio::task::spawn` to isolate panics
- **Custom feeds**: Users can add custom RSS feeds via the API, which are synced to `tracked_feeds` with `is_default=false`

### Go API (`api/`)

The API uses a modular monolith architecture with a plugin-style integration system. Core server infrastructure lives in `core/`, the integration contract in `integration/`, and each data source is a self-contained package in `integrations/`.

**Integration interface design**: A minimal core `Integration` interface (3 methods: `Name`, `DisplayName`, `RegisterRoutes`) plus 5 optional capability interfaces (`CDCHandler`, `DashboardProvider`, `StreamLifecycle`, `HealthChecker`, `Configurable`) checked via Go type assertions. This eliminates no-op stub methods — integrations only implement what they need.

| File | Lines | Purpose |
|------|-------|---------|
| `main.go` | 53 | Bootstrap: creates `core.Server`, registers integrations, starts listener |
| **`integration/`** | | |
| `integration.go` | 127 | Core `Integration` interface + 5 optional capability interfaces (`CDCHandler`, `DashboardProvider`, `StreamLifecycle`, `HealthChecker`, `Configurable`), shared types (`CDCRecord`, `HealthStatus`, `SendToUserFunc`, etc.) |
| **`core/`** | | |
| `server.go` | 328 | Fiber app init, middleware (CORS, rate limiting, security headers), health checks, dashboard aggregation via type assertions |
| `auth.go` | 143 | Logto JWT validation middleware (JWKS refresh, issuer/audience validation) |
| `streams.go` | 437 | Streams CRUD API, Redis subscription set management, `syncStreamSubscriptions()`, `StreamLifecycle` hook dispatch |
| `handlers_webhook.go` | 115 | Sequin CDC webhook receiver, delegates to `CDCHandler` integrations |
| `handlers_stream.go` | 91 | Authenticated SSE endpoint (`GET /events?token=`) with 15s heartbeat |
| `preferences.go` | 243 | User preferences CRUD with auto-creation of defaults, field-level validation |
| `events.go` | 155 | Per-user Hub pattern for SSE via Redis Pub/Sub (`events:user:*` pattern subscription) |
| `database.go` | 138 | PostgreSQL pool (pgxpool), AES-256-GCM encryption helpers, table creation |
| `redis.go` | 92 | Redis client, GetCache/SetCache, PublishRaw, PSubscribe, subscription set helpers |
| `extension_auth.go` | 197 | Extension PKCE token exchange/refresh proxy to Logto (CORS `*`) |
| `models.go` | 101 | Game, Trade, RssItem, TrackedFeed, Stream, UserPreferences, DashboardResponse structs |
| `constants.go` | 118 | Shared constants (URLs, timeouts, cache keys) |
| `helpers.go` | 33 | Shared HTTP helper functions (`ProxyInternalHealth`) |
| `users.go` | 28 | User profile handler |
| **`integrations/finance/`** | | |
| `finance.go` | 127 | Finance integration: CDC routing (broadcast to finance subscribers), dashboard data, health proxy. Implements `CDCHandler`, `DashboardProvider`, `HealthChecker`. |
| **`integrations/sports/`** | | |
| `sports.go` | 127 | Sports integration: CDC routing (broadcast to sports subscribers), dashboard data, health proxy. Implements `CDCHandler`, `DashboardProvider`, `HealthChecker`. |
| **`integrations/rss/`** | | |
| `rss.go` | 363 | RSS integration: CDC routing (per-feed-url subscriber sets), dashboard data, stream lifecycle hooks (sync RSS feeds to `tracked_feeds`), feed catalog routes, health proxy. Implements `CDCHandler`, `DashboardProvider`, `StreamLifecycle`, `HealthChecker`. |
| **`integrations/fantasy/`** | | |
| `fantasy.go` | 197 | Fantasy integration: CDC routing (join-based resolution via `yahoo_users`/`yahoo_leagues`), dashboard data, health proxy. Implements `CDCHandler`, `DashboardProvider`, `HealthChecker`. |
| `handlers.go` | 210 | Yahoo OAuth2 flow (start/callback), league/standings/matchups/roster proxy endpoints |
| `user_handlers.go` | 312 | User Yahoo status, leagues, disconnect handlers |
| `models.go` | 171 | XML/JSON model structs for Yahoo Fantasy API |
| `webhook.go` | 65 | Yahoo-specific CDC record routing helpers |
| **`integrations/_template/`** | | |
| `template.go` | ~240 | Documented scaffold for new integrations with all interfaces, CDC routing patterns, and registration examples |

### Frontend (`myscrollr.com/`)

React 19 + Vite 7 + TanStack Router + Tailwind CSS v4 + Logto React SDK + Motion (Framer Motion).

**Integration Framework**: The frontend uses a registry-driven integration framework mirroring the extension's architecture. Each data source has a self-contained `DashboardTab` component in `src/integrations/official/`. The dashboard route is a generic shell that looks up the active integration from the registry and renders its `DashboardTab`. Integration-specific state (like Yahoo OAuth) is passed via `extraProps`.

**Routes**:
| Route File | Path | Purpose |
|-----------|------|---------|
| `__root.tsx` | Layout | Header, Footer, CommandBackground, global effects |
| `index.tsx` | `/` | Landing page (HeroSection, FeaturesGrid, ScrollHighlight, AboutPreview, CallToAction) |
| `dashboard.tsx` | `/dashboard` | Protected dashboard — registry-driven stream management, sidebar nav, Quick Start, settings panel |
| `status.tsx` | `/status` | Public system status dashboard — polls `/health` for live service states (including RSS) |
| `callback.tsx` | `/callback` | Logto OAuth callback handler |
| `account.tsx` | `/account` | Account settings (links to /status for system health) |
| `integrations.tsx` | `/integrations` | Future marketplace system preview |
| `u.$username.tsx` | `/u/:username` | Public user profile |

**Integration Framework** (`src/integrations/`):

| File | Purpose |
|------|---------|
| `types.ts` | `DashboardTabProps { stream, getToken, connected, onToggle, onDelete, onStreamUpdate, extraProps }` and `IntegrationManifest { id, name, tabLabel, description, icon, DashboardTab }` |
| `registry.ts` | Map of integration ID → manifest. `getIntegration()`, `getAllIntegrations()`, `sortTabOrder()`, `TAB_ORDER` |
| `shared.tsx` | Shared UI components used across integrations: `StreamHeader`, `ToggleSwitch`, `InfoCard` |
| `official/finance/DashboardTab.tsx` | Finance stream config — Finnhub info, tracked symbols preview |
| `official/sports/DashboardTab.tsx` | Sports stream config — ESPN info, league grid |
| `official/fantasy/DashboardTab.tsx` | Fantasy stream config — Yahoo OAuth, league cards with collapsible standings, active/past filter. Receives Yahoo state via `extraProps` |
| `official/rss/DashboardTab.tsx` | RSS stream config — feed management, custom feed form, 117-feed catalog browser with category tabs and pagination |

**Key files**:
- `src/hooks/useRealtime.ts` — EventSource SSE client, processes CDC records for trades/games/rss_items/yahoo/preferences/streams tables
- `src/api/client.ts` — `authenticatedFetch` helper, streams CRUD API, RSS catalog API, preferences API
- `src/components/SettingsPanel.tsx` — Slide-out panel for extension preference management (display mode, position, behavior, site filtering) with real-time CDC sync
- `src/integrations/registry.ts` — Integration registry (maps IDs to manifests, tab ordering)
- `src/main.tsx` — LogtoProvider wraps RouterProvider for OIDC auth

**Dashboard features**:
- **Registry-driven UI**: Dashboard looks up active integration from registry and renders its `DashboardTab` — no if/else chain
- **Stream management**: Users configure which data types they receive via stream CRUD, available types derived from registry
- **RSS feed configuration**: Browse 117-feed catalog by category, add custom feeds, manage subscriptions
- **Quick Start**: One-click creation of finance, sports, and RSS streams
- **Conditional data loading**: Dashboard only fetches data for enabled streams, keeping responses lean
- **Settings panel**: Server-persisted extension preferences with real-time CDC-based sync

### Browser Extension (`extension/`)

WXT v0.20 + React 19 + Tailwind v4. Builds for Chrome MV3 and Firefox MV2. Built locally (not deployed via Coolify).

**Integration Framework**: The extension uses a plugin-style integration framework. Each data source (finance, sports, rss) is a self-contained integration in `integrations/official/`. The background script is a CDC pass-through router — it no longer holds centralized data arrays. Each integration's `FeedTab` component manages its own data via the `useScrollrCDC` hook. The content script's `FeedBar` is a generic shell that renders whichever integration's component is active from the registry.

**Data flow**: SSE CDC records → background `onCDCRecords(table, records)` → `sendCDCBatch()` routes to subscribed content script tabs → `useScrollrCDC` hook receives `CDC_BATCH` messages → upserts/removes items in local state → FeedTab component re-renders.

**Entrypoints**:

| Entrypoint | Key Files | Purpose |
|-----------|-----------|---------|
| `background/` | `index.ts`, `sse.ts`, `messaging.ts`, `auth.ts`, `preferences.ts`, `dashboard.ts` | Authenticated SSE pipeline, CDC pass-through routing, per-tab CDC subscriptions, Chrome message passing, auth state, server preference sync, stream visibility management, MV3 alarm-based keepalive |
| `scrollbar.content/` | `index.tsx`, `App.tsx`, `FeedBar.tsx`, `FeedTabs.tsx`, `ConnectionIndicator.tsx` | Shadow Root UI injected on all URLs, generic scrollbar feed shell — renders active integration's FeedTab from registry |
| `popup/` | `index.html`, `main.tsx`, `App.tsx` | Extension popup UI |

**Integration Framework** (`integrations/`):

| File | Purpose |
|------|---------|
| `types.ts` | `FeedTabProps { mode, streamConfig }` and `IntegrationManifest { id, name, tabLabel, tier, FeedTab }` |
| `registry.ts` | Map of integration ID → manifest. `getIntegration()`, `getAllIntegrations()`, `sortTabOrder()`, `TAB_ORDER` |
| `hooks/useScrollrCDC.ts` | Generic CDC subscription hook — sends `SUBSCRIBE_CDC` to background, listens for `CDC_BATCH`, upsert/remove with key extractor, optional sort/validate, caps at MAX_ITEMS |
| `official/finance/FeedTab.tsx` | Uses `useScrollrCDC('trades')`, renders TradeItem grid |
| `official/finance/TradeItem.tsx` | Individual trade display (price, change, direction arrow) |
| `official/sports/FeedTab.tsx` | Uses `useScrollrCDC('games')`, renders GameItem grid |
| `official/sports/GameItem.tsx` | Individual game display (teams, scores, state) |
| `official/rss/FeedTab.tsx` | Uses `useScrollrCDC('rss_items')`, renders RssItem list sorted by published_at |
| `official/rss/RssItem.tsx` | RSS article display (comfort/compact modes) |

**Messaging protocol** (background ↔ content script):
- `SUBSCRIBE_CDC { tables: string[] }` — Content script tab subscribes to CDC tables
- `UNSUBSCRIBE_CDC { tables: string[] }` — Content script tab unsubscribes
- `CDC_BATCH { table, records }` — Background routes CDC records to subscribed tabs only
- `INITIAL_DATA { dashboard }` — Dashboard snapshot on connect (provides initial items before CDC)
- `STATE_SNAPSHOT { dashboard }` — Full dashboard state on request
- `CONNECTION_STATUS` / `AUTH_STATUS` — Connection and auth state updates

**Utilities** (`utils/`):
- `constants.ts` — API URL, SSE URL, Logto config, SSE reconnect settings, MAX_ITEMS
- `types.ts` — Trade, Game, RssItem, DashboardResponse, CDCRecord, SSEPayload types
- `messaging.ts` — Message type definitions for background-to-UI communication (CDC routing messages)
- `storage.ts` — 13 WXT storage items: feedPosition, feedHeight, feedMode, feedCollapsed, feedBehavior, feedEnabled, enabledSites, disabledSites, activeFeedTabs (`string[]`), userSub, authToken, authTokenExpiry, authRefreshToken

**Server preference sync**: The background script processes `user_preferences` CDC records from SSE and writes the 6 preference fields (feed_mode, feed_position, feed_behavior, feed_enabled, enabled_sites, disabled_sites) to WXT storage items. Content scripts watch these storage items reactively, so preference changes from the web dashboard are applied across all open tabs instantly.

**Stream visibility**: The background tracks stream visibility from `user_streams` CDC records. Only streams with `visible === true` appear as tabs in the feed bar. The tab order is defined by `TAB_ORDER` in the integration registry: `['finance', 'sports', 'fantasy', 'rss']`.

**Manifest config**: Permissions: `storage`, `identity`, `alarms`. Host permissions: `https://api.myscrollr.relentnet.dev/*`, `https://auth.myscrollr.relentnet.dev/*`. PostCSS rem-to-px for content script CSS isolation.

## API Endpoints

### Public Routes
- `GET /health` — Aggregated API health check (includes finance, sports, yahoo, rss service status)
- `GET /events?token=` — Authenticated SSE stream (15s heartbeat, JWT via query param)
- `GET /events/count` — Active viewer count
- `GET /sports/health`, `/finance/health`, `/yahoo/health`, `/rss/health` — Individual service health checks (proxy to internal URLs)
- `GET /rss/feeds` — Public RSS feed catalog (enabled feeds with <3 consecutive failures, cached 5 min)
- `GET /yahoo/start` — Initiate Yahoo OAuth flow
- `GET /yahoo/callback` — Yahoo OAuth callback handler
- `POST /webhooks/sequin` — Sequin CDC webhook receiver (per-user routing)
- `POST /extension/token` — Extension PKCE code exchange proxy (CORS `*`)
- `POST /extension/token/refresh` — Extension token refresh proxy (CORS `*`)
- `GET /swagger/*` — Swagger API docs
- `GET /` — JSON API info with links to health, docs, and frontend

### Protected Routes (LogtoAuth middleware)
- `GET /sports` — Sports scores
- `GET /finance` — Market data
- `GET /dashboard` — Combined dashboard data (stream-aware: only loads data for enabled streams, includes preferences and streams)
- `GET /yahoo/leagues` — User's Yahoo leagues
- `GET /yahoo/league/:key/standings` — League standings
- `GET /yahoo/team/:key/matchups` — Team matchups
- `GET /yahoo/team/:key/roster` — Team roster
- `GET /users/:username` — User profile
- `GET /users/me/yahoo-status` — Current user Yahoo connection status
- `GET /users/me/yahoo-leagues` — Current user Yahoo leagues
- `DELETE /users/me/yahoo` — Disconnect Yahoo account
- `GET /users/me/preferences` — Get user preferences (auto-creates defaults if none exist)
- `PUT /users/me/preferences` — Update user preferences (partial update with field-level validation)
- `GET /users/me/streams` — List user's stream subscriptions
- `POST /users/me/streams` — Create a stream (one per type; syncs RSS feeds to `tracked_feeds`)
- `PUT /users/me/streams/:type` — Update a stream (enabled, visible, config; diffs RSS feed changes)
- `DELETE /users/me/streams/:type` — Delete a stream (cleans up Redis subscription sets)
- `DELETE /rss/feeds` — Delete a custom (non-default) RSS feed from the catalog

## Database Schema

Tables are created programmatically on service startup via `CREATE TABLE IF NOT EXISTS`. No dedicated migration system exists.

### Finance Service Tables
| Table | Key Columns |
|-------|-------------|
| `trades` | `symbol` (UNIQUE), `price`, `previous_close`, `price_change`, `percentage_change`, `direction`, `last_updated` |
| `tracked_symbols` | `symbol` (UNIQUE), `is_enabled` |

### Sports Service Tables
| Table | Key Columns |
|-------|-------------|
| `games` | `league` + `external_game_id` (UNIQUE together), scores, teams, `start_time`, `state` |
| `tracked_leagues` | `name` (UNIQUE), `slug`, `is_enabled` |

### RSS Service Tables
| Table | Key Columns |
|-------|-------------|
| `tracked_feeds` | `url` (PK), `name`, `category`, `is_default`, `is_enabled`, `consecutive_failures`, `last_error`, `last_error_at`, `last_success_at` |
| `rss_items` | `id` (SERIAL PK), `feed_url` (FK -> tracked_feeds CASCADE), `guid`, `title`, `link`, `description`, `source_name`, `published_at`, `created_at`, `updated_at`. UNIQUE on `(feed_url, guid)` |

### Yahoo Service Tables
| Table | Key Columns |
|-------|-------------|
| `yahoo_leagues` | `league_key` (PK), `guid` (FK -> yahoo_users CASCADE), `name`, `game_code`, `season`, `data` (JSONB) |
| `yahoo_standings` | `league_key` (PK, FK -> yahoo_leagues CASCADE), `data` (JSONB) |
| `yahoo_rosters` | `team_key` (PK), `league_key` (FK -> yahoo_leagues CASCADE), `data` (JSONB) |
| `yahoo_matchups` | `team_key` (PK), `data` (JSONB) |

### Go API Tables
| Table | Key Columns |
|-------|-------------|
| `yahoo_users` | `guid` (PK), `logto_sub` (UNIQUE), `refresh_token` (encrypted), `last_sync` |
| `user_streams` | `id` (SERIAL PK), `logto_sub`, `stream_type` (finance/sports/fantasy/rss), `enabled`, `visible`, `config` (JSONB). UNIQUE on `(logto_sub, stream_type)` |
| `user_preferences` | `logto_sub` (PK), `feed_mode`, `feed_position`, `feed_behavior`, `feed_enabled`, `enabled_sites` (JSONB), `disabled_sites` (JSONB), `updated_at` |

## Development Conventions

- **Error handling (Rust)**: Use `Result`-based errors with `anyhow`, avoid `panic`/`unwrap`
- **Error handling (Go)**: Standard Go error returns with Fiber error responses
- **Database**: Tables created programmatically via `create_tables()` on service startup — no migration framework. RSS service uses idempotent `ALTER TABLE` for schema evolution.
- **Logging**: Async logger initialized per service in `log.rs`
- **Token security**: Refresh tokens encrypted with AES-256-GCM in both Go and Rust
- **CSRF protection**: Redis-backed state tokens with 10-minute TTL for Yahoo OAuth
- **Shared logic**: Currently duplicated in each Rust service's `database.rs`/`log.rs` (planned migration to common crate)
- **CDC-aware upserts**: RSS service uses `IS DISTINCT FROM` in upserts to prevent redundant Sequin CDC events when article content hasn't changed
- **Per-user event routing**: Webhook handler routes CDC events to specific users via Redis subscription sets, not broadcast-to-all
- **Preference sync**: Server preferences are pushed to the extension via CDC/SSE; the content script watches WXT storage items reactively for cross-tab updates
- **Stream-driven UI**: Extension tab visibility is driven by `user_streams` CDC records; dashboard conditionally loads data only for enabled streams
- **Extension conventions**: WXT directory-based entrypoints, Shadow Root UI for content script isolation, WXT storage API for preferences, authenticated SSE via `?token=` query param
- **Extension integration framework**: Plugin-style architecture — each data source is a self-contained integration in `extension/integrations/official/` with its own `FeedTab` component and `useScrollrCDC` hook for CDC data management. Background is a CDC pass-through router, not a centralized data store.

## Configuration

Copy `.env.example` to `.env` (for local dev) or configure in Coolify.

| Variable | Purpose |
|----------|---------|
| `COOLIFY_FQDN` | Production domain (single source of truth for URL derivation) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ENCRYPTION_KEY` | AES-256-GCM key for token encryption (base64, 32 bytes) |
| `ALLOWED_ORIGINS` | CORS origins |
| `FRONTEND_URL` | Frontend origin for Yahoo redirect |
| `FINNHUB_API_KEY` | Finnhub market data API key |
| `YAHOO_CLIENT_ID` | Yahoo OAuth client ID |
| `YAHOO_CLIENT_SECRET` | Yahoo OAuth client secret |
| `LOGTO_EXTENSION_APP_ID` | Logto app ID for the browser extension (PKCE proxy) |
| `SEQUIN_WEBHOOK_SECRET` | Secret for verifying Sequin webhook requests |
| `INTERNAL_FINANCE_URL` | Finance service URL (default: port 3001) |
| `INTERNAL_SPORTS_URL` | Sports service URL (default: port 3002) |
| `INTERNAL_YAHOO_URL` | Yahoo service URL (default: port 3003) |
| `INTERNAL_RSS_URL` | RSS service URL (default: port 3004) |
| `SYNC_INTERVAL_SECS` | Yahoo service sync interval in seconds (default: 120) |

**Frontend env** (`myscrollr.com/.env`): `VITE_API_URL` — API base URL (defaults to `https://api.myscrollr.relentnet.dev`).

**Derived URLs** from `COOLIFY_FQDN`:
- API: `https://{COOLIFY_FQDN}`
- Logto: `https://{COOLIFY_FQDN}/oidc`
- JWKS: `https://{COOLIFY_FQDN}/oidc/jwks`
- Yahoo callback: `https://{COOLIFY_FQDN}/yahoo/callback`

## Deployment

| Component | Method | Details |
|-----------|--------|---------|
| **Frontend** | Nixpacks (Coolify) | `npm install && npm run build`, served via `npm run preview` |
| **Go API** | Docker (Coolify) | Multi-stage: golang:1.21-alpine builder, alpine runtime, port 8080 |
| **Finance Service** | Docker (Coolify) | cargo-chef multi-stage, debian:trixie-slim runtime, port 3001 |
| **Sports Service** | Docker (Coolify) | cargo-chef multi-stage, debian:trixie-slim runtime, port 3002 |
| **Yahoo Service** | Docker (Coolify) | cargo-chef multi-stage, debian:trixie-slim runtime, port 3003 |
| **RSS Service** | Docker (Coolify) | cargo-chef multi-stage, debian:trixie-slim runtime, port 3004 |
| **Extension** | Local build | Built locally, not deployed via Coolify. Packaged via `npm run zip` for Chrome Web Store |
| **PostgreSQL** | Coolify resource | Shared by all ingestion services and Go API |
| **Redis** | Coolify resource | Caching, per-user Pub/Sub, subscription sets |
| **Logto** | Coolify resource | Self-hosted OIDC authentication provider |
| **Sequin** | Coolify resource | External CDC — detects PostgreSQL changes and webhooks to Go API |

## Known Issues / Technical Debt

1. **Duplicated Rust code** — `database.rs` and `log.rs` are copy-pasted across all 4 Rust services. Planned migration to a shared common crate.
2. **No migration system** — Database schema changes require manual intervention; tables are only created, never altered programmatically (except RSS service which uses idempotent `ALTER TABLE`).
3. **Sequin webhook verification incomplete** — `HandleSequinWebhook` reads `SEQUIN_WEBHOOK_SECRET` but only does basic Bearer token comparison, not full signature verification.
4. **Integrations directory** — `integrations/` (root-level) contains 15 README/markdown files for a future marketplace system but no implementation code. Not to be confused with `api/integrations/` which contains the actual Go integration packages.
5. **No workspace Cargo.toml** — Despite sharing the `ingestion/` directory and a `target/` folder, the Rust services are independent crates without a workspace. This means `cargo build` must be run individually per service.

## Important Files

- `CLAUDE.md` — This file (AI assistant context)
- `extension/CLAUDE.md` — Extension-specific AI context (detailed architecture, storage schema, messaging protocol)
- `ingestion/README.md` — Detailed Yahoo API documentation
- `ingestion/yahoo_service/yahoo_fantasy/src/lib.rs` — Yahoo OAuth flow implementation
- `myscrollr.com/src/hooks/useRealtime.ts` — SSE real-time data hook (core of frontend real-time, handles trades/games/rss/yahoo/preferences/streams CDC records)
- `myscrollr.com/src/api/client.ts` — API client with streams CRUD, RSS catalog, preferences APIs
- `myscrollr.com/src/components/SettingsPanel.tsx` — Server-persisted extension preference management with CDC sync
- `myscrollr.com/src/integrations/registry.ts` — Frontend integration registry (maps IDs to manifests, tab ordering)
- `myscrollr.com/src/routes/dashboard.tsx` — Registry-driven dashboard with stream management, Quick Start, conditional data loading
- `extension/entrypoints/background/sse.ts` — Extension SSE client (authenticated, CDC processing for trades/games/rss)
- `extension/entrypoints/background/preferences.ts` — Server preference sync and stream visibility management
- `extension/integrations/registry.ts` — Integration registry (maps IDs to manifests, tab ordering)
- `extension/integrations/hooks/useScrollrCDC.ts` — Generic CDC subscription hook for integration FeedTabs
- `extension/integrations/official/rss/RssItem.tsx` — RSS article display component (comfort/compact modes)
- `extension/utils/storage.ts` — All 13 WXT storage item definitions
- `api/integration/integration.go` — Core `Integration` interface + 5 optional capability interfaces, shared types
- `api/INTEGRATIONS.md` — Developer guide for adding new integrations
- `api/core/events.go` — Per-user SSE Hub pattern (`events:user:*` pattern subscription)
- `api/core/handlers_webhook.go` — Sequin CDC webhook with per-user routing logic (table-aware dispatch)
- `api/core/streams.go` — Streams CRUD API with Redis subscription set management
- `api/core/auth.go` — Logto JWT validation middleware
