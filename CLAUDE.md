# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyScrollr is a multi-component platform aggregating financial market data (via Finnhub), sports scores (via ESPN), and Yahoo Fantasy Sports integration. It includes a web frontend, browser extension, Go API, and Rust ingestion workers.

| Component | Technology | Files | Purpose |
|-----------|------------|-------|---------|
| **Frontend** | React 19, Vite 7, TanStack Router, Tailwind v4 | 24 TS/TSX | User interface at myscrollr.com |
| **Extension** | WXT v0.20, React 19, Tailwind v4 | 19 TS/TSX | Chrome/Firefox browser extension with scrollbar feed overlay |
| **API** | Go 1.21, Fiber v2, pgx, Redis | 11 Go files (~2k LOC) | Public API server (port 8080) |
| **Ingestion** | Rust (edition 2024), Axum, SQLx, tokio | 28 .rs files | 3 data collection workers + 1 internal library |
| **Database** | PostgreSQL | 9 tables | Data persistence (programmatic schema, no migrations) |
| **Cache** | Redis | — | Caching, token storage, Pub/Sub broadcasting |

## Architecture

### Real-Time Data Pipeline

```
Finnhub WS ──> Finance Service (Rust:3001) ──┐
ESPN HTTP  ──> Sports Service  (Rust:3002) ──┤──> PostgreSQL ──> Sequin CDC
Yahoo API  ──> Yahoo Service   (Rust:3003) ──┘        |
                                                       v
                                              Webhook > Go API (8080)
                                                       |
                                              Redis Pub/Sub > SSE
                                                       |
                                         +-------------+---------------+
                                    Frontend (React)          Extension (WXT)
                                    myscrollr.com              Chrome/Firefox
```

**Data flow**: Rust services write to PostgreSQL -> Sequin (external CDC) detects changes -> webhooks to `POST /webhooks/sequin` -> Go API publishes to Redis `events:broadcast` channel -> Event Hub relays to all SSE clients -> Frontend `useRealtime` hook and Extension background script consume and process CDC records.

### Authentication

- **Frontend**: `@logto/react` SDK with PKCE flow. App ID: `ogbulfshvf934eeli4t9u`
- **Extension**: Separate Logto OAuth client. App ID: `kq298uwwusrvw8m6yn6b4`
- **Backend API**: `LogtoAuth` middleware validates JWT access tokens (Bearer header or cookie), JWKS with auto-refresh
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

```bash
cd ingestion
cargo build                       # Build all services
cargo run -p yahoo_service        # Port 3003
cargo run -p finance_service      # Port 3001
cargo run -p sports_service       # Port 3002

# Docker builds
make build-all                    # All 3 services
make build-finance                # Finance only
make build-sports                 # Sports only
make build-yahoo                  # Yahoo only

# Docker run
make run-finance
make run-sports
make run-yahoo

# Clean up dangling images
make clean
```

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

Cargo workspace with 4 members. All services use Axum, SQLx, tokio. Docker builds use cargo-chef for layer caching with debian:trixie-slim runtime.

| Package | Port | Purpose | Key Dependencies |
|---------|------|---------|------------------|
| `finance_service` | 3001 | Finnhub WebSocket for real-time market data, quote fetching | tokio-tungstenite, reqwest |
| `sports_service` | 3002 | ESPN API polling every 5 minutes for scores | reqwest, chrono |
| `yahoo_service` | 3003 | Active sync worker for Yahoo Fantasy users (120s interval) | yahoo_fantasy lib, aes-gcm, redis |
| `yahoo_fantasy` | (lib) | Internal library: Yahoo OAuth2 flows, XML parsing | oauth2 5.0, quick-xml, serde-xml-rs |

**Config files**:
- `finance_service/configs/subscriptions.json` — 50 tracked symbols (45 stocks + 5 crypto via Binance)
- `sports_service/configs/leagues.json` — 4 leagues (NFL, NBA, NHL, MLB)

### Go API (`api/`)

