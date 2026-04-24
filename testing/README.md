# Test Infrastructure

Self-contained isolated test environment for MyScrollr backend services.
No real third-party APIs are called — everything runs against mock servers.

---

## Overview

As of 2026-04, the test stack is deployed per-app on Coolify
(`dev.enanimate.dev`). Each app deploys independently from its own
`docker-compose.dev.yml` file; infrastructure (postgres, redis,
stripe-mock) is provisioned directly in Coolify. There is NO longer a
single monolithic `compose.test.yml` — it was split in commit 8ddbb25.

```
dev.enanimate.dev (Coolify)
├── Services (one app each)
│   ├── Core API          → api/docker-compose.dev.yml
│   ├── Finance           → channels/finance/docker-compose.dev.yml (api + service)
│   ├── Sports            → channels/sports/docker-compose.dev.yml (api + service)
│   ├── RSS               → channels/rss/docker-compose.dev.yml    (api + service)
│   ├── Fantasy           → channels/fantasy/docker-compose.dev.yml (api only)
│   └── Website           → myscrollr.com/docker-compose.dev.yml (if present)
├── Mocks (one app each)
│   ├── mock-logto        → testing/mocks/mock-logto.docker-compose.yml
│   ├── mock-twelvedata   → testing/mocks/mock-twelvedata.docker-compose.yml
│   ├── mock-apisports    → testing/mocks/mock-apisports.docker-compose.yml
│   └── mock-yahoo        → testing/mocks/mock-yahoo.docker-compose.yml
└── Infrastructure (Coolify-managed)
    ├── postgres
    ├── redis
    └── stripe-mock
```

Every app's Dockerfile is the SAME one used in prod. The only thing that
differs between dev and prod is environment variables (mock URLs pointed
at the mock containers).

---

## Deploying on Coolify (`dev.enanimate.dev`)

### 1. Create one Coolify app per service

In the Coolify dashboard for your second server (`dev.enanimate.dev`):

For each service (core-api, finance, sports, rss, fantasy) and each mock:

1. **New Application** → **Docker Compose**
2. Repository: `https://github.com/brandon-relentnet/myscrollr`
3. Branch: `main` (or a feature branch for experimental changes)
4. Compose path: `api/docker-compose.dev.yml` (or the appropriate per-app file)
5. No Dockerfile override needed — each compose file points at the
   app's standard `Dockerfile`

### 2. Environment variables

Add these in Coolify's Environment Variables section. Values prefixed
with `${VAR:-default}` use the default if not set.

| Variable | Default | Notes |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://dev.enanimate.dev,http://localhost:5174` | Desktop app dev server |
| `LOGTO_M2M_APP_ID` | `mock_app_id` | Test Logto app ID |
| `LOGTO_M2M_APP_SECRET` | `mock_app_secret` | Test Logto app secret |
| `LOGTO_UPLINK_ROLE_ID` | `mock_uplink_role` | Test role ID |
| `LOGTO_PRO_ROLE_ID` | `mock_pro_role` | Test role ID |
| `LOGTO_ULTIMATE_ROLE_ID` | `mock_ultimate_role` | Test role ID |
| `LOGTO_SUPER_USER_ROLE_ID` | `mock_super_user_role` | Test role ID for super-user invite gating |
| `TWELVEDATA_API_KEY` | `test_twelvedata_key` | Any non-empty string |
| `API_SPORTS_KEY` | `test_api_sports_key` | Any non-empty string |
| `YAHOO_CLIENT_ID` | `test_yahoo_client_id` | Any non-empty string |
| `YAHOO_CLIENT_SECRET` | `test_yahoo_client_secret` | Any non-empty string |
| `FRONTEND_URL` | `http://dev.enanimate.dev` | Your marketing website |
| `SYNC_ENABLED` | `false` | Disable real Yahoo sync (no real creds) |

### 3. Deploy

Click **Deploy** on each Coolify app. Coolify will:
1. Build from the selected repo/branch
2. Start the containers
3. Rolling-update on subsequent pushes to the branch

### 4. Verify

```sh
# Check core API is up
curl http://dev.enanimate.dev/health

# Check a channel
curl http://dev.enanimate.dev/finance/health
curl http://dev.enanimate.dev/sports/health

# Check mocks are responding
curl http://dev.enanimate.dev:9001/oidc/jwks
curl http://dev.enanimate.dev:9002/health
curl http://dev.enanimate.dev:9004/health
curl http://dev.enanimate.dev:9005/health
```

---

## Running locally (single service at a time)

Because the compose files depend on Coolify-managed infra (postgres, redis,
stripe-mock) and a Coolify-internal network, running the full stack locally
via docker-compose is NOT supported. You have three options:

### Option A — Unit tests (fastest, runs in seconds)

Use this for pure logic / state bugs (CDC merging, cache invalidation,
tier-limit checks, selector hooks). Adding a failing test + fix is usually
the fastest path to a bug that's reproducible at all.

