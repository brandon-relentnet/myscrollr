# Portal — Developer Portal

## Purpose

The developer-facing web interface where integration developers register, manage, test, and publish their integrations. Provides documentation, SDK downloads, analytics dashboards, and the submission/verification workflow.

## Why It Exists

Developers need a self-service interface to manage their integrations without contacting MyScrollr directly. The portal handles the full developer lifecycle: onboarding (Logto auth → developer role), integration creation (manifest + Logto app provisioning), testing (sandbox environment), publishing to the marketplace, and monitoring (install counts, revenue, uptime).

See [MARKETPLACE.md — Developer Portal](../MARKETPLACE.md#developer-portal) for features and onboarding flow.

## How It Fits

```
Developer (browser)
       │
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────┐
│  Portal      │───►│  Go API      │───►│  Logto   │
│  (this svc)  │    │  (api/)      │    │  Mgmt API│
└──────────────┘    └──────┬───────┘    └──────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Registry     Billing      Health
```

- **Upstream**: Developer browser sessions (authenticated via Logto with `developer` role)
- **Downstream**: Go API (CRUD operations), Logto Management API (app provisioning), Stripe Connect (developer onboarding)
- **Relates to**: `registry/` (integration catalog CRUD), `billing/` (Stripe Connect onboarding), `health/` (uptime stats display), `sdk/` (documentation and downloads), `myscrollr.com/` (shares Logto auth infrastructure)

## What Goes Here

```
portal/
├── README.md               # This file
├── src/                    # Portal frontend (React or separate site)
│   ├── pages/
│   │   ├── Dashboard.tsx   # Developer dashboard (installs, revenue, uptime)
│   │   ├── Create.tsx      # New integration wizard
│   │   ├── Manage.tsx      # Edit integration settings
│   │   ├── Analytics.tsx   # Usage analytics
│   │   └── Sandbox.tsx     # Integration testing sandbox
│   └── components/
├── docs/                   # API documentation source (if self-hosted)
│   └── openapi.yaml        # OpenAPI spec for integration API contracts
└── tests/
```

**Deployment options**: Could be a section within `myscrollr.com/` (e.g., `/developer/*` routes) or a standalone app. Starting as routes in the existing frontend is simpler.

**Documentation tooling**: Mintlify or Docusaurus for SDK docs, Swagger/OpenAPI for API reference. See [MARKETPLACE.md — Developer Portal tools](../MARKETPLACE.md#developer-portal--existing-tools-to-accelerate).

## Security: Developer Identity & Listing Integrity

The portal is where developers onboard and submit integrations. It's the first opportunity to establish trust and catch bad actors.

### Developer identity verification

| Tier | Identity requirement |
|------|---------------------|
| Unverified | Logto account only (email verified) |
| Verified | Linked GitHub account with meaningful history, or domain ownership verification (DNS TXT record) |
| Featured | All of the above + direct relationship with MyScrollr team |

Higher identity requirements raise the cost of creating throwaway accounts for spam/malware. A developer with multiple suspended integrations can be banned by Logto user ID and linked identity.

### Submission review workflow

The portal exposes the submission pipeline that feeds into `registry/`:

1. Developer fills out manifest + uploads assets
2. **Automated checks run immediately** (schema validation, HTTPS, health endpoint reachability, static analysis on bundles) — results shown in the portal UI
3. **Unverified**: Auto-published if automated checks pass (scope-restricted)
4. **Verified+**: Queued for manual review — reviewer sees automated check results, scope justifications, bundle analysis report, and developer identity info

### User-facing reporting

- The portal surfaces the "Report this integration" flow from the marketplace
- Developers can see reports against their own integrations (redacted reporter identity)
- Repeated suspensions result in escalating consequences: warning → temporary publish ban → permanent developer ban

## Key Decisions / Open Questions

- **Standalone app vs embedded routes?** A `/developer` section in `myscrollr.com/` shares auth and components. A separate app provides better separation but more deployment overhead.
- **Developer role assignment**: Self-service (any user can request) or admin-granted? See [MARKETPLACE.md — Onboarding Flow](../MARKETPLACE.md#onboarding-flow).
- **Sandbox environment**: How realistic should the test environment be? Mock MyScrollr API vs. staging instance on Coolify?
- **Logto organizations**: Use for developer teams/orgs, or keep it flat with roles only? See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