| File | Lines | Purpose |
|------|-------|---------|
| `main.go` | ~400 | Fiber app init, middleware (CORS, rate limiting, security headers), route definitions, data handlers, health checks |
| `auth.go` | 182 | Logto JWT validation middleware (JWKS refresh, issuer/audience validation) |
| `yahoo.go` | 351 | Yahoo OAuth2 flow (start/callback), league/standings/matchups/roster proxy endpoints |
| `yahoo_models.go` | 164 | XML/JSON model structs for Yahoo Fantasy API |
| `users.go` | 244 | User profile, Yahoo status/leagues/disconnect |
| `database.go` | 135 | PostgreSQL pool (pgxpool), AES-256-GCM encryption helpers |
| `redis.go` | 74 | Redis client, GetCache/SetCache, Publish/Subscribe wrappers |
| `events.go` | 117 | Hub pattern for SSE broadcasting via Redis Pub/Sub |
| `handlers_stream.go` | 72 | SSE endpoint (`GET /events`) with 15s heartbeat |
| `handlers_webhook.go` | 45 | Sequin CDC webhook receiver (`POST /webhooks/sequin`) |
| `models.go` | 38 | Game, Trade, DashboardResponse structs |

### Frontend (`myscrollr.com/`)

React 19 + Vite 7 + TanStack Router + Tailwind CSS v4 + Logto React SDK + Motion (Framer Motion).

**Routes**:
| Route File | Path | Purpose |
|-----------|------|---------|
| `__root.tsx` | Layout | Header, Footer, CommandBackground, global effects |
| `index.tsx` | `/` | Landing page (HeroSection, FeaturesGrid, ScrollHighlight, AboutPreview, CallToAction) |
| `dashboard.tsx` | `/dashboard` | Protected dashboard with finance/sports/fantasy/rss tabs, real-time SSE data |
| `status.tsx` | `/status` | Public system status dashboard — polls `/health` for live service states |
| `callback.tsx` | `/callback` | Logto OAuth callback handler |
| `account.tsx` | `/account` | Account settings (links to /status for system health) |
| `u.$username.tsx` | `/u/:username` | Public user profile |

**Key files**:
- `src/hooks/useRealtime.ts` (230 lines) — EventSource SSE client, processes CDC records for trades/games/yahoo tables
- `src/api/client.ts` — `authenticatedFetch` helper that injects Bearer tokens
- `src/main.tsx` — LogtoProvider wraps RouterProvider for OIDC auth

### Browser Extension (`extension/`)

WXT v0.20 + React 19 + Tailwind v4. Builds for Chrome MV3 and Firefox MV2.

**Entrypoints**:

| Entrypoint | Key Files | Purpose |
|-----------|-----------|---------|
| `background/` | `index.ts`, `sse.ts`, `messaging.ts`, `auth.ts` | SSE pipeline, Chrome message passing, auth state, MV3 alarm-based keepalive |
| `scrollbar.content/` | `index.tsx`, `App.tsx`, `FeedBar.tsx`, `FeedTabs.tsx`, `TradeItem.tsx`, `GameItem.tsx` | Shadow Root UI injected on all URLs, scrollbar feed overlay with finance/sports tabs |
| `popup/` | `index.html`, `main.tsx`, `App.tsx` | Extension popup UI |
| `options/` | `index.html`, `main.tsx`, `App.tsx` | Extension options page |

**Utilities** (`utils/`):
- `constants.ts` — API URL, Logto config, SSE reconnect settings
- `types.ts` — Trade, Game, DashboardResponse, CDCRecord, SSEPayload types
- `messaging.ts` — Message type definitions for background-to-UI communication
- `storage.ts` — WXT storage items: feedPosition, feedHeight, feedMode, feedCollapsed, feedBehavior, feedEnabled, enabledSites, disabledSites, activeFeedTabs, auth tokens

**Manifest config**: Permissions: `storage`, `identity`, `alarms`. Host permissions: `https://api.myscrollr.relentnet.dev/*`, `https://auth.myscrollr.relentnet.dev/*`. PostCSS rem-to-px for content script CSS isolation.

## API Endpoints

### Public Routes
- `GET /health` — API health check
- `GET /events` — SSE stream (15s heartbeat)
- `GET /events/count` — Active viewer count
- `GET /sports/health`, `/finance/health`, `/yahoo/health` — Service health checks
- `GET /yahoo/start` — Initiate Yahoo OAuth flow
- `GET /yahoo/callback` — Yahoo OAuth callback handler
- `POST /webhooks/sequin` — Sequin CDC webhook receiver
- `GET /swagger/*` — Swagger API docs
- `GET /` — JSON API info with links to health, docs, and frontend

### Protected Routes (LogtoAuth middleware)
- `GET /sports` — Sports scores
- `GET /finance` — Market data
- `GET /dashboard` — Combined dashboard data
- `GET /yahoo/leagues` — User's Yahoo leagues
- `GET /yahoo/league/:key/standings` — League standings
- `GET /yahoo/team/:key/matchups` — Team matchups
- `GET /yahoo/team/:key/roster` — Team roster
- `GET /users/:username` — User profile
- `GET /users/me/yahoo-status` — Current user Yahoo connection status
- `GET /users/me/yahoo-leagues` — Current user Yahoo leagues
- `DELETE /users/me/yahoo` — Disconnect Yahoo account

