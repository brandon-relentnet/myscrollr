# Health — Integration Uptime Monitoring

## Purpose

Monitors the health and availability of all registered integrations by periodically pinging their `GET /health` endpoints, recording results, calculating uptime percentages, and surfacing degraded/offline status on marketplace listings.

## Why It Exists

Integrations are self-hosted by developers — MyScrollr has no control over their uptime. Users need visibility into reliability before installing, and the platform needs to flag or delist integrations that go down. Health monitoring is also part of the automated verification checks (all tiers must pass health endpoint reachability).

See [MARKETPLACE.md — Health & Uptime](../MARKETPLACE.md#health--uptime) and [Monitoring](../MARKETPLACE.md#monitoring) for requirements.

## How It Fits

```
┌──────────────┐     GET /health      ┌──────────────────┐
│   Health     │────────────────────►  │  Integration     │
│  (this svc)  │◄────────────────────  │  Service (ext)   │
└──────┬───────┘                       └──────────────────┘
       │
       ▼
┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │  Broker      │
│  (health     │    │  monitoring  │
│   table)     │    │  (consumer   │
└──────────────┘    │   lag, DLQ)  │
                    └──────────────┘
```

- **Monitors**: All registered integration `GET /health` endpoints (from `registry/`)
- **Stores**: Results in `integration_health` table (PostgreSQL)
- **Surfaces**: Uptime percentage on marketplace listings via Go API
- **Relates to**: `registry/` (reads integration base URLs), `api/` (serves uptime data), `broker/` (broker-level monitoring: consumer lag, DLQ depth)

## What Goes Here

```
health/
├── README.md               # This file
├── src/
│   ├── checker.go          # HTTP health check runner (cron-based)
│   ├── uptime.go           # Uptime percentage calculation
│   ├── alerts.go           # Degraded/offline detection and notifications
│   └── broker_health.go    # Broker monitoring (consumer lag, DLQ, throughput)
├── gatus/                  # Gatus configuration (if using Gatus)
│   └── config.yaml
└── tests/
```

**Tooling options**: Gatus (lightweight Go health checker, deployable as a Coolify service) or a custom cron job. Both store results in the `integration_health` table.

## Security: Runtime Integrity Monitoring

Health monitoring extends beyond uptime checks to detect post-approval malicious behavior. This is the primary defense against bait-and-switch attacks (integration passes review, then changes its served code).

### Bundle hash verification

- Periodically re-fetch widget bundles from `GET /bundle` and compare SHA-256 hash against the pinned hash stored by `registry/` at submission time
- **Hash mismatch without version update** → automatic suspension, admin notification
- Recommended frequency: every 1-6 hours (less aggressive than health pings since bundles change infrequently)

### Token usage anomaly detection

Monitor API call patterns per integration via `gateway/` metrics:

- **Volume spike**: Integration suddenly makes 10x its normal API call rate → throttle, then flag
- **Scope creep**: Integration starts accessing scopes it hasn't used before (may indicate compromised credentials)
- **Unusual hours**: M2M service that normally calls during business hours starts calling at 3 AM
- Anomaly thresholds should be per-integration baselines, not global — a popular integration legitimately has higher volume

### Automatic suspension triggers

| Trigger | Action |
|---------|--------|
| Bundle hash mismatch (no version update) | Suspend immediately, notify admin |
| 3+ user reports via "Report" button | Suspend pending manual review |
| Health endpoint down 48+ consecutive hours | Delist from marketplace (not suspended — may just be abandoned) |
| Token usage anomaly (sustained) | Rate limit → suspend if persists after 24h |
| Scope usage outside declared scopes | Suspend, revoke M2M credentials |

### User reporting

- A "Report this integration" action visible on every marketplace listing and widget frame
- Reports categorized: phishing, spam, malware, broken, other
- 3+ reports from distinct users triggers automatic suspension pending review
- Report data stored for pattern analysis (does this developer have multiple flagged integrations?)

## Key Decisions / Open Questions

- **Check frequency**: How often to ping? Every 30s, 1m, 5m? More frequent = faster detection but more load on integrations.
- **Offline threshold**: How many consecutive failures before marking degraded/offline? MARKETPLACE.md says "consecutive failures" but doesn't specify a count.
- **Broker monitoring**: Tool depends on broker choice. Kafka UI, NATS dashboard, RabbitMQ management plugin are all options.
- **Uptime requirement for verification**: 99%+ over 30 days mentioned for Verified tier — needs confirmation.
