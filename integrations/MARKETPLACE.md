# MyScrollr Connect — Integration Marketplace

## Vision

An open integration platform where community developers build and publish services for MyScrollr users. Developers self-host their integrations, users browse and install them from a marketplace, and developers can charge for premium offerings.

---

## Integration Types

### Data Source Plugins

New data feeds that plug into the ingestion pipeline alongside existing Finnhub, ESPN, and Yahoo services.

- Crypto prices, weather, news, social sentiment, etc.
- Must conform to a standard data output schema
- Ingested data becomes available to the user's dashboard
- Two delivery modes:
  - **Pull** — MyScrollr polls the integration's `GET /data` endpoint on a schedule. Simpler for developers, higher latency.
  - **Push** — Integration publishes directly to the message broker. Lower latency, real-time capable, but requires developers to integrate with the broker SDK.

### Dashboard Widgets

Custom UI components users can add to their dashboard.

- Charts, alerts, leaderboards, tickers, etc.
- Rendered inside the MyScrollr frontend via a sandboxed iframe or module federation
- Must conform to a widget interface contract (size, lifecycle hooks, theming)

### Full-Stack Apps

Standalone mini-apps that run within the MyScrollr ecosystem (similar to Shopify or Slack apps).

- Have their own routes, UI, and backend logic
- Can interact with MyScrollr user data via Logto-issued scoped tokens
- Handle lifecycle hooks: install, uninstall, auth

---

## Data Pipeline Architecture

MyScrollr uses CDC (Change Data Capture) and a message broker for event-driven data flow:

```
Ingestion Service ──► PostgreSQL ──► CDC Connector ──► Message Broker ──► Go API
                                                             ▲
                                                             │
                                                    3rd-party integrations
                                                    (push-mode data sources)
```

### How integrations fit in

- **Pull-mode data sources**: MyScrollr polls `GET /data` → writes to PostgreSQL → CDC captures the change → broker delivers to API. Simple for developers but adds a round-trip.
- **Push-mode data sources**: Integration publishes directly to a broker topic, skipping the poll cycle entirely. Requires Logto M2M token for broker authentication.
- **Lifecycle events** (install, uninstall, data updates): Delivered via broker topics instead of direct HTTP webhooks. Provides built-in retry semantics and delivery guarantees.

### Monitoring

In addition to HTTP health checks (Gatus), the broker layer requires monitoring:

- Consumer lag per integration topic
- Dead letter queue depth
- Message throughput and payload sizes per integration
- Broker cluster health

---

## Authentication: Logto

