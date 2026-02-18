# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyScrollr is a multi-component platform aggregating financial market data (via Finnhub), sports scores (via ESPN), RSS news feeds, and Yahoo Fantasy Sports data. It includes a web frontend, browser extension, a core Go gateway API, and fully independent channel services. Deployed on a self-hosted Coolify instance with PostgreSQL, Redis, Logto (auth), and Sequin (CDC) as supporting infrastructure.

**Repository structure**: This is a monorepo with a **decoupled channel architecture**. Each channel (finance, sports, rss, fantasy) is a fully self-contained unit under `channels/` with its own Go API, Rust ingestion service, frontend components, and extension components. The core API (`api/`) is a pure gateway — it handles auth, SSE, CDC dispatch, and route proxying with zero channel-specific code. Each top-level folder is an independently deployable unit configured as its own Coolify resource.

| Component           | Technology                                     | Purpose                                                                                 |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Core API**        | Go 1.21, Fiber v2, pgx, Redis                  | Gateway: auth, SSE, CDC dispatch, channel CRUD, preferences, route proxying (port 8080) |
| **Frontend**        | React 19, Vite 7, TanStack Router, Tailwind v4 | User interface at myscrollr.com                                                         |
| **Extension**       | WXT v0.20, React 19, Tailwind v4               | Chrome/Firefox browser extension with scrollbar feed overlay                            |
| **Finance Channel** | Go API (8081) + Rust service (3001)            | Real-time market data via Finnhub WebSocket                                             |
| **Sports Channel**  | Go API (8082) + Rust service (3002)            | Live scores via ESPN API polling                                                        |
| **RSS Channel**     | Go API (8083) + Rust service (3004)            | RSS/Atom/JSON feed aggregation                                                          |
| **Fantasy Channel** | Go API (8084) + Rust service (3003)            | Yahoo Fantasy Sports sync                                                               |
| **Database**        | PostgreSQL                                     | Data persistence (programmatic schema, no migrations)                                   |
| **Cache**           | Redis                                          | Caching, per-user Pub/Sub routing, subscription sets, channel self-registration         |

## Architecture

### Decoupled Channel Architecture

Each channel is a **fully self-contained, independently deployable unit** with:

- Its own **Go API** (handles CDC routing, dashboard data, health, and channel-specific routes)
- Its own **Rust ingestion service** (collects data and writes to PostgreSQL)
- Its own **frontend DashboardTab** component (rendered by the web dashboard)
- Its own **extension FeedTab** component (rendered by the extension feed bar)
- Its own **config files**, **Docker Compose**, and **manifest.json**

The core API has **zero channel-specific code** — it discovers channels at runtime via Redis self-registration and proxies routes dynamically.

### Real-Time Data Pipeline

```
Finnhub WS ──> Finance Rust (3001) ──┐
ESPN HTTP  ──> Sports Rust  (3002) ──┤
Yahoo API  ──> Fantasy Rust (3003) ──┼──> PostgreSQL ──> Sequin CDC
RSS Feeds  ──> RSS Rust     (3004) ──┘        |
                                               v
                                      Webhook > Core API (8080)
                                               |
                                       POST /internal/cdc to channel Go APIs
                                       (8081, 8082, 8083, 8084)
                                                |
                                       Channel returns user list
                                               |
                                      Core publishes to per-user Redis channels
                                      (events:user:{sub})
                                               |
                                      Authenticated SSE (?token= JWT)
                                               |
                                    +----------+------------+
                               Frontend (React)      Extension (WXT)
                               myscrollr.com          Chrome/Firefox
```

**Data flow**: Rust services write to PostgreSQL → Sequin CDC detects changes → webhooks to `POST /webhooks/sequin` on core API → core forwards CDC record to the relevant channel's `POST /internal/cdc` endpoint → channel returns list of user subs to notify → core publishes to per-user Redis channels `events:user:{sub}` → SSE Hub dispatches to connected clients → Frontend `useRealtime` hook and Extension background script consume CDC records.

