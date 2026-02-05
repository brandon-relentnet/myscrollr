# SDK — Official Integration Development SDKs

## Purpose

Parent directory for the official SDKs that simplify building MyScrollr integrations. Provides type definitions, auth helpers, broker client wrappers, testing utilities, and a CLI scaffolding tool — so developers can focus on their integration logic rather than protocol details.

## Why It Exists

Without SDKs, every integration developer would need to independently implement JWT validation, broker publishing, health endpoints, manifest formatting, and widget lifecycle hooks. SDKs encode the platform's contracts into importable libraries with type safety, reducing the barrier to entry and ensuring consistency across the integration ecosystem.

See [MARKETPLACE.md — SDK](../MARKETPLACE.md#sdk) for the full list of SDK capabilities.

## How It Fits

```
Integration Developer
        │
        ▼
┌───────────────────┐
│  SDK              │
│  ├── typescript/  │  ← Node.js backends + widget frontends
│  └── python/      │  ← Data-heavy backends, ML/analytics
└───────┬───────────┘
        │  wraps
        ▼
┌───────────────────────────────────────────┐
│  MyScrollr Platform APIs                   │
│  • Logto auth (JWT, M2M tokens)           │
│  • Broker (push-mode publishing)          │
│  • API contracts (GET /data, /health, etc)│
│  • Widget postMessage protocol            │
└───────────────────────────────────────────┘
```

- **Consumers**: Third-party integration developers
- **Wraps**: Logto auth SDKs, broker client libraries, API contract types
- **Relates to**: `schemas/` (SDK types are generated from or aligned with shared schemas), `widgets/` (TypeScript SDK includes widget development helpers), `broker/` (SDK wraps broker client for push-mode), `portal/` (SDK docs hosted on developer portal)

## What Goes Here

```
sdk/
├── README.md               # This file (you are here)
├── typescript/             # TypeScript/Node.js SDK
│   └── README.md
├── python/                 # Python SDK
│   └── README.md
└── cli/                    # CLI tool for scaffolding new integrations (future)
```

## SDK Capabilities (Both Languages)

| Capability | Description |
|------------|-------------|
| Type definitions | All API contracts, manifest schema, widget interface |
| Auth helpers | Wrap Logto SDKs for token validation and M2M auth |
| Broker client | Publish to push-mode data topics with auth |
| Testing utilities | Mock MyScrollr API, local dev server |
| CLI scaffolding | Generate new integration project from template |

## Key Decisions / Open Questions

- **Package distribution**: npm for TypeScript, PyPI for Python. Monorepo or separate repos?
- **CLI tool language**: TypeScript (Node.js) for cross-platform CLI, or separate per-SDK?
- **Versioning**: SDK versions should track API contract versions. How to handle breaking changes?
