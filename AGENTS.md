# AGENTS.md

Operational guide for AI coding agents working in this repository. For full architecture, database schema, endpoints, and deployment details, see `CLAUDE.md`. For extension-specific context, see `extension/CLAUDE.md`.

## Repository Layout

Monorepo with independently deployable components. Each top-level folder is its own build target:

- `api/` — Core gateway API (Go 1.21, Fiber v2)
- `myscrollr.com/` — Frontend (React 19, Vite 7, TanStack Router, Tailwind v4)
- `extension/` — Browser extension (WXT v0.20, React 19, Tailwind v4)
- `channels/{finance,sports,rss,fantasy}/api/` — Channel Go APIs (each independent go module)
- `channels/{finance,sports,rss,fantasy}/service/` — Rust ingestion services (each independent cargo crate)
- `channels/*/web/` — Frontend dashboard tab components
- `channels/*/extension/` — Extension feed tab components

## Build & Run Commands

### Frontend (`myscrollr.com/`)

```sh
npm install
npm run dev          # Dev server on port 3000
npm run build        # vite build && tsc
npm run lint         # eslint
npm run format       # prettier
npm run check        # prettier --write . && eslint --fix
```

### Extension (`extension/`)

```sh
npm install
npm run dev          # Dev mode (Chrome)
npm run dev:firefox  # Dev mode (Firefox)
npm run build        # Build Chrome MV3
npm run build:firefox
npm run compile      # tsc --noEmit (type-check only)
npm run zip          # Package for store submission
```

### Core Go API (`api/`)

```sh
go build -o scrollr_api && ./scrollr_api    # Port 8080
```

### Channel Go APIs (`channels/{name}/api/`)

```sh
go build -o {name}_api && ./{name}_api      # Ports: finance=8081, sports=8082, rss=8083, fantasy=8084
```

### Rust Services (`channels/{name}/service/`)

```sh
cargo build --release
cargo run              # Ports: finance=3001, sports=3002, fantasy=3003, rss=3004
```

### Tests

No test infrastructure exists (no test files, no test configs, no test dependencies). If adding tests:

- Frontend/Extension: use Vitest (`npx vitest run path/to/file.test.ts` for single file)
- Go: standard `go test ./...` (single: `go test -run TestName ./path/to/pkg`)
- Rust: `cargo test` (single: `cargo test test_name`)

## Code Style — TypeScript (Frontend: `myscrollr.com/`)

**Formatting** (Prettier): No semicolons, single quotes, trailing commas.

```ts
import { useState } from "react";
import type { ChannelConfig } from "@/api/client";
```

**Linting**: `@tanstack/eslint-config` (flat config). Run `npm run check` to auto-fix.

**TypeScript**: Strict mode enabled. `verbatimModuleSyntax: true` — always use `import type` for type-only imports. `noUnusedLocals` and `noUnusedParameters` enabled.

**Path aliases**: `@/` resolves to `./src/`, `@scrollr/` resolves to `../channels/`.

**Imports**: Named exports preferred everywhere. No barrel exports (`index.ts` re-exports). Use `import type { ... }` for types. Channel discovery uses `import.meta.glob` — don't manually register channels.

**Components**: Function components with named exports. Routes use TanStack Router file-based convention (`export const Route = createFileRoute(...)`). Hooks are named exports (`export function useRealtime(...)`).

## Code Style — TypeScript (Extension: `extension/`)

**Formatting**: Uses semicolons (no Prettier config — default TS style). Single quotes.

**Path aliases**: `~/` resolves to srcDir (WXT default), `@scrollr/` resolves to `../channels/`.

**WXT conventions**: Entrypoints in `entrypoints/` with `defineBackground()`, `defineContentScript()`, etc. Content script UI uses Shadow Root (`createShadowRootUi`). PostCSS converts `rem` to `px` via `postcss-rem-to-responsive-pixel`.

**Messaging**: Typed message protocol between background and content scripts. Message types: `SUBSCRIBE_CDC`, `UNSUBSCRIBE_CDC`, `CDC_BATCH`, `INITIAL_DATA`, `STATE_SNAPSHOT`, `CONNECTION_STATUS`, `AUTH_STATUS`.

## Code Style — Go

**Formatting**: Standard `gofmt`. No custom linter config.

**Module isolation**: Each Go API is a fully independent module. No shared Go packages between channels or between channels and core. Code duplication is intentional.

**Naming**:

- PascalCase exports: `Server`, `App`, `CDCRecord`, `ErrorResponse`
- camelCase unexported: `registrationPayload`, `globalDiscovery`
- Short receiver names: `s *Server`, `a *App`, `d *Discovery`
- JSON tags use snake_case: `json:"channel_type"`
- Constants grouped with section comment banners (`// ===...===`)

**Error handling**: Standard Go `if err != nil` returns. `log.Printf` for non-fatal, `log.Fatalf` for startup failures. Wrap errors with `fmt.Errorf("context: %w", err)`. HTTP errors return `ErrorResponse` struct via Fiber.

**Logging**: Bracketed category prefixes: `log.Printf("[Auth] message: %v", err)`.

**Patterns**: `App` struct holds shared deps (`db *pgxpool.Pool`, `rdb *redis.Client`). Graceful shutdown via `os.Signal` channels. Channel self-registration in Redis with 30s TTL, 20s heartbeat.

## Code Style — Rust

**Edition**: 2024 for all crates. No `rustfmt.toml` — default formatting.

**Error handling**: `anyhow` exclusively (`anyhow::{Context, Result}`). No custom error types. Use `.context("message")?` for adding context. Avoid `unwrap()` and `panic!` except for truly unrecoverable init failures.

**Async runtime**: Tokio with full features. HTTP via Axum. Database via SQLx (Postgres). Each feed/poll task spawned via `tokio::task::spawn` for isolation.

**Logging**: `log` crate macros (`info!`, `error!`, `warn!`). Each service has a custom async file logger (`log.rs`) writing to `./logs/`.

**Duplicated code**: `database.rs` and `log.rs` are copy-pasted across all 4 services (known tech debt). Don't try to extract a shared crate.

## Architecture Rules

1. **Core API has zero channel-specific code.** It discovers channels via Redis and proxies routes dynamically.
2. **Channel isolation is absolute.** Each channel owns its Go API, Rust service, frontend/extension components, configs, Docker Compose, and manifest.json.
3. **HTTP-only contract between core and channels.** No shared Go interfaces or types. Core calls `POST /internal/cdc`, channel returns `{ "users": [...] }`.
4. **Route proxying**: Core proxies `/{name}/*` to channel APIs with `X-User-Sub` header. Channels never validate JWTs.
5. **Convention-based UI discovery**: Frontend and extension use `import.meta.glob` to discover channel components at build time.
6. **Database tables are created programmatically** via `CREATE TABLE IF NOT EXISTS` on service startup. No migration framework.

## Environment

Copy `.env.example` to `.env` for local dev. Frontend env in `myscrollr.com/.env`. Never commit `.env` files. Secrets include `ENCRYPTION_KEY` (AES-256-GCM, base64 32 bytes), `SEQUIN_WEBHOOK_SECRET`, API keys.

## Docker

- Go APIs: multi-stage `golang:1.21-alpine` builder, `alpine:latest` runtime
- Rust services: `cargo-chef` pattern for dependency caching, `debian:trixie-slim` runtime
- Frontend: `node:22-alpine` builder, `nginx:alpine` runtime with SPA fallback
- Each channel has a `docker-compose.yml` bundling its Go API + Rust service