### Channel Self-Registration

Each channel Go API registers itself in Redis on startup and maintains presence with a heartbeat:

- **Registration key**: `channel:{name}` (e.g. `channel:finance`)
- **Value**: JSON with `name`, `display_name`, `url`, `capabilities[]`, `tables[]`
- **TTL**: 30 seconds, refreshed every 20 seconds by the channel
- **Discovery**: Core API scans `channel:*` keys every 10 seconds to build its routing table

**Capabilities** (optional interfaces a channel can declare):

- `cdc_handler` — handles CDC records, returns user routing
- `dashboard_provider` — provides dashboard data
- `channel_lifecycle` — receives channel create/update/delete hooks
- `health_checker` — provides health status

### CDC Routing (Core ↔ Channel HTTP Contract)

1. Sequin sends CDC webhook to core: `POST /webhooks/sequin`
2. Core inspects `metadata.table_name`, looks up which channel handles that table
3. Core forwards the CDC record: `POST {channel_url}/internal/cdc`
4. Channel returns `{ "users": ["sub1", "sub2"] }` — the list of users to notify
5. Core publishes the raw CDC payload to each user's Redis channel

**Core-owned tables** (routed directly, no channel involved):

- `user_preferences` → directly to record owner by `logto_sub`
- `user_channels` → directly to record owner by `logto_sub`

### Route Proxying

The core API dynamically proxies routes to channel APIs:

- `GET /{channel_name}/*` → forwards to `{channel_url}/{path}` with `X-User-Sub` header
- Protected routes inject the authenticated user's `logto_sub` via `X-User-Sub`
- Channels **never validate JWTs** — they trust the core's `X-User-Sub` header

### Authentication

- **Frontend**: `@logto/react` SDK with PKCE flow. App ID: `ogbulfshvf934eeli4t9u`
- **Extension**: Separate Logto OAuth client. App ID: `kq298uwwusrvw8m6yn6b4`
- **Core API**: `LogtoAuth` middleware validates JWT access tokens (Bearer header or cookie), JWKS with auto-refresh
- **SSE**: Authenticated via `?token=` query parameter (EventSource does not support custom headers)
- **Channel APIs**: Receive user identity via `X-User-Sub` header from core — no JWT validation
- **Yahoo**: Separate OAuth2 flow at `/yahoo/start` with refresh tokens encrypted (AES-256-GCM) in PostgreSQL

## Directory Structure

