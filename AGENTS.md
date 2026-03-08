# AGENTS.md

Operational guide for AI coding agents working in this repository.

## Project Overview

MyScrollr — platform aggregating financial market data, sports scores, RSS feeds, and Yahoo Fantasy Sports. React frontend, browser extension, Go gateway API, and independent channel services. Infrastructure: PostgreSQL, Redis, Logto (auth), Sequin (CDC), Stripe (billing). Deployed on Coolify.

## Repository Layout

Monorepo with independently deployable components:

- `api/` — Core gateway API (Go 1.21, Fiber v2, sub-package `core/`)
- `myscrollr.com/` — Frontend (React 19, Vite 7, TanStack Router, Tailwind v4)
- `extension/` — Browser extension (WXT v0.20, React 19, Tailwind v4)
- `channels/{finance,sports,rss}/api/` — Channel Go APIs (flat `main` package, independent modules)
- `channels/{finance,sports,rss}/service/` — Rust ingestion services (independent crates, edition 2024)
- `channels/fantasy/api/` — Fantasy Go API (adds `golang.org/x/oauth2` for Yahoo)
- `channels/fantasy/service/` — Fantasy Python service (FastAPI + uvicorn + asyncpg)
- `channels/*/web/` — Dashboard tab components (single `DashboardTab.tsx` each, no own `package.json`)
- `channels/*/extension/` — Feed tab components (`FeedTab.tsx` + item components, no own `package.json`)

## Build & Run Commands

### Frontend (`myscrollr.com/`)

```sh
npm run dev          # Vite dev server on port 3000
npm run build        # vite build && tsc
npm run check        # prettier --write . && eslint --fix (use before committing)
npm run lint         # eslint only
npm run format       # prettier only
```

### Extension (`extension/`)

```sh
npm run dev          # Dev mode (Chrome)
npm run dev:firefox  # Dev mode (Firefox)
npm run build        # Build Chrome MV3
npm run compile      # tsc --noEmit (type-check only)
npm run zip          # Package for store submission
```

### Go APIs (`api/` and `channels/{name}/api/`)

```sh
go build -o scrollr_api && ./scrollr_api   # Core: port 8080
go build -o {name}_api && ./{name}_api     # finance=8081, sports=8082, rss=8083, fantasy=8084
```

### Rust Services (`channels/{finance,sports,rss}/service/`)

```sh
cargo build --release && cargo run         # finance=3001, sports=3002, rss=3004
```

### Fantasy Python Service (`channels/fantasy/service/`)

```sh
python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn main:app --port 3003
```

### Tests

No test infrastructure exists yet. When adding tests:

- **Frontend/Extension**: Vitest. Single file: `npx vitest run path/to/file.test.ts`. Single test: `npx vitest run -t "test name"`
- **Go**: `go test ./...`. Single test: `go test -run TestName ./path/to/pkg`
- **Rust**: `cargo test`. Single test: `cargo test test_name`
- **Python**: pytest. Single test: `pytest path/to/test.py -k "test_name"`

## Code Style -- TypeScript (Frontend: `myscrollr.com/`)

**Formatting**: Prettier -- no semicolons, single quotes, trailing commas. ESLint via `@tanstack/eslint-config` flat config.

**TypeScript**: Strict mode, target ES2022, `verbatimModuleSyntax: true` -- always use `import type` for type-only imports. `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` enabled.

**Tailwind v4**: Zero-config via `@tailwindcss/vite` plugin. No `tailwind.config.*` or `postcss.config.*`. Configuration happens in CSS.

**Path aliases**: `@/` -> `./src/`, `@scrollr/` -> `../channels/`. Configured in both `tsconfig.json` and `vite.config.ts`.

**Imports**: Named exports only. No barrel files. No default exports (except route modules). Channel discovery via `import.meta.glob` -- never manually register channels. Never edit `src/routeTree.gen.ts` (auto-generated).

**Components**: Function components with named exports. Routes use TanStack Router file-based convention (`export const Route = createFileRoute(...)`). Hooks are named function exports (`export function useRealtime(...)`).

**External channels**: Custom Vite plugin `resolveExternalChannels` resolves bare imports from `channels/*/web/` to `myscrollr.com/node_modules`. Never duplicate dependencies in channel web dirs. Channel web files are included in the frontend tsconfig but Prettier may not format them -- they currently use double quotes and semicolons.

## Code Style -- TypeScript (Extension: `extension/`)