All authentication — for end users, integration developers, and integration services — runs through [Logto](https://logto.io/), the same OIDC provider already used by the MyScrollr frontend and Go API.

### How Logto covers each actor

| Actor | Logto Flow | Token Type |
|-------|-----------|------------|
| **End user** (browsing marketplace) | Authorization Code + PKCE via `@logto/react` | User access token |
| **Developer** (managing integrations) | Same login, `developer` role assigned | User access token with role claims |
| **Integration service** (calling API on behalf of user) | Authorization Code grant (user-delegated) | Scoped access token |
| **Integration service** (service-to-service) | Client Credentials grant (M2M) | M2M access token |

### API Resources & Scopes

Register the MyScrollr API as a Logto API Resource. Scopes defined in Logto:

| Scope | Description |
|-------|-------------|
| `profile:read` | Read user profile info |
| `dashboard:read` | Read dashboard configuration |
| `dashboard:write` | Add/modify widgets on the dashboard |
| `fantasy:read` | Read fantasy league data |
| `data:write` | Push data into the user's data pipeline |

Logto mints tokens containing only the scopes granted to a specific integration for a specific user. Users can revoke grants at any time (exposed in settings UI via Logto Management API).

### Integration Registration

When a developer creates a new integration, MyScrollr calls the Logto Management API to create a corresponding Logto application:

1. Developer authenticates via Logto (same as any user)
2. Developer requests `developer` role (self-service or admin-granted)
3. Developer creates integration → MyScrollr calls Logto Management API to create an application
4. Integration receives a `client_id` and `client_secret` from Logto
5. Developer configures these credentials in their self-hosted service

### Consent Flow

When a user installs an integration, Logto handles the consent screen natively:

1. User clicks "Install" on a marketplace listing
2. If paid, Stripe Checkout completes first
3. User redirected through Logto authorization flow for the integration's application
4. Logto displays consent: "Crypto Ticker wants access to: Write to your dashboard"
5. User approves → Logto issues a scoped access token
6. Token delivered to the integration via broker lifecycle topic (or `POST /lifecycle/install` fallback)

---

## Execution Model: Self-Hosted by Developers

Developers host their own services and register a base URL with MyScrollr.

### Requirements for developers

- Expose a `GET /health` endpoint for uptime monitoring
- Implement the required API contract for their integration type
- Authenticate using Logto-issued credentials (`client_id` / `client_secret`)

### Health & Uptime

- MyScrollr pings `/health` periodically
- Uptime percentage displayed on the marketplace listing
- Integrations marked degraded/offline after consecutive failures
- Keeps MyScrollr infrastructure costs near zero

---

## API Contract & SDK

### Standard Protocol

Each integration type has a defined contract developers must implement:

| Type | Endpoint / Channel | Description |
|------|-------------------|-------------|
| Data Source (pull) | `GET /data` | Returns data conforming to the source schema |
| Data Source (pull) | `GET /schema` | Describes the data shape and refresh interval |
| Data Source (push) | Broker topic `integrations.{name}.data` | Publishes data conforming to the source schema |
| Widget | `GET /manifest` | Returns widget metadata (size, config options) |
| Widget | `GET /bundle` | Serves the JS bundle for the widget |
| Full App | `POST /lifecycle/install` | Called when a user installs the app (fallback if not using broker) |
| Full App | `POST /lifecycle/uninstall` | Called when a user uninstalls the app (fallback if not using broker) |
| All | `GET /health` | Health check endpoint |

### SDK

Publish official SDKs to simplify development:

- **TypeScript SDK** — covers frontend widget development and Node.js backends
- **Python SDK** — covers data-heavy backends and ML/analytics integrations

SDKs should include:

- Type definitions for all contracts
- Auth helpers wrapping Logto SDKs (`@logto/node` for TypeScript, standard OIDC/JWKS validation for Python)
- Broker client helpers for push-mode data sources
- Testing utilities (mock MyScrollr API, local dev server)
- CLI tool for scaffolding new integrations

---

## Integration Registry & Manifest

Developers register their integration with a `manifest.json`:

```json
{
  "name": "crypto-ticker",
  "display_name": "Crypto Ticker",
  "version": "1.0.0",
  "type": "widget",
  "delivery_mode": "pull",
  "description": "Real-time cryptocurrency price ticker",
  "author": {
    "name": "jane_dev",
    "url": "https://github.com/jane_dev"
  },
  "base_url": "https://crypto-ticker.example.com",
  "scopes": ["dashboard:write"],
  "pricing": {
    "model": "subscription",
    "price_cents": 499,
    "interval": "month"
  },
  "icon": "https://crypto-ticker.example.com/icon.png",
  "screenshots": [
    "https://crypto-ticker.example.com/screenshot1.png"
  ]
}
```

`delivery_mode` is `"pull"` (default) or `"push"` (for data sources that publish to the broker).

The registry is stored in PostgreSQL as the marketplace catalog.

---

## Trust Model: Tiered Verification

### Tiers

| Tier | Badge | Requirements |
|------|-------|-------------|
| **Unverified** | None | Anyone can publish, basic automated checks only |
| **Verified** | Checkmark | Reviewed by MyScrollr team (code quality, security, reliability) |
| **Featured** | Star | Verified + handpicked for marketplace homepage promotion |

### Automated Checks (all tiers)

- Manifest schema validation
- Health endpoint reachability
- Response time benchmarks
- Basic security scan (HTTPS required, no mixed content)

### Manual Review (Verified+)

- Code review or architecture review
- Security audit for data handling
- Uptime history meets threshold (e.g., 99%+ over 30 days)
- Required for all paid integrations

---

## Monetization

### Developer Pricing Options

- **Free** — open to all users
- **One-time purchase** — single payment to unlock
- **Subscription** — monthly or annual recurring billing

### Revenue Split

- Payments handled via Stripe Connect
- Developers receive payouts directly
- MyScrollr takes a platform fee (e.g., 15-20%)

### Billing Flow

1. User clicks "Install" on a paid integration
2. Redirected to Stripe Checkout (or inline payment)
3. On success, redirected through Logto consent flow to grant scopes
4. Logto issues scoped access token; install recorded in database
5. Integration notified via broker lifecycle topic (or `POST /lifecycle/install` fallback)

---

## User Install Flow

### Browse & Discover

- Marketplace page with search, filters (type, category, price, rating)
- Listings show: name, description, screenshots, uptime, rating, verification badge

### Install & Consent

1. User clicks "Install"
2. If paid, Stripe Checkout completes first
3. Logto consent screen displayed (native OIDC consent):
   > **Crypto Ticker** wants access to:
   > - Write to your dashboard
4. User approves via Logto
5. Logto issues a scoped access token for the integration
6. Token delivered to the integration via broker lifecycle topic

### Revoking Access

Users revoke integration access from their MyScrollr settings page. Under the hood, this calls the Logto Management API to revoke the grant, then publishes an uninstall event to the broker lifecycle topic.

---

## Developer Portal

### Features

- Register and manage integrations (backed by Logto application per integration)
- View install counts, revenue, and uptime stats
- Access API documentation and SDK downloads
- Test integrations in a sandbox environment
- Submit for verification review

### Onboarding Flow

1. Developer logs in via Logto (same as any MyScrollr user)
2. Requests or is assigned the `developer` role in Logto
3. Creates a new integration from a template (data source / widget / app)
4. MyScrollr provisions a Logto application for the integration (via Management API)
5. Developer receives `client_id` and `client_secret`
6. Configures manifest and registers base URL
7. Tests locally using the SDK dev server
8. Publishes to the marketplace

---

## Database Schema (Draft)

```sql
-- Integration catalog
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID REFERENCES users(id),
    logto_app_id VARCHAR(100),          -- Logto application ID for this integration
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('data_source', 'widget', 'app')),
    delivery_mode VARCHAR(10) DEFAULT 'pull' CHECK (delivery_mode IN ('pull', 'push')),
    description TEXT,
    base_url VARCHAR(500) NOT NULL,
    manifest JSONB NOT NULL,
    verification_tier VARCHAR(20) DEFAULT 'unverified',
    pricing_model VARCHAR(20) DEFAULT 'free',
    price_cents INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User installations (token management handled by Logto, this tracks install state)
CREATE TABLE user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    integration_id UUID REFERENCES integrations(id),
    scopes TEXT[] NOT NULL,
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, integration_id)
);

-- Health check log
CREATE TABLE integration_health (
    id BIGSERIAL PRIMARY KEY,
    integration_id UUID REFERENCES integrations(id),
    status VARCHAR(10) NOT NULL,
    response_time_ms INTEGER,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings and reviews
CREATE TABLE integration_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    integration_id UUID REFERENCES integrations(id),
    rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, integration_id)
);
```

Key changes from the original schema:
- Added `logto_app_id` to `integrations` — links to the Logto application created for this integration
- Added `delivery_mode` to `integrations` — tracks pull vs push
- Removed `access_token` from `user_integrations` — Logto manages token lifecycle, not us

---

## Infrastructure: Coolify Integration

MyScrollr is deployed on Coolify. While Coolify has no plugin marketplace of its own, its API and Docker-native architecture provide useful building blocks.

### What Coolify gives us

| Capability | How it helps |
|------------|-------------|
| **REST API** (`/v1`, Sanctum auth) | Programmatically create/deploy services, manage domains, trigger deployments |
| **Webhook-triggered deploys** | CI/CD integration for marketplace admin tooling |
| **Automatic SSL** | Let's Encrypt for any service deployed on our infra |
| **280+ one-click services** | Spin up supporting infra (Redis, broker, monitoring, etc.) instantly |
| **Docker-native** | Every service is a container — natural fit for integration health checks and potential future hosted mode |

### Where Coolify fits in the architecture

- **Health monitoring**: Could use Coolify's API to check status of any integrations deployed on our servers (e.g., first-party or featured integrations).
- **Future hosted mode**: If we ever offer to host integrations for developers, Coolify's API can spin up containers programmatically via `POST /v1/applications`.
- **Staging environments**: Use Coolify's project/environment system to give verified developers a staging deploy for testing.
- **Domain management**: Coolify auto-provisions subdomains + SSL, useful if we assign `*.connect.myscrollr.com` subdomains to hosted integrations.
- **Broker & CDC deployment**: Deploy the message broker and CDC connector as Coolify services alongside the existing PostgreSQL and Redis instances.

### What we build ourselves

The marketplace logic (registry, Logto integration management, consent flow, billing, developer portal) is custom — Coolify handles infra, not application-level marketplace features.

---

## Recommended Libraries & Tools

### API Gateway — KrakenD

[KrakenD](https://www.krakend.io/) is a stateless, high-performance API gateway written in Go.

#### Why a gateway at all?

The Go API already validates Logto JWTs in `auth.go` using `keyfunc` + `golang-jwt`. This works today because there's one API, one type of caller (authenticated users), and no scope checking. The marketplace changes this picture in ways that make gateway-level auth worth the additional service:

**1. Multiple callers with different trust levels**

Today `auth.go` handles one case: a logged-in user with a Bearer token. With the marketplace, the API serves three distinct callers — end users, integration services acting on behalf of users (delegated tokens), and integration services calling as themselves (M2M tokens). Each needs different validation rules. In the Go middleware approach, this means branching logic in `LogtoAuth` for every route group. In KrakenD, each endpoint declares its required token type and scopes in a JSON config — no code changes.

**2. Scope enforcement without application code**

The current `LogtoAuth` middleware validates the token signature, issuer, and audience, but does not check scopes. The marketplace introduces five scopes (`profile:read`, `dashboard:write`, etc.) that need per-endpoint enforcement. KrakenD's `jose/validator` plugin reads scopes directly from the JWT and rejects requests missing required scopes before they reach the API. Adding a new protected endpoint is a config change:

```json
{
  "endpoint": "/integrations/{id}/dashboard",
  "extra_config": {
    "auth/validator": {
      "alg": "RS256",
      "jwk_url": "https://your-domain.com/oidc/jwks",
      "issuer": "https://your-domain.com/oidc",
      "scopes_key": "scope",
      "scopes": ["dashboard:write"]
    }
  }
}
```

No corresponding Go code needed. The API trusts that if a request made it through KrakenD, it has the required scopes.

**3. Per-integration rate limiting tied to token claims**

KrakenD can extract the `client_id` or `sub` claim from the JWT and apply rate limits per integration. A misbehaving or compromised integration gets throttled at the gateway before it can overload the API. Building this in Go middleware is possible but requires maintaining rate limiter state (Redis-backed counters, token bucket logic) in application code.

**4. Single enforcement point across multiple services**

As the platform grows, you may have the Go API, a marketplace management service, and broker auth endpoints. Without a gateway, each service duplicates JWT validation — the same `keyfunc` + `golang-jwt` logic from `auth.go` replicated (and potentially diverging) across services. KrakenD validates once at the edge and forwards verified claims as headers.

**5. Defense in depth for untrusted third-party callers**

Integration services are third-party code. Gateway-level auth means token validation happens at the perimeter, not just inside the application. If a middleware ordering bug or route misconfiguration in Go exposes an unprotected endpoint, the gateway still blocks unauthenticated requests.

**6. The Go API gets simpler**

With KrakenD handling JWT validation, the Go API can drop `auth.go` for most routes and trust forwarded headers from the gateway (e.g., `X-User-Id`, `X-Scopes`). The API focuses on business logic. The `LogtoAuth` middleware can remain as a defense-in-depth check or be removed entirely for internal-only routes behind the gateway.

#### When KrakenD might be overkill

- If the marketplace stays small (< 10 integrations) and the Go API is the only backend service, the added operational complexity of another service may not be justified yet.
- If rate limiting needs are simple, Go middleware with a Redis counter may suffice initially.
- KrakenD is easy to add later — it sits in front of the existing API without changing it.

#### KrakenD specifics

- Stateless, config-driven (JSON) — no database required for the gateway itself
- Go plugin system for custom middleware
- 70k+ requests/sec on a single instance
- Native JOSE/JWT validation against JWKS endpoints with automatic key rotation
- Deploys as a single Docker container in Coolify

**Alternative:** [Tyk](https://tyk.io/open-source-api-gateway/) if you want a built-in developer portal UI and dashboard analytics out of the box (heavier, but more batteries-included).

### Payments — Stripe Connect

[Stripe Connect](https://docs.stripe.com/connect) handles the full marketplace payment lifecycle.

**Why it fits:**
- Purpose-built for marketplace payouts (collect from users, split to developers)
- Connected accounts: each developer gets their own Stripe account linked to yours
- Handles tax reporting, international payouts, compliance
- Supports one-time, subscription, and usage-based billing
- Instant Payouts option for developers

**SDKs available:**
- **Go**: Official `stripe-go` SDK — use in the Go API for billing endpoints
- **Rust**: `async-stripe` crate — if billing logic lives in an ingestion service
- **React**: Stripe.js + `@stripe/react-stripe-js` for frontend checkout

**Marketplace flow:**
1. Developer onboards via Stripe Connect OAuth (from a Logto-authenticated session)
2. User purchases → charge created with `application_fee_amount` (your cut)
3. Stripe automatically routes the remainder to the developer's connected account
4. Payouts happen on a configurable schedule (daily, weekly, manual)

### Widget Rendering — Sandboxed iframes

For securely rendering third-party widget code in the React frontend.

**Approach:** Sandboxed `<iframe>` with restrictive permissions.

```html
<iframe
  src="https://widget.example.com/embed"
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
  loading="lazy"
/>
```

**Key libraries:**
- [`react-safe-src-doc-iframe`](https://github.com/godaddy/react-safe-src-doc-iframe) — GoDaddy's library that adds safety guards to srcdoc iframes
- `postMessage` API for parent ↔ widget communication (theme changes, resize events, data passing)

**Security measures:**
- `sandbox="allow-scripts"` only — no `allow-same-origin`, `allow-forms`, or `allow-popups` unless explicitly needed
- CSP headers: `frame-src` whitelist registered integration domains only
- Widget bundles served over HTTPS (enforced by manifest validation)
- `X-Frame-Options` and `Content-Security-Policy` on the parent app

### Developer Portal — Existing tools to accelerate

| Tool | Purpose |
|------|---------|
| [Mintlify](https://mintlify.com/) or [Docusaurus](https://docusaurus.io/) | SDK documentation site |
| [Swagger/OpenAPI](https://swagger.io/) | Auto-generate API reference from your Go API |
| [Moesif](https://www.moesif.com/solutions/developer-portal) | Open-source developer portal with usage analytics, key management |

### Health Monitoring

| Tool | Purpose |
|------|---------|
| [Gatus](https://github.com/TwiN/gatus) | Lightweight Go-based health check monitor — could run as a Coolify service |
| Custom cron job | Simple `GET /health` pinger in Go or Rust, results stored in `integration_health` table |
| Broker monitoring | Consumer lag, DLQ depth, throughput — tool depends on broker choice (Kafka UI, NATS dashboard, RabbitMQ management plugin) |

### Summary: Recommended Stack

```
┌───────────────────────────────────────────────────────┐
│                     React Frontend                     │
│  @logto/react │ Stripe.js │ Sandboxed widget iframes  │
└───────────┬───────────────────────────┬───────────────┘
            │                           │
     ┌──────▼──────┐            ┌───────▼──────┐
     │  KrakenD    │            │  Widget      │
     │  (Logto JWT │            │  iframe      │
     │  validation,│            │  (sandbox)   │
     │  scopes,    │            │              │
     │  rate limit)│            └──────────────┘
     └──────┬──────┘
            │
     ┌──────▼──────┐        ┌──────────────┐
     │  Go Fiber   │◄───────│   Message    │
     │  API        │        │   Broker     │
     │  + Stripe   │        └──────┬───────┘
     └─────────────┘               │
                             ┌─────┴──────┐
            Logto ◄──────    │    CDC     │
         (OIDC provider,     │  Connector │
          M2M tokens,        └─────┬──────┘
          consent,                 │
          roles,             ┌─────▼──────┐
          API resources,     │ PostgreSQL │
          Mgmt API)          └─────┬──────┘
                                   │
                     ┌─────────────┼──────────────┐
              ┌──────▼──────┐      │       ┌──────▼──────┐
              │  Ingestion  │      │       │ 3rd-party   │
              │  Services   │      │       │ Integrations│
              └─────────────┘      │       └──────┬──────┘
                                   │              │
                            ┌──────▼──────┐       │
                            │  Gatus +    │       ▼
                            │  Broker     │   Broker (push,
                            │  Monitoring │   via Logto M2M)
                            └─────────────┘
```

---

## Open Questions

- [ ] KrakenD vs Tyk vs rolling our own lightweight gateway in Go?
- [ ] Rate limiting strategy: HTTP limits (KrakenD) + message throughput limits per M2M client on the broker?
- [ ] How much data source schema flexibility vs strict typing?
- [ ] Versioning strategy for integrations (breaking changes, migration)?
- [ ] CDN / caching layer for widget bundles?
- [ ] How to handle integration deprecation and sunsetting?
- [ ] Stripe Connect account type: Standard vs Express vs Custom?
- [ ] `postMessage` protocol spec for widget ↔ parent communication?
- [ ] Which message broker? NATS (lightweight, fits self-hosted Coolify model), Kafka (durable replay, high throughput), or RabbitMQ (mature, good task-style routing)?
- [ ] Which CDC connector? Debezium is the standard, runs well in Docker/Coolify.
- [ ] Logto application type for integrations: "Traditional Web" for full OAuth, "Machine-to-Machine" for backend-only, or support both?
- [ ] Logto organizations: use for developer teams/orgs, or keep it flat with roles only?