```
myscrollr/
├── api/                          # Core gateway API (Go)
│   ├── core/                     #   Server, auth, SSE, channels, preferences, CDC dispatch
│   │   ├── server.go             #     Fiber app, middleware, health, route proxying
│   │   ├── auth.go               #     Logto JWT validation middleware
│   │   ├── discovery.go          #     Redis channel discovery + background scanner
│   │   ├── proxy.go              #     Dynamic route proxying with X-User-Sub injection
│   │   ├── handlers_webhook.go   #     Sequin CDC webhook → HTTP forward to channels
│   │   ├── handlers_channel.go   #     SSE endpoint (GET /events?token=)
│   │   ├── channels.go           #     Channels CRUD, Redis subscription sets
│   │   ├── preferences.go        #     User preferences CRUD
│   │   ├── events.go             #     Per-user SSE Hub via Redis Pub/Sub
│   │   ├── database.go           #     PostgreSQL pool, encryption helpers
│   │   ├── redis.go              #     Redis client, cache, pub/sub helpers
│   │   ├── extension_auth.go     #     Extension PKCE token proxy
│   │   ├── models.go             #     Channel, UserPreferences, DashboardResponse structs
│   │   ├── constants.go          #     Core infrastructure constants only
│   │   ├── helpers.go            #     Shared HTTP helpers
│   │   └── users.go              #     User profile handler
│   ├── main.go                   #   Bootstrap: infrastructure + discovery + server
│   ├── go.mod / go.sum           #   No channel dependencies
│   └── Dockerfile                #   Multi-stage Go build
│
├── channels/                     # Self-contained channel packages
│   ├── node_modules -> ../myscrollr.com/node_modules  # Symlink for TS resolution
│   │
│   ├── finance/                  # Finance channel
│   │   ├── api/                  #   Go API (port 8081)
│   │   │   ├── main.go           #     Bootstrap + Redis self-registration
│   │   │   ├── finance.go        #     CDC routing, dashboard, health
│   │   │   ├── models.go         #     Trade struct
│   │   │   ├── helpers.go        #     Shared utilities
│   │   │   └── Dockerfile
│   │   ├── service/              #   Rust ingestion service (port 3001)
│   │   │   ├── src/              #     Finnhub WebSocket client
│   │   │   ├── Cargo.toml
│   │   │   └── Dockerfile
│   │   ├── web/                  #   Frontend DashboardTab component
│   │   │   └── DashboardTab.tsx
│   │   ├── extension/            #   Extension FeedTab + TradeItem components
│   │   │   ├── FeedTab.tsx
│   │   │   └── TradeItem.tsx
│   │   ├── configs/              #   subscriptions.json (50 tracked symbols)
│   │   ├── manifest.json         #   Static metadata for self-registration
│   │   └── docker-compose.yml    #   Bundles Go API + Rust service
│   │
│   ├── sports/                   # Sports channel (same structure, port 8082/3002)
│   ├── rss/                      # RSS channel (same structure, port 8083/3004)
│   └── fantasy/                  # Fantasy channel (same structure, port 8084/3003)
│       ├── api/                  #   Go API with Yahoo OAuth flow + proxy endpoints
│       │   ├── handlers.go       #     Yahoo OAuth start/callback, league/standings/matchups/roster
│       │   ├── user_handlers.go  #     Yahoo status, leagues, disconnect
│       │   └── models.go         #     Yahoo XML/JSON model structs
│       ├── service/              #   Rust ingestion service + yahoo_fantasy lib crate
│       │   └── yahoo_fantasy/    #     Internal library: Yahoo OAuth2, XML parsing
│       └── YAHOO_API.md          #   Detailed Yahoo API documentation
│
├── myscrollr.com/                # Frontend (React + Vite + TanStack Router)
│   ├── src/
│   │   ├── channels/             #   Channel framework (shared infrastructure)
│   │   │   ├── types.ts          #     DashboardTabProps, ChannelManifest contracts
│   │   │   ├── registry.ts       #     Convention-based discovery via import.meta.glob
│   │   │   └── shared.tsx        #     ChannelHeader, ToggleSwitch, InfoCard components
│   │   ├── routes/               #   TanStack Router file-based routes
│   │   ├── hooks/                #   useRealtime (SSE/CDC), etc.
│   │   ├── api/                  #   API client, channels CRUD, preferences
│   │   └── components/           #   Shared UI components
│   └── vite.config.ts            #   @scrollr alias + resolveExternalChannels plugin
│
├── extension/                    # Browser extension (WXT + React)
│   ├── channels/                 #   Channel framework (shared infrastructure)
│   │   ├── types.ts              #     FeedTabProps, ChannelManifest contracts
│   │   ├── registry.ts           #     Convention-based discovery via import.meta.glob
│   │   └── hooks/useScrollrCDC.ts #    Generic CDC subscription hook
│   ├── entrypoints/              #   WXT entrypoints (background, content, popup)
│   ├── utils/                    #   Constants, types, messaging, storage
│   └── wxt.config.ts             #   @scrollr alias + resolveExternalChannels plugin
│
└── CLAUDE.md                     # This file
```

## Build Commands

### Frontend (`myscrollr.com/`)

