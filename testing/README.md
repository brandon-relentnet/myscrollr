# Test Infrastructure

Self-contained isolated test environment for MyScrollr backend services.
No real third-party APIs are called — everything runs against mock servers.

---

## Overview

```
dev.enanimate.dev
└── Docker Compose (compose.test.yml)
    ├── Core API           → api/Dockerfile.test
    ├── Finance API         → channels/finance/api/Dockerfile
    ├── Finance Service    → channels/finance/service/Dockerfile
    ├── Sports API         → channels/sports/api/Dockerfile
    ├── Sports Service     → channels/sports/service/Dockerfile
    ├── RSS API            → channels/rss/api/Dockerfile
    ├── RSS Service       → channels/rss/service/Dockerfile
    ├── Fantasy API        → channels/fantasy/api/Dockerfile
    ├── mock-logto         → testing/mocks/logto/
    ├── mock-twelvedata    → testing/mocks/twelvedata/
    ├── mock-apisports     → testing/mocks/apisports/
    ├── mock-yahoo         → testing/mocks/yahoo/
    ├── mock-stripe        → stripe/stripe-mock:v0.182.0
    ├── test-postgres      → postgres:16-alpine
    └── test-redis         → redis:7-alpine
```

---

## Deploying on Coolify (`dev.enanimate.dev`)

### 1. Create the Coolify app

In the Coolify dashboard for your second server (`dev.enanimate.dev`):

1. **New Application** → **Docker Compose**
2. Repository: `https://github.com/Enanimate/myscrollr`
3. Branch: `feature/test-infrastructure` (or `main` once merged)
4. Compose path: `compose.test.yml`
5. **Build Dockerfile override** for `core-api` service:
   - Dockerfile: `api/Dockerfile.test`
   - Build arguments: `COOLIFY_FQDN=dev.enanimate.dev`
   - All other services: use their default Dockerfiles

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

Click **Deploy**. Coolify will:
1. Build all Go and Rust services from their Dockerfiles
2. Build the mock servers from `testing/mocks/*/Dockerfile`
3. Start all containers on the server

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

## Running locally

```sh
# Start the stack
docker compose -f compose.test.yml up -d

# Follow logs
docker compose -f compose.test.yml logs -f

# Stop
docker compose -f compose.test.yml down
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
| `compose.test.yml` | Top-level compose for Coolify deployment |
| `testing/docker-compose.test.yml` | Local-only compose (no backend services) |
| `testing/.env.test` | Env vars for local service runs |
| `testing/mocks/*/main.go` | Custom mock server source code |
| `api/Dockerfile.test` | Core API Dockerfile for test env |
| `channels/rss/service/configs/feeds.test.json` | Seeded RSS feeds for test env |

---

## Swapping between test and prod

All mock URL overrides are environment variables. Production uses the same
codebase with real API keys and no mock URL overrides set.

Test env: `compose.test.yml` with mock URLs set
Prod env: existing deploys (unchanged)

No code changes needed to switch. The only thing that differs is env vars.
