# Lifecycle — Install/Uninstall, Consent & Event Handling

## Purpose

Orchestrates the full integration lifecycle: install flow (billing → consent → token delivery), uninstall flow (revoke access → notify integration), and event routing for lifecycle state changes. This is the glue between Logto (consent), Stripe (billing), and the broker (event delivery).

## Why It Exists

Installing an integration involves multiple systems in a specific order: Stripe for payment (if paid), Logto for consent and token issuance, database for install state, and broker for notifying the integration. No single existing component owns this flow. The lifecycle service coordinates these steps and handles failure/rollback scenarios (e.g., payment succeeded but consent denied).

See [MARKETPLACE.md — User Install Flow](../MARKETPLACE.md#user-install-flow) and [Consent Flow](../MARKETPLACE.md#consent-flow) for the detailed sequences.

## How It Fits

```
User clicks "Install"
        │
        ▼
┌───────────────┐    ┌────────┐    ┌───────┐    ┌────────┐
│  Lifecycle    │───►│ Stripe │───►│ Logto │───►│ Broker │
│  (this svc)   │    │Connect │    │Consent│    │lifecycle│
└───────────────┘    └────────┘    └───────┘    │ topic  │
        │                                        └────┬───┘
        ▼                                             ▼
   PostgreSQL                                  Integration
   (user_integrations)                         Service
```

- **Upstream**: Go API (user-initiated install/uninstall), settings page (revoke access)
- **Downstream**: Stripe Connect (`billing/`), Logto Management API, broker lifecycle topic (`broker/`), PostgreSQL
- **Relates to**: `billing/` (payment step), `broker/` (event delivery), `api/` (exposes install/uninstall endpoints), `registry/` (reads integration metadata)

## What Goes Here

```
lifecycle/
├── README.md               # This file
├── src/
│   ├── install.go          # Install orchestration (billing → consent → notify)
│   ├── uninstall.go        # Uninstall flow (revoke → notify → cleanup)
│   ├── consent.go          # Logto consent flow integration
│   ├── events.go           # Broker event publishing for lifecycle changes
│   └── rollback.go         # Compensation logic for partial failures
├── tests/
└── migrations/             # If lifecycle-specific tables are needed
```

## Security: Scope Minimization & Consent Integrity

The lifecycle service controls what permissions an integration receives. It's the enforcement point for the principle of least privilege.

### Scope validation during install

Before redirecting the user to Logto's consent screen, the lifecycle service validates:

1. **Requested scopes match the manifest** — the integration can't request scopes it didn't declare at registration
2. **Tier allows the scopes** — Unverified integrations are restricted to `dashboard:read` and `dashboard:write`. Scopes like `profile:read`, `fantasy:read`, and `data:write` require Verified tier (enforced by `registry/` tier restrictions)
3. **Scope justifications are displayed** — the consent screen shows the developer's explanation for each scope (stored in the manifest), so users understand *why* access is needed, not just *what* is requested

### Credential revocation on suspension

When `health/` or `registry/` suspends an integration (hash mismatch, user reports, anomaly detection):

1. Lifecycle revokes all active user grants for that integration via Logto Management API
2. Publishes an uninstall event to the broker lifecycle topic
3. Marks all `user_integrations` rows as revoked
4. If M2M credentials were issued, rotates or revokes the `client_secret` via Logto

### Uninstall guarantees

When a user uninstalls or the platform force-suspends:

- Logto grant is revoked (tokens become invalid immediately on next JWKS rotation)
- Integration is notified via broker lifecycle topic (or `POST /lifecycle/uninstall` fallback)
- User's data associated with the integration is marked for cleanup

## Key Decisions / Open Questions

- **Broker vs HTTP fallback**: MARKETPLACE.md specifies broker as primary delivery with `POST /lifecycle/install` as fallback. Should fallback be supported from day one or deferred?
- **Logto application type for integrations**: "Traditional Web" for full OAuth, "Machine-to-Machine" for backend-only, or support both? See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Rollback complexity**: If Stripe payment succeeds but Logto consent is denied, the payment needs refunding. How sophisticated does rollback need to be at launch?