```bash
cd myscrollr.com
npm install             # Install dependencies
npm run dev             # Development server (port 3000)
npm run build           # Build for production (vite build && tsc)
npm run serve           # Serve production build
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

### Core API (`api/`)

```bash
cd api
go build -o scrollr_api
./scrollr_api
```

### Channel APIs (`channels/{name}/api/`)

Each channel Go API is an independent module:

```bash
cd channels/finance/api && go build -o finance_api && ./finance_api    # Port 8081
cd channels/sports/api && go build -o sports_api && ./sports_api       # Port 8082
cd channels/rss/api && go build -o rss_api && ./rss_api               # Port 8083
cd channels/fantasy/api && go build -o fantasy_api && ./fantasy_api    # Port 8084
```

### Rust Ingestion Services (`channels/{name}/service/`)

Each service is an independent Cargo crate:

```bash
cd channels/finance/service && cargo run    # Port 3001
cd channels/sports/service && cargo run     # Port 3002
cd channels/fantasy/service && cargo run    # Port 3003
cd channels/rss/service && cargo run        # Port 3004
```

## Channel Details

### Channel Service Ports

| Channel | Go API Port | Rust Service Port | CDC Tables                                                            |
| ------- | ----------- | ----------------- | --------------------------------------------------------------------- |
| Finance | 8081        | 3001              | `trades`                                                              |
| Sports  | 8082        | 3002              | `games`                                                               |
| RSS     | 8083        | 3004              | `rss_items`                                                           |
| Fantasy | 8084        | 3003              | `yahoo_leagues`, `yahoo_standings`, `yahoo_matchups`, `yahoo_rosters` |

### Finance Channel (`channels/finance/`)

- **Rust service**: Persistent Finnhub WebSocket connection for real-time market data
- **Go API**: Broadcasts CDC records to all users in `channel:subscribers:finance` Redis set
- **Config**: `configs/subscriptions.json` — 50 tracked symbols (45 stocks + 5 crypto via Binance)
- **Routes**: `GET /finance` (market data), `GET /finance/health`

### Sports Channel (`channels/sports/`)

- **Rust service**: ESPN API polling every 60 seconds for live scores
- **Go API**: Broadcasts CDC records to all users in `channel:subscribers:sports` Redis set
- **Config**: `configs/leagues.json` — 8 leagues (NFL, NBA, NHL, MLB, College Football, Men's/Women's College Basketball, College Baseball)
- **Routes**: `GET /sports` (scores), `GET /sports/health`

### RSS Channel (`channels/rss/`)

- **Rust service**: RSS/Atom/JSON feed polling every 5 minutes
  - Feed quarantine: 288+ consecutive failures → retried every 288 cycles
  - Smart upserts: `IS DISTINCT FROM` prevents redundant CDC events
  - Article cleanup: Auto-deletes articles older than 7 days
  - Task isolation: Each feed poll in a separate `tokio::task::spawn`
- **Go API**: Per-feed-URL subscriber routing via `rss:subscribers:{feed_url}` Redis sets
  - Channel lifecycle hooks: sync RSS feeds to `tracked_feeds` on channel create/update/delete
  - Feed catalog endpoint: `GET /rss/feeds`
- **Config**: `configs/feeds.json` — 109 default feeds across 8 categories
- **Routes**: `GET /rss/feeds`, `DELETE /rss/feeds`, `GET /rss/health`
- **Capabilities**: `cdc_handler`, `dashboard_provider`, `channel_lifecycle`, `health_checker`

### Fantasy Channel (`channels/fantasy/`)

- **Rust service**: Active sync worker for Yahoo Fantasy users (120s interval, configurable)
  - Includes `yahoo_fantasy` internal library crate for OAuth2 + XML parsing
- **Go API**: CDC routing via DB JOINs (yahoo_users → yahoo_leagues resolution)
  - Yahoo OAuth2 flow (start/callback) with encrypted refresh tokens (AES-256-GCM)
  - League/standings/matchups/roster proxy endpoints
- **Routes**: `GET /yahoo/start`, `GET /yahoo/callback`, `GET /yahoo/leagues`, `GET /yahoo/league/:league_key/standings`, `GET /yahoo/team/:team_key/matchups`, `GET /yahoo/team/:team_key/roster`, `GET /users/me/yahoo-status`, `GET /users/me/yahoo-leagues`, `DELETE /users/me/yahoo`, `GET /fantasy/health`
- **Capabilities**: `cdc_handler`, `dashboard_provider`, `health_checker`

### Channel HTTP Contract

Each channel Go API exposes these internal endpoints (called by core):

| Endpoint                            | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `POST /internal/cdc`                | Receive CDC record, return `{ "users": [...] }`                         |
| `GET /internal/dashboard?sub={sub}` | Return channel-specific dashboard data for user                         |
| `GET /internal/health`              | Return channel health status                                            |
| `POST /internal/channel-lifecycle`  | (if `channel_lifecycle` capability) Handle channel create/update/delete |

### Convention-Based Frontend/Extension Discovery

Channel UI components are discovered at build time via `import.meta.glob`:

- **Frontend**: `import.meta.glob('../../../channels/*/web/DashboardTab.tsx')` in `myscrollr.com/src/channels/registry.ts`
- **Extension**: `import.meta.glob('../../channels/*/extension/FeedTab.tsx')` in `extension/channels/registry.ts`

Each DashboardTab exports a named `{id}Channel: ChannelManifest`. Each FeedTab is matched via a META lookup table in the extension registry.

A custom Vite plugin (`resolveExternalChannels`) in both `myscrollr.com/vite.config.ts` and `extension/wxt.config.ts` resolves bare module imports (react, lucide-react, etc.) from channel files outside the project root by re-resolving with a synthetic importer inside the project.

A symlink `channels/node_modules → ../myscrollr.com/node_modules` enables TypeScript type resolution for channel files.

## Core API Endpoints

### Public Routes

- `GET /health` — Aggregated health (core + all discovered channels)
- `GET /events?token=` — Authenticated SSE stream (15s heartbeat, JWT via query param)
- `GET /events/count` — Active viewer count
- `GET /channels` — List all discovered channels with capabilities
- `POST /webhooks/sequin` — Sequin CDC webhook receiver
- `POST /extension/token` — Extension PKCE code exchange proxy (CORS `*`)
- `POST /extension/token/refresh` — Extension token refresh proxy (CORS `*`)
- `GET /` — JSON API info
- `GET /users/:username` — Public user profile

### Protected Routes (LogtoAuth middleware)

- `GET /dashboard` — Combined dashboard data (proxies to each channel's `/internal/dashboard`)
- `GET /users/me/preferences` — Get user preferences (auto-creates defaults)
- `PUT /users/me/preferences` — Update user preferences
- `GET /users/me/channels` — List user's channel subscriptions
- `POST /users/me/channels` — Create a channel (dispatches channel lifecycle hooks)
- `PUT /users/me/channels/:type` — Update a channel
- `DELETE /users/me/channels/:type` — Delete a channel (cleans up Redis sets)

### Proxied Channel Routes

All other `/{channel}/*` routes are dynamically proxied to the channel's Go API with `X-User-Sub` header injection.

## Database Schema

Tables are created programmatically on service startup via `CREATE TABLE IF NOT EXISTS`. No dedicated migration system exists.

### Finance Tables

| Table             | Key Columns                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `trades`          | `symbol` (UNIQUE), `price`, `previous_close`, `price_change`, `percentage_change`, `direction`, `last_updated` |
| `tracked_symbols` | `symbol` (UNIQUE), `is_enabled`                                                                                |

### Sports Tables

| Table             | Key Columns                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| `games`           | `league` + `external_game_id` (UNIQUE together), scores, teams, `start_time`, `state` |
| `tracked_leagues` | `name` (UNIQUE), `slug`, `is_enabled`                                                 |

### RSS Tables

| Table           | Key Columns                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tracked_feeds` | `url` (PK), `name`, `category`, `is_default`, `is_enabled`, `consecutive_failures`, `last_error`, `last_error_at`, `last_success_at`                                                       |
| `rss_items`     | `id` (SERIAL PK), `feed_url` (FK → tracked_feeds CASCADE), `guid`, `title`, `link`, `description`, `source_name`, `published_at`, `created_at`, `updated_at`. UNIQUE on `(feed_url, guid)` |

### Fantasy/Yahoo Tables

| Table             | Key Columns                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `yahoo_users`     | `guid` (PK), `logto_sub` (UNIQUE), `refresh_token` (encrypted), `last_sync`                         |
| `yahoo_leagues`   | `league_key` (PK), `guid` (FK → yahoo_users CASCADE), `name`, `game_code`, `season`, `data` (JSONB) |
| `yahoo_standings` | `league_key` (PK, FK → yahoo_leagues CASCADE), `data` (JSONB)                                       |
| `yahoo_rosters`   | `team_key` (PK), `league_key` (FK → yahoo_leagues CASCADE), `data` (JSONB)                          |
| `yahoo_matchups`  | `team_key` (PK), `data` (JSONB)                                                                     |

### Core API Tables

| Table              | Key Columns                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user_channels`    | `id` (SERIAL PK), `logto_sub`, `channel_type`, `enabled`, `visible`, `config` (JSONB). UNIQUE on `(logto_sub, channel_type)`                     |
| `user_preferences` | `logto_sub` (PK), `feed_mode`, `feed_position`, `feed_behavior`, `feed_enabled`, `enabled_sites` (JSONB), `disabled_sites` (JSONB), `updated_at` |

## Frontend (`myscrollr.com/`)

React 19 + Vite 7 + TanStack Router + Tailwind CSS v4 + Logto React SDK + Motion (Framer Motion).

**Routes**:
| Route | Path | Purpose |
|-------|------|---------|
| `__root.tsx` | Layout | Header, Footer, CommandBackground, global effects |
| `index.tsx` | `/` | Landing page |
| `dashboard.tsx` | `/dashboard` | Protected dashboard — registry-driven channel management |
| `status.tsx` | `/status` | Public system status dashboard |
| `callback.tsx` | `/callback` | Logto OAuth callback handler |
| `account.tsx` | `/account` | Account settings |
| `channels.tsx` | `/channels` | Future marketplace preview |
| `u.$username.tsx` | `/u/:username` | Public user profile |

**Channel Framework** (`src/channels/`):

- `types.ts` — `DashboardTabProps`, `ChannelManifest` contracts
- `registry.ts` — Convention-based discovery via `import.meta.glob`, `getChannel()`, `sortTabOrder()`, `TAB_ORDER`
- `shared.tsx` — `ChannelHeader`, `ToggleSwitch`, `InfoCard` shared components

**Key files**:

- `src/hooks/useRealtime.ts` — EventSource SSE client, processes CDC records
- `src/api/client.ts` — `authenticatedFetch`, channels CRUD, RSS catalog, preferences APIs
- `src/components/SettingsPanel.tsx` — Extension preference management with CDC sync
- `src/routes/dashboard.tsx` — Registry-driven dashboard with Quick Start, conditional data loading

## Browser Extension (`extension/`)

WXT v0.20 + React 19 + Tailwind v4. Builds for Chrome MV3 and Firefox MV2. Built locally (not deployed via Coolify).

**Channel Framework** (`channels/`):

- `types.ts` — `FeedTabProps`, `ChannelManifest` contracts
- `registry.ts` — Convention-based discovery via `import.meta.glob` with META lookup table
- `hooks/useScrollrCDC.ts` — Generic CDC subscription hook

**Entrypoints**:
| Entrypoint | Purpose |
|-----------|---------|
| `background/` | SSE pipeline, CDC pass-through routing, per-tab subscriptions, auth, preference sync |
| `scrollbar.content/` | Shadow Root UI on all URLs, generic feed shell renders active FeedTab from registry |
| `popup/` | Quick controls popup |

**Messaging protocol** (background ↔ content script):

- `SUBSCRIBE_CDC { tables }` — Subscribe to CDC tables
- `UNSUBSCRIBE_CDC { tables }` — Unsubscribe
- `CDC_BATCH { table, records }` — Routed to subscribed tabs only
- `INITIAL_DATA { dashboard }` — Dashboard snapshot on connect
- `STATE_SNAPSHOT { dashboard }` — Full state on request
- `CONNECTION_STATUS` / `AUTH_STATUS` — State updates

**Manifest config**: Permissions: `storage`, `identity`, `alarms`. Host permissions: `https://api.myscrollr.relentnet.dev/*`, `https://auth.myscrollr.relentnet.dev/*`.

## Development Conventions

- **Error handling (Rust)**: `Result`-based errors with `anyhow`, avoid `panic`/`unwrap`
- **Error handling (Go)**: Standard Go error returns with Fiber error responses
- **Database**: Tables created programmatically via `create_tables()` on startup — no migration framework
- **Token security**: Refresh tokens encrypted with AES-256-GCM in both Go and Rust
- **CSRF protection**: Redis-backed state tokens with 10-minute TTL for Yahoo OAuth
- **Shared logic**: Duplicated per channel (complete independence, no shared Go module)
- **CDC-aware upserts**: RSS service uses `IS DISTINCT FROM` to prevent redundant CDC events
- **Channel isolation**: Each channel owns its own Go API, Rust service, frontend/extension components, and config files. No shared Go modules between channels or between channels and core.
- **HTTP-only contract**: Core ↔ channel communication is strictly HTTP. No shared Go interfaces or types.
- **Self-registration**: Channel Go APIs register in Redis with 30s TTL, 20s heartbeat refresh
- **Route proxying**: Core dynamically proxies `/{name}/*` routes to discovered channels with `X-User-Sub` injection
- **Convention-based UI discovery**: Frontend and extension use `import.meta.glob` to discover channel components at build time from `channels/*/web/` and `channels/*/extension/`
- **External module resolution**: Custom Vite plugins (`resolveExternalChannels`) in both `myscrollr.com/vite.config.ts` and `extension/wxt.config.ts` resolve bare imports for files outside the project root

## Configuration

Copy `.env.example` to `.env` (for local dev) or configure in Coolify.

### Core API Environment Variables

| Variable                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `COOLIFY_FQDN`           | Production domain (single source of truth for URL derivation) |
| `DATABASE_URL`           | PostgreSQL connection string                                  |
| `REDIS_URL`              | Redis connection string                                       |
| `ENCRYPTION_KEY`         | AES-256-GCM key for token encryption (base64, 32 bytes)       |
| `ALLOWED_ORIGINS`        | CORS origins                                                  |
| `FRONTEND_URL`           | Frontend origin                                               |
| `LOGTO_EXTENSION_APP_ID` | Logto app ID for browser extension PKCE proxy                 |
| `SEQUIN_WEBHOOK_SECRET`  | Secret for verifying Sequin webhook requests                  |

### Channel Environment Variables (per channel)

| Variable               | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string (shared DB, natural table isolation) |
| `REDIS_URL`            | Redis connection string                                           |
| `CHANNEL_PORT`         | Go API listen port                                                |
| `INTERNAL_SERVICE_URL` | URL of the co-deployed Rust service                               |
| `FINNHUB_API_KEY`      | (finance only) Finnhub API key                                    |
| `YAHOO_CLIENT_ID`      | (fantasy only) Yahoo OAuth client ID                              |
| `YAHOO_CLIENT_SECRET`  | (fantasy only) Yahoo OAuth client secret                          |
| `ENCRYPTION_KEY`       | (fantasy only) AES-256-GCM key for token encryption               |
| `FRONTEND_URL`         | (fantasy only) For Yahoo OAuth redirect                           |
| `SYNC_INTERVAL_SECS`   | (fantasy only) Yahoo sync interval (default: 120)                 |

### Frontend Environment

`myscrollr.com/.env`: `VITE_API_URL` — API base URL (defaults to `https://api.myscrollr.relentnet.dev`).

## Deployment

Each component is deployed as its own Coolify resource:

| Component      | Method                   | Details                                                    |
| -------------- | ------------------------ | ---------------------------------------------------------- |
| **Core API**   | Docker (Coolify)         | Multi-stage golang:1.21-alpine builder, port 8080          |
| **Finance**    | Docker Compose (Coolify) | Go API (8081) + Rust service (3001)                        |
| **Sports**     | Docker Compose (Coolify) | Go API (8082) + Rust service (3002)                        |
| **RSS**        | Docker Compose (Coolify) | Go API (8083) + Rust service (3004)                        |
| **Fantasy**    | Docker Compose (Coolify) | Go API (8084) + Rust service (3003)                        |
| **Frontend**   | Nixpacks (Coolify)       | `npm install && npm run build`, served via `npm run serve` |
| **Extension**  | Local build              | Not deployed via Coolify. Packaged via `npm run zip`       |
| **PostgreSQL** | Coolify resource         | Shared by all services                                     |
| **Redis**      | Coolify resource         | Caching, Pub/Sub, subscription sets, channel registry      |
| **Logto**      | Coolify resource         | Self-hosted OIDC auth provider                             |
| **Sequin**     | Coolify resource         | External CDC (PostgreSQL → webhooks to core API)           |

## Known Issues / Technical Debt

1. **Duplicated Rust code** — `database.rs` and `log.rs` are copy-pasted across all 4 Rust services.
2. **No migration system** — Tables only created, never altered programmatically (except RSS service which uses idempotent `ALTER TABLE`).
3. **Sequin webhook verification incomplete** — Basic Bearer token comparison only.
4. **No workspace Cargo.toml** — Rust services are independent crates; `cargo build` must be run individually.
5. **Duplicated Go utilities** — Each channel Go API has its own `helpers.go` with copied database/Redis code (by design — complete independence).

## Important Files

- `CLAUDE.md` — This file (AI assistant context)
- `extension/CLAUDE.md` — Extension-specific AI context (detailed architecture, storage, messaging)
- `api/core/discovery.go` — Redis-based channel discovery with background scanner
- `api/core/proxy.go` — Dynamic route proxying with X-User-Sub injection
- `api/core/handlers_webhook.go` — Sequin CDC webhook → HTTP forward to channels
- `api/core/events.go` — Per-user SSE Hub pattern (`events:user:*` pattern subscription)
- `api/core/channels.go` — Channels CRUD with Redis subscription set management
- `api/core/auth.go` — Logto JWT validation middleware
- `channels/finance/api/finance.go` — Finance CDC routing (broadcast pattern)
- `channels/rss/api/rss.go` — RSS CDC routing (per-feed-URL pattern) + channel lifecycle
- `channels/fantasy/api/fantasy.go` — Fantasy CDC routing (JOIN-based resolution)
- `channels/fantasy/api/handlers.go` — Yahoo OAuth flow + API proxy endpoints
- `channels/fantasy/YAHOO_API.md` — Detailed Yahoo API documentation
- `channels/fantasy/service/yahoo_fantasy/src/lib.rs` — Yahoo OAuth flow implementation
- `myscrollr.com/src/hooks/useRealtime.ts` — SSE real-time data hook
- `myscrollr.com/src/channels/registry.ts` — Frontend channel registry (convention-based discovery)
- `myscrollr.com/vite.config.ts` — Vite config with `@scrollr` alias + external channel resolution plugin
- `extension/channels/registry.ts` — Extension channel registry (convention-based discovery)
- `extension/channels/hooks/useScrollrCDC.ts` — Generic CDC subscription hook
- `extension/wxt.config.ts` — WXT config with `@scrollr` alias + external channel resolution plugin
- `extension/utils/storage.ts` — All 13 WXT storage item definitions
