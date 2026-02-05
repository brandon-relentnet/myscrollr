# SDK / TypeScript — TypeScript & Node.js SDK

## Purpose

Official TypeScript SDK for building MyScrollr integrations. Covers both frontend widget development (React components, postMessage helpers) and Node.js backend services (auth, data source contracts, broker publishing).

## Why It Exists

TypeScript is the natural choice for widget developers (the MyScrollr frontend is React) and a common backend language for web developers. The SDK provides typed interfaces for all platform contracts, wraps `@logto/node` for auth, and includes a local dev server for testing widgets without deploying.

See [MARKETPLACE.md — SDK](../MARKETPLACE.md#sdk) for the full capability list.

## How It Fits

- **Widget developers**: Import widget types, postMessage helpers, and theming utils from this SDK. Test locally with the dev server, then deploy.
- **Node.js backend developers**: Import data source contract types, auth middleware (wraps `@logto/node`), and broker client helpers.
- **Types align with**: `schemas/` (shared JSON schemas → generated TypeScript types), `widgets/` (widget interface contract)

## What Goes Here

```
sdk/typescript/
├── README.md               # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts            # Main entry point
│   ├── auth/
│   │   ├── middleware.ts   # Express/Fastify middleware for JWT validation
│   │   └── m2m.ts         # M2M token client (Client Credentials grant)
│   ├── contracts/
│   │   ├── data-source.ts  # GET /data, GET /schema type definitions
│   │   ├── widget.ts       # Widget manifest, lifecycle hooks
│   │   ├── app.ts          # Full-stack app lifecycle types
│   │   └── health.ts       # GET /health response type
│   ├── broker/
│   │   └── client.ts       # Push-mode data publishing client
│   ├── widget/
│   │   ├── host.ts         # postMessage helpers for widget side
│   │   └── theme.ts        # Theme integration utilities
│   └── testing/
│       ├── mock-api.ts     # Mock MyScrollr API for local testing
│       └── dev-server.ts   # Local development server
├── examples/
│   ├── data-source/        # Example pull-mode data source
│   ├── widget/             # Example dashboard widget
│   └── push-source/        # Example push-mode data source
└── tests/
```

**Key dependency**: `@logto/node` for auth helpers (same Logto SDK family used by the MyScrollr frontend with `@logto/react`).

## Key Decisions / Open Questions

- **Package name**: `@myscrollr/sdk`? `myscrollr-sdk`? Scoped npm package preferred.
- **Framework-agnostic vs Express-first**: Auth middleware for Express initially, with Fastify/Koa adapters later?
- **Widget dev server**: Hot-reloading local iframe sandbox that simulates the MyScrollr dashboard environment.
