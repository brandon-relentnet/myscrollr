# Gateway — KrakenD API Gateway

## Purpose

API gateway sitting in front of the Go Fiber API, handling JWT validation, scope enforcement, and per-integration rate limiting for all inbound traffic — from end users, integration services (delegated tokens), and M2M callers.

## Why It Exists

The current Go API (`api/auth.go`) validates Logto JWTs with a single middleware that checks signature, issuer, and audience. This works for one caller type (authenticated users) but doesn't scale to the marketplace model where three distinct callers need different validation rules and per-endpoint scope checks. Moving auth to a gateway layer keeps the API focused on business logic and provides a single enforcement point across all backend services.

See [MARKETPLACE.md — KrakenD section](../MARKETPLACE.md#api-gateway--krakend) for the full rationale, including why gateway-level auth matters for untrusted third-party callers.

## How It Fits

```
React Frontend / Integration Services
            │
     ┌──────▼──────┐
     │   KrakenD   │  ← this component
     │  (gateway/) │
     └──────┬──────┘
            │  Forwarded headers: X-User-Id, X-Scopes, X-Client-Id
     ┌──────▼──────┐
     │  Go Fiber   │  (api/)
     │  API        │
     └─────────────┘
```

- **Upstream**: All external HTTP traffic (frontend, integration services)
- **Downstream**: Go Fiber API (`api/`), potentially other internal services
- **Auth provider**: Logto JWKS endpoint for token validation
- **Relates to**: `api/auth.go` — the gateway replaces or supplements this middleware for marketplace routes

## What Goes Here

```
gateway/
├── README.md               # This file
├── krakend.json            # Main KrakenD configuration (endpoints, auth, rate limits)
├── Dockerfile              # KrakenD container build
├── settings/               # Environment-specific overrides
│   ├── dev.json
│   └── prod.json
└── plugins/                # Custom Go plugins (if needed)
```

## Security: Per-Integration Enforcement

The gateway is the perimeter — it's the single point where all inbound requests from third-party integrations are authenticated, authorized, and rate-limited before reaching the API.

### Scope enforcement

KrakenD's `jose/validator` reads scopes from the JWT and rejects requests missing required scopes before they hit the Go API. Each endpoint declares its required scopes in `krakend.json`:

```json
{
  "endpoint": "/integrations/{id}/dashboard",
  "extra_config": {
    "auth/validator": {
      "scopes": ["dashboard:write"]
    }
  }
}
```

The API trusts that if a request reached it through the gateway, it has the required scopes.

### Per-integration rate limiting

Extract `client_id` (for M2M tokens) or `sub` (for delegated tokens) from the JWT and apply per-integration rate limits. This prevents a misbehaving or compromised integration from overloading the API:

- **Default limits**: Applied to all integrations (e.g., 100 req/min)
- **Tier-based overrides**: Verified/Featured integrations can request higher limits
- **Burst protection**: Token bucket algorithm allows short bursts but enforces sustained rate

### Anomaly data for health monitoring

The gateway generates per-integration request metrics (volume, error rates, scope usage patterns) that feed into `health/`'s anomaly detection. Unusual patterns (volume spikes, new scope usage, off-hours activity) are flagged for review.

### Defense in depth

The gateway handles auth at the perimeter, but `api/auth.go` can remain as a secondary check for internal routes. This protects against gateway misconfiguration — if a route is accidentally exposed without gateway auth, the API middleware still blocks unauthenticated requests.

## Key Decisions / Open Questions

- **KrakenD vs Tyk vs custom Go gateway?** KrakenD is the current recommendation for its stateless, config-driven model. Tyk offers a built-in developer portal but is heavier. See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Rate limiting strategy**: HTTP rate limits here + message throughput limits on the broker. How should they coordinate?
- **Phasing**: The gateway can be added incrementally — it sits in front of the existing API without changing it. `api/auth.go` can remain as defense-in-depth initially.