```sh
# Core API Go tests
cd api && go test ./...

# Rust service tests (pure ones that don't need a DB)
cd channels/finance/service && cargo test --test migration_versions

# Desktop vitest
cd desktop && npm test
```

Examples of bugs caught this way:
- `api/core/events_cache_test.go` — the 2026-04-24 finance-jitter bug
  (stale dashboard cache overwriting optimistic SSE merges) was
  reproduced in a failing test BEFORE being fixed, then used as the
  regression guard.
- `desktop/src/hooks/useDashboardCDC.test.ts` — asserts the CDC merge
  contract the server fix depends on.

### Option B — Deploy to dev.enanimate.dev

For end-to-end validation, push to a branch on your fork, create a
Coolify app against that branch, and exercise the /control/ endpoints
below to inject scenarios.

### Option C — One service locally, rest in dev

Run ONE service locally against dev-deployed infra:

```sh
# Example: run a modified finance-service against dev DB + mock TwelveData
cd channels/finance/service
export DATABASE_URL="postgres://...dev.enanimate.dev/..."    # from dev secrets
export TWELVEDATA_WS_URL="ws://dev.enanimate.dev:9003/v1/quotes/price"
export TWELVEDATA_API_KEY="test_twelvedata_key"
cargo run --release
```

---

## Mock Server Control APIs

Each mock server exposes a `/control/` endpoint to inject test scenarios.

### TwelveData (mock-twelvedata)

```sh
# Normal price stream (default)
curl -X POST http://localhost:9002/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "normal"}'

# Price spike on next tick
curl -X POST http://localhost:9002/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "spike"}'

# Disconnect after 3 messages
curl -X POST http://localhost:9002/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "disconnect"}'

# No messages sent
curl -X POST http://localhost:9002/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "empty"}'

# Set base price for a symbol
curl -X POST http://localhost:9002/control/price \
  -H 'Content-Type: application/json' \
  -d '{"symbol": "AAPL", "price": 150.00}'
```

### api-sports (mock-apisports)

```sh
curl -X POST http://localhost:9004/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "normal"}'

curl -X POST http://localhost:9004/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "no-games"}'

curl -X POST http://localhost:9004/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "error"}'

# Simulate rate limiting after 5 requests
curl -X POST http://localhost:9004/control/rate-limit \
  -H 'Content-Type: application/json' \
  -d '{"after": 5}'

curl -X POST http://localhost:9004/control/reset \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### Yahoo (mock-yahoo)

```sh
curl -X POST http://localhost:9005/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "normal"}'

# Tokens expire after configured call count
curl -X POST http://localhost:9005/control/token-expires \
  -H 'Content-Type: application/json' \
  -d '{"after": 3}'

curl -X POST http://localhost:9005/control/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario": "rate-limited"}'
```

### Logto (mock-logto)

Logto's mock is passive — it just issues valid JWTs and records role changes.
Role assignments can be inspected in the container logs:

```sh
docker compose -f compose.test.yml logs mock-logto | grep "mock-logto"
```

---

## Connecting the Desktop App

Point the desktop app at the test environment:

```sh
# In desktop/.env
VITE_API_URL=http://dev.enanimate.dev
```

Then run the desktop app normally. It will hit the test backend,
which hits mock servers — no real APIs involved.

---

## File Reference

| File | Purpose |
|---|---|
| `api/docker-compose.dev.yml` | Core API (for `dev.enanimate.dev`) |
| `channels/*/docker-compose.dev.yml` | Per-channel dev deploys |
| `testing/mocks/*.docker-compose.yml` | Per-mock dev deploys |
| `testing/mocks/*/main.go` | Mock server source code |
| `testing/.env.test` | Env-var reference for local service runs (Option C) |
| `channels/rss/service/configs/feeds.test.json` | Seed RSS feeds (dev-only) |

---

## Debugging workflow (recommended)

When you find a bug in prod:

1. **Write a failing unit test** that reproduces the bug. This is almost
   always possible for data/state bugs. Reference `events_cache_test.go`
   for a worked example of reproducing a CDC-driven UI regression.
2. **Apply the fix** — the test turns green.
3. **Push to main** — CI runs the test; prod gets the fix on next deploy.
4. **Only use dev.enanimate.dev for issues that can't be reproduced in
   a unit test** (e.g., UI/UX bugs, browser-specific issues, race
   conditions between live external APIs).

When the test infrastructure flags a regression, treat the test as the
source of truth — it captures the invariant you want to preserve.

---

## Swapping between test and prod

All mock URL overrides are environment variables. Production uses the
same codebase with real API keys and no mock URL overrides set.

Test env (`dev.enanimate.dev`): Coolify apps with mock URLs set in env
Prod env (`do-nyc3-scrollr-cluster`): k8s deployments with real API keys

No code changes needed to switch. The only thing that differs is env vars.