**Formatting**: Semicolons, double quotes (no Prettier). Uses `clsx` for conditional classes.

**Path aliases**: `~/` -> srcDir (WXT default), `@scrollr/` -> `../channels/`.

**WXT conventions**: Entrypoints in `entrypoints/` with `defineBackground()`, `defineContentScript()`, etc. Runtime code inside the main function or define callback -- never at module top level. Content script UI uses Shadow Root (`createShadowRootUi`). PostCSS (inline in `wxt.config.ts`) converts `rem` to `px` via `postcss-rem-to-responsive-pixel`.

**Exports**: Feed tab components use default export (`export default function FinanceFeedTab`). Manifest objects are named exports (`export const financeChannel: ChannelManifest`).

**Auth**: No `@logto/react` -- auth handled via custom token exchange in background script. Storage managed through WXT `storage` API.

## Code Style -- Go

**Formatting**: `gofmt`. No custom linter config.

**Module isolation**: Each Go API is fully independent. No shared packages between channels or core. Code duplication is intentional -- do not extract shared libraries.

**Core vs channels**: Core API uses a `core/` sub-package with package-level vars (`DBPool`, `Rdb`) and a `Server` struct. Channel APIs use flat `main` package with an `App` struct holding deps (`db *pgxpool.Pool`, `rdb *redis.Client`).

**Naming**: PascalCase exports, camelCase unexported, short receiver names (`s *Server`, `a *App`), snake_case JSON tags (`json:"channel_type"`), constants grouped with `// =====` banner comments.

**Error handling**: `if err != nil` returns. `log.Printf` for non-fatal, `log.Fatalf` for startup failures. Wrap with `fmt.Errorf("context: %w", err)`. HTTP errors return `ErrorResponse` struct.

**Logging**: Bracketed category prefixes (`log.Printf("[Auth] message: %v", err)`). Not all channels use prefixes consistently.

**Registration**: Channels self-register in Redis with 30s TTL, 20s heartbeat. Deregister on shutdown via `rdb.Del`.

## Code Style -- Rust

**Edition**: 2024. Default `rustfmt` formatting.

**Error handling**: `anyhow` exclusively (`anyhow::{Context, Result}`). No custom error types. Use `.context("message")?`. Avoid `unwrap()` and `panic!` except for truly unrecoverable init failures (DB connect retries use `panic!`).

**Async**: Tokio (full features), HTTP via Axum, database via SQLx (Postgres). Each feed/poll task spawned with `tokio::spawn`. Coordinated shutdown via `tokio_util::sync::CancellationToken`.

**Logging**: `log` crate macros (`info!`, `error!`, `warn!`). Custom async file logger (`log.rs`) writes to `./logs/`.

**Known duplication**: `database.rs` and `log.rs` are copy-pasted across all 3 Rust services. Do not extract a shared crate.

## Code Style -- Python (Fantasy: `channels/fantasy/service/`)

**Framework**: FastAPI with `lifespan` async context manager. Pydantic `BaseModel` for request validation.

**Logging**: `logging.basicConfig()` to stdout, format `%(asctime)s [%(name)s] %(levelname)s %(message)s`.

**State**: Module-level variables (`_pool`, `_sync_task`, `_shutdown_event`, `_health`). Shutdown via `asyncio.Event` + signal handlers.

## Architecture Rules

1. **Core API has zero channel-specific code.** Discovers channels via Redis, proxies routes dynamically.
2. **Channel isolation is absolute.** Each channel owns its Go API, ingestion service, frontend/extension components, configs, and Docker Compose.
3. **HTTP-only contract.** No shared Go interfaces or types. Core calls `POST /internal/cdc`, channel returns `{ "users": [...] }`.
4. **Route proxying**: Core proxies `/{name}/*` to channel APIs with `X-User-Sub` header. Channels never validate JWTs.
5. **Convention-based UI discovery**: Frontend and extension use `import.meta.glob` to discover channel components at build time.
6. **No migration framework.** Tables created programmatically via `CREATE TABLE IF NOT EXISTS` on service startup.

## Git Workflow

Branch off `staging`: `git checkout -b <prefix>/short-description`. PR back into `staging`. Squash merge. Commit trivial one-off fixes directly to `staging`.

**Branch prefixes**: `feature/`, `fix/`, `refactor/`, `chore/`.

## Environment

Copy `.env.example` to `.env` (uses `{{ environment.* }}` Coolify template syntax). Frontend env in `myscrollr.com/.env` (`VITE_API_URL`). Never commit `.env` files.
