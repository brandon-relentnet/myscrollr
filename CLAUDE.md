# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MyScrollr is a multi-component platform aggregating financial market data (via Finnhub), sports scores (via ESPN), and Yahoo Fantasy Sports integration:

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React + TanStack Router | User interface at myscrollr.com |
| **API** | Go + Fiber | Public API server (port 8080) |
| **Ingestion** | Rust + Axum | Data collection workers |
| **Database** | PostgreSQL | Data persistence |
| **Cache** | Redis | Caching and tokens |

## Build Commands

### Rust Ingestion Services (in `ingestion/` directory)

```bash
# Build all services
cargo build

# Run individual services
cargo run -p yahoo_service    # Port 8443
cargo run -p finance_service  # Port 3001
cargo run -p sports_service   # Port 3002

# Docker builds
make build-all               # All 3 services
make build-finance           # Finance only
make build-sports            # Sports only
make build-yahoo             # Yahoo only

# Docker run
make run-finance
make run-sports
make run-yahoo

# Clean up dangling images
make clean
```

### Go API (in `api/` directory)

```bash
go build -o scrollr_api
./scrollr_api
```

## Architecture

```
                         +-----------------+
                         |   Go Fiber API  |  ← Public API (port 8080)
                         |   (scrollr_api) |
                         +--------+--------+
                                  |
                         +--------v---------+
                         |   PostgreSQL     |
                         +--------+--------+
                                  |
         +------------------------+-------------------+
         |                        |                   |
+--------v--------+    +----------v-----+    +-------v--------+
| Yahoo Service   |    | Finance Service|    | Sports Service |
| (Rust/Axum)     |    | (Rust/Axum)    |    | (Rust/Axum)   |
| Port 8443       |    | Port 3001      |    | Port 3002     |
+--------+--------+    +-------+---------+    +-------+--------+
         |                    |                      |
         v                    v                      v
   Yahoo OAuth2          Finnhub WS            ESPN HTTP
   Fantasy API           Real-time data        Polling
```

## Key Services

### Rust Ingestion (`ingestion/`)

| Package | Purpose | Key Dependencies |
|---------|---------|------------------|
| `yahoo_service` | OAuth2 flow, Fantasy API proxy | `yahoo_fantasy` lib, sqlx, redis |
| `finance_service` | Finnhub WebSocket for real-time market data | tokio-tungstenite, reqwest |
| `sports_service` | ESPN API polling for sports scores | reqwest, chrono |
| `yahoo_fantasy` | Internal lib: OAuth flows, XML parsing | oauth2, quick-xml |

### Go API (`api/`)

| File | Purpose |
|------|---------|
| `main.go` | Fiber app init, middleware, routing |
| `auth.go` | Logto JWT validation middleware for API routes |
| `database.go` | PostgreSQL (pgx) connection pool |
| `redis.go` | Redis client for token caching |
| `yahoo.go` | Yahoo OAuth callback, token provisioning |

## Development Conventions

- **Error handling**: Use `Result`-based errors with `anyhow`, avoid `panic`/`unwrap`
- **Database**: Tables created programmatically via `create_tables()` on service startup
- **Logging**: Async logger initialized per service in `log.rs`
- **Token security**: Refresh tokens encrypted with AES-256-GCM
- **Shared logic**: Currently duplicated in each service's `database.rs`/`log.rs` (planned migration to common crate)

## Configuration

Copy `ingestion/.env.example` to `.env` (for local dev) or configure in Coolify:

### Authentication

**Frontend**: Uses official `@logto/react` SDK with PKCE flow. Sign-in redirects to Logto, callback handled by `/callback` route.

**Backend API**: Uses `LogtoAuth` middleware for protected routes. Validates JWT access tokens from Logto (Bearer header or cookie).

**Yahoo Integration**: Separate OAuth flow at `/yahoo/start` with tokens stored encrypted in Redis.

| Variable | Purpose |
|----------|---------|
| `COOLIFY_FQDN` | Production domain (single source of truth) |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `ENCRYPTION_KEY` | AES key for token encryption |
| `ALLOWED_ORIGINS` | CORS origins |
| `FRONTEND_URL` | Frontend origin for Yahoo redirect |
| `FINNHUB_API_KEY` | Finnhub market data API |
| `YAHOO_CLIENT_ID/SECRET` | Yahoo OAuth credentials |
| `INTERNAL_FINANCE_URL` | Finance service URL |
| `INTERNAL_SPORTS_URL` | Sports service URL |
| `INTERNAL_YAHOO_URL` | Yahoo service URL |

All URLs derived from `COOLIFY_FQDN`:
- API: `https://{COOLIFY_FQDN}`
- Logto: `https://{COOLIFY_FQDN}/oidc`
- JWKS: `https://{COOLIFY_FQDN}/oidc/jwks`
- Yahoo callback: `https://{COOLIFY_FQDN}/yahoo/callback`

### Frontend (`myscrollr.com/`)

| File | Purpose |
|------|---------|
| `src/main.tsx` | LogtoProvider wraps RouterProvider for OIDC auth |
| `src/routes/callback.tsx` | OAuth callback handler (uses useHandleSignInCallback) |
| `src/components/Header.tsx` | Navigation with Sign In/Sign Out using useLogto hook |
| `src/routes/index.tsx` | Landing page (public vs authenticated views) |
| `src/routes/dashboard.tsx` | Protected dashboard with tabs |

#### Frontend Build Commands

```bash
cd myscrollr.com

# Install dependencies
npm install

# Development server (port 3000)
npm run dev

# Build for production
npm run build

# Lint and format
npm run lint
npm run format
```

## Backend Endpoints (Yahoo Service)

- `GET /yahoo/start` - Initiate Yahoo OAuth flow
- `GET /yahoo/callback` - OAuth callback handler
- `GET /yahoo/leagues` - Fetch user leagues (requires Bearer token)
- `GET /yahoo/league/:key/standings` - League standings
- `GET /yahoo/team/:key/roster` - Team roster
- `GET /yahoo/team/:key/matchups` - Team matchups
- `POST /` - Trigger scheduled updates

## Important Files

- `ingestion/README.md` - Detailed Yahoo API documentation
- `docs/secure.md` - Security audit findings
- `ingestion/yahoo_service/yahoo_fantasy/src/lib.rs` - OAuth flow implementation
