# Registry — Integration Catalog & Manifest Validation

## Purpose

Manages the integration catalog: storing manifests, validating submissions, enforcing the tiered verification model, and serving the marketplace browse/search API. This is the source of truth for what integrations exist and their current status.

## Why It Exists

The marketplace needs a structured catalog that goes beyond a simple database table. The registry handles manifest validation (schema conformance, URL reachability, HTTPS enforcement), verification tier management (unverified → verified → featured), and provides the query layer for marketplace search and filtering.

See [MARKETPLACE.md — Integration Registry & Manifest](../MARKETPLACE.md#integration-registry--manifest) for the manifest schema and [Trust Model](../MARKETPLACE.md#trust-model-tiered-verification) for verification tiers.

## How It Fits

```
Developer Portal ──► Registry ──► PostgreSQL (integrations table)
                        │
                        ├──► Logto Management API (create app per integration)
                        └──► Health service (register new endpoints to monitor)

Marketplace UI ──► Go API ──► Registry (query catalog)
```

- **Upstream**: Developer portal (submissions), Go API (marketplace queries)
- **Downstream**: PostgreSQL (`integrations` table), Logto Management API (application provisioning)
- **Relates to**: `api/` (serves marketplace listings), `portal/` (developer submission UI), `health/` (monitors registered endpoints), `schemas/` (manifest validation schemas)

## What Goes Here

```
registry/
├── README.md               # This file
├── src/                    # Registry service code (likely Go, extending api/)
│   ├── manifest.go         # Manifest parsing and validation
│   ├── catalog.go          # CRUD operations for integration catalog
│   ├── verification.go     # Tier management and automated checks
│   └── search.go           # Marketplace search and filtering
├── migrations/             # SQL migrations for integrations tables
└── tests/
```

Whether this lives as a separate service or as routes within the Go API is an implementation decision — starting as Go API routes in `api/` is simpler; extracting later is straightforward.

## Security: Submission-Time Checks

The registry is the first line of defense against malicious integrations. All checks below run when a developer submits or updates an integration.

### Manifest validation

- Schema conformance against `schemas/manifest.schema.json`
- HTTPS required for `base_url` and all URLs (icon, screenshots)
- `scopes` must be a subset of valid Logto scopes
- **Scope justification required**: Developer must provide a text explanation for each requested scope (stored in manifest, displayed on consent screen and to reviewers)
- **Network allowlist**: Manifest must declare an `allowed_domains` array — external domains the integration communicates with. Enforced via CSP on widget iframes, audited for data source integrations

### Scope restrictions by tier

Not all scopes are available to all tiers. This limits what an unreviewed integration can access:

| Scope | Unverified | Verified | Featured |
|-------|-----------|----------|----------|
| `dashboard:write` | Yes | Yes | Yes |
| `dashboard:read` | Yes | Yes | Yes |
| `profile:read` | **No** | Yes | Yes |
| `fantasy:read` | **No** | Yes | Yes |
| `data:write` | **No** | Yes | Yes |

Unverified integrations can only render widgets and read dashboard state. Access to user profile data or the data pipeline requires passing manual review.

### Static analysis (widget bundles)

For widget-type integrations, the registry fetches the JS bundle from `GET /bundle` and runs automated scans:

- **Phishing patterns**: `<input type="password">`, `<form action="...">`, references to `document.cookie`, `localStorage`, `navigator.credentials`
- **Sandbox escape attempts**: `window.top`, `window.parent.location`, `document.domain`
- **Undeclared network calls**: `fetch()` / `XMLHttpRequest` to domains not in the manifest's `allowed_domains`
- **Dangerous APIs**: `eval()`, `new Function()`, dynamic `<script>` injection

### Bundle hash pinning

At submission time, fetch the widget bundle, compute SHA-256, store alongside the manifest in the `integrations` table. `health/` periodically re-fetches and compares — a hash change without a new version submission triggers automatic suspension. See [`health/` — Runtime Integrity Monitoring](../health/README.md#security-runtime-integrity-monitoring).

### Listing integrity

- **Trademark / brand detection**: Flag listings with names or icons resembling well-known brands (e.g., "Coinbase Ticker" by an unaffiliated developer). Requires manual review before publishing.
- **Screenshot verification**: For Verified+ tier, screenshots must match actual widget output. Automated comparison: render the widget, screenshot it, compare to submitted assets.

## Key Decisions / Open Questions

- **How much schema flexibility vs strict typing?** Strict manifest validation catches errors early but limits what integrations can express. See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Versioning strategy**: How do integrations publish breaking changes? Migration paths for users on older versions?
- **Automated checks**: Manifest schema validation, health endpoint reachability, response time benchmarks, HTTPS enforcement — what runs at submission vs. continuously? See [AUTOMATED_REVIEW.md](./AUTOMATED_REVIEW.md) for the full pipeline design.