## Database Schema

Tables are created programmatically on service startup via `CREATE TABLE IF NOT EXISTS`. No dedicated migration system exists.

| Table | Created By | Key Columns |
|-------|-----------|-------------|
| `trades` | finance_service | `symbol` (UNIQUE), `price`, `previous_close`, `price_change`, `percentage_change`, `direction`, `last_updated` |
| `tracked_symbols` | finance_service | `symbol` (UNIQUE), `is_enabled` |
| `games` | sports_service | `league` + `external_game_id` (UNIQUE together), scores, teams, `start_time`, `state` |
| `tracked_leagues` | sports_service | `name` (UNIQUE), `slug`, `is_enabled` |
| `yahoo_users` | Go API + yahoo_service | `guid` (PK), `logto_sub` (UNIQUE), `refresh_token` (encrypted), `last_sync` |
| `yahoo_leagues` | yahoo_service | `league_key` (PK), `guid` (FK -> yahoo_users CASCADE), `name`, `game_code`, `season`, `data` (JSONB) |
| `yahoo_standings` | yahoo_service | `league_key` (PK, FK -> yahoo_leagues CASCADE), `data` (JSONB) |
| `yahoo_rosters` | yahoo_service | `team_key` (PK), `league_key` (FK -> yahoo_leagues CASCADE), `data` (JSONB) |
| `yahoo_matchups` | yahoo_service | `team_key` (PK), `data` (JSONB) |

## Development Conventions

- **Error handling (Rust)**: Use `Result`-based errors with `anyhow`, avoid `panic`/`unwrap`
- **Error handling (Go)**: Standard Go error returns with Fiber error responses
- **Database**: Tables created programmatically via `create_tables()` on service startup — no migration framework
- **Logging**: Async logger initialized per service in `log.rs`
- **Token security**: Refresh tokens encrypted with AES-256-GCM in both Go and Rust
- **CSRF protection**: Redis-backed state tokens with 10-minute TTL for Yahoo OAuth
- **Shared logic**: Currently duplicated in each Rust service's `database.rs`/`log.rs` (planned migration to common crate)
- **Extension conventions**: WXT directory-based entrypoints, Shadow Root UI for content script isolation, WXT storage API for preferences

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
| `INTERNAL_FINANCE_URL` | Finance service URL (default: port 3001) |
| `INTERNAL_SPORTS_URL` | Sports service URL (default: port 3002) |
| `INTERNAL_YAHOO_URL` | Yahoo service URL (default: port 3003) |

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
| **Go API** | Docker | Multi-stage: golang:1.21-alpine builder, alpine runtime, port 8080 |
| **Finance Service** | Docker | cargo-chef multi-stage, debian:trixie-slim runtime, port 3001 |
| **Sports Service** | Docker | cargo-chef multi-stage, debian:trixie-slim runtime, port 3002 |
| **Yahoo Service** | Docker | cargo-chef multi-stage, debian:trixie-slim runtime, port 3003 |
| **PostgreSQL** | External | Provided via Coolify |
| **Redis** | External | Provided via Coolify |

**External services**: Logto (auth), Sequin (CDC), Finnhub (finance data), ESPN (sports data), Yahoo Fantasy API.

## Known Issues / Technical Debt

1. **Duplicated Rust code** — `database.rs` and `log.rs` are copy-pasted across all 3 Rust services. Planned migration to a shared common crate.
2. **No migration system** — Database schema changes require manual intervention; tables are only created, never altered programmatically.
3. **Sequin webhook verification incomplete** — `HandleSequinWebhook` reads `SEQUIN_WEBHOOK_SECRET` but doesn't verify signatures yet.
4. **Integrations directory** — `integrations/` contains 15 README/markdown files for a future marketplace system but no implementation code.

## Important Files

- `CLAUDE.md` — This file (AI assistant context)
- `ingestion/README.md` — Detailed Yahoo API documentation
- `ingestion/yahoo_service/yahoo_fantasy/src/lib.rs` — Yahoo OAuth flow implementation
- `myscrollr.com/src/hooks/useRealtime.ts` — SSE real-time data hook (core of frontend real-time)
- `extension/entrypoints/background/sse.ts` — Extension SSE client (core of extension real-time)
- `api/events.go` — SSE Hub pattern for broadcasting
- `api/auth.go` — Logto JWT validation middleware
