# MyScrollr Architectural Analysis

**Date:** 2026-02-09
**Scope:** Full codebase — Go API, Rust ingestion, React frontend, WXT browser extension

---

## Mental Model

MyScrollr is a **real-time data aggregation platform** with a **CDC-driven event pipeline** architecture:

```
[Data Sources] → [Ingestion (Rust)] → [PostgreSQL] → [CDC (Sequin)] → [API (Go)] → [Per-User Pub/Sub (Redis)] → [Clients (React/WXT)]
```

The system's central organizing principle is the **Integration**: a named data source (finance, sports, rss, fantasy) implemented as a self-contained plugin at every layer of the stack, tied together by a shared string ID (`stream_type`). The architecture is a **compile-time, first-party plugin system** — not a runtime marketplace.

---

## Phase 1: Discovery

### 1.1 Core Architectural Patterns

| Pattern | Where Applied | Description |
|---------|---------------|-------------|
| **Modular Monolith (Plugin-style)** | Go API | Single binary, but each data source is a self-contained package implementing optional capability interfaces. Discovered via type assertions at runtime. |
| **Interface Segregation Principle** | Go API `integration/` | 1 core interface + 5 optional capability interfaces. Integrations only implement what they need — zero no-op stubs. |
| **CDC Event Sourcing Pipeline** | System-wide | PostgreSQL as the source of truth → Sequin CDC → webhooks → per-user Redis Pub/Sub → SSE to clients. Data flows in one direction. |
| **Registry-Driven UI** | Frontend + Extension | Both clients use a `Map<string, Manifest>` registry. Dashboard/FeedBar is a generic shell that renders whatever the active integration provides. |
| **Pass-Through CDC Router** | Extension background | The background script does NOT store centralized data. It routes CDC batches to subscribed content script tabs. Each integration's component manages its own state. |
| **Independent Service Crates** | Rust ingestion | 4 independent Rust binaries (no workspace). Each has an identical skeleton: `main.rs` → Axum health server + `tokio::spawn` background work. |

### 1.2 Design Patterns by Domain

#### State Management

- **Go API**: Package-level globals for infrastructure (`DBPool`, `Rdb`, `IntegrationRegistry`). Constructor-based DI for integrations.
- **Frontend**: No state library. Component-local `useState` + one SSE hook (`useRealtime`). Props drilling for auth token (`getToken`).
- **Extension**: WXT `storage.defineItem` for persistent state (13 items). Module-scoped variables in background scripts. `useScrollrCDC` hook for per-integration reactive data.

#### API Communication

- **Frontend → API**: Raw `fetch` wrapped in `authenticatedFetch()`. No caching layer (no TanStack Query/SWR). Token injected per-call via `getToken` function parameter.
- **Extension → API**: Same pattern via `getValidToken()` in background. SSE via `EventSource` with `?token=` query param.
- **API → Integrations**: Type-assertion dispatch: `if h, ok := intg.(CDCHandler); ok { h.RouteCDCRecord(...) }`.

#### Component Composition

- **Frontend**: Registry manifest defines `DashboardTab` (React component) per integration. Shared components (`StreamHeader`, `ToggleSwitch`, `InfoCard`) are composed inside each tab.
- **Extension**: Registry manifest defines `FeedTab` (React component) per integration. Shared hook `useScrollrCDC` provides CDC data subscription.
- **Go API**: Each integration is a struct with a `New()` constructor, receiving dependencies as function parameters. Integration capabilities are discovered via Go type assertions.

### 1.3 Implicit Style Guide

#### Naming Conventions

| Layer | Convention | Example |
|-------|-----------|---------|
| Integration IDs | lowercase singular nouns | `finance`, `sports`, `rss`, `fantasy` |
| Go packages | singular for contracts, plural for implementations | `integration/` vs `integrations/` |
| Go integration types | All named `Integration` (namespace-qualified) | `finance.Integration`, `rss.Integration` |
| Go constructors | Always `New()` | `finance.New(db, sendToUser, routeToSub)` |
| Go receiver vars | Single letter matching type | `f`, `s`, `r`, `e` |
| React integration components | `DashboardTab` (frontend), `FeedTab` (extension) | `official/finance/DashboardTab.tsx` |
| CSS | Tailwind v4 utility-first, dark "deep space" theme | Neon green primary, JetBrains Mono font |
| Rust modules | Consistent `main.rs`, `lib.rs`, `database.rs`, `types.rs`, `log.rs` per service | |
| Constants (Go) | `CamelCase` grouped by domain | `CacheKeyFinance`, `SSEHeartbeatInterval` |
| Storage keys (Extension) | `local:camelCase` | `local:feedPosition`, `local:authToken` |

#### Code Organization

- **Go**: Domain-driven files (`auth.go`, `events.go`, `streams.go`). Handlers prefixed: `handlers_webhook.go`, `handlers_stream.go`.
- **React**: Feature-based directory structure under `integrations/official/{name}/`. Routes are flat (no nested layouts beyond root).
- **Extension**: WXT directory-based entrypoints. Background split into 5 single-responsibility modules connected via callback injection.
- **Rust**: Identical 5-file skeleton per service. Config JSON files under `configs/`.

#### Error Handling

- **Go**: `ErrorResponse` struct for HTTP errors. Log-and-continue for non-critical DB errors. `log.Fatal` for infrastructure failures.
- **Rust**: `anyhow::Result` for fallible functions. Silent-empty-return for read operations (`log::error` + return `Vec::new()`).
- **Frontend/Extension**: Silent `catch(() => {})` — errors are swallowed nearly universally. No error boundaries, no toast notifications.

---

## Phase 2: Gap Analysis

### 2.1 Files/Modules Deviating from Patterns

#### Critical Deviations

| File | Pattern Deviation | Severity |
|------|-------------------|----------|
| `myscrollr.com/src/routes/dashboard.tsx` | **God component** at ~680 lines with 12+ state variables. Violates the otherwise clean separation of concerns. Should be decomposed into hooks (`useStreams`, `useYahooSync`) and sub-components. | High |
| `ingestion/yahoo_service/src/main.rs` | **Inverted spawn pattern**: runs business logic on main thread, spawns HTTP server. Other 3 services do the opposite. Also **no DB retry loop** (hard `expect()` vs 5 retries). | Medium |
| `ingestion/*/src/database.rs` | **`create_tables()` signature inconsistency**: Finance takes `Arc<PgPool>`, Sports/RSS take `&Arc<PgPool>`, Yahoo takes `&PgPool`. | Medium |
| `myscrollr.com/src/routes/integrations.tsx` | **Duplicate integration metadata**: Defines its own `INTEGRATIONS` array instead of using the registry. Adding an integration requires updating both. | Medium |
| `myscrollr.com/src/routes/u.$username.tsx` | **`window.location.href` for navigation**: Causes full page reload instead of using TanStack Router's `navigate()`. | Low |
| `myscrollr.com/src/routes/account.tsx` | **Hardcoded placeholder stats**: "12 Active_Leagues", "482 Data_Signals" are never replaced with real data. | Low |
| `extension/entrypoints/background/messaging.ts` | **Lazy import at bottom of file** to break circular dependency. Inconsistent with the callback injection pattern used elsewhere. | Low |

#### Inconsistencies Within Patterns

| Area | Inconsistency |
|------|---------------|
| **Rust `log.rs`** | 101 lines duplicated 4x. Only the filename differs. ~300 lines of pure waste. |
| **Rust `database.rs`** | `initialize_pool()` is ~42 lines duplicated 4x. ~126 lines of waste. |
| **Go log tags** | `[Auth Error]` vs `[Auth]` vs `[Database Error]` vs `[Security Warning]`. No consistent format. |
| **Go SQL interpolation** | Some queries use `fmt.Sprintf("LIMIT %d", constant)` instead of parameterized queries. Safe (constants only) but inconsistent. |
| **Go error responses** | Mix of `fiber.Map{"error": ...}` and `ErrorResponse{...}`. Mix of `http.Status*` and `fiber.Status*`. 7 instances of wrong `Status` field for 401s. |
| **Frontend error handling** | Every `catch` block is `catch(() => {})`. No user feedback anywhere. |
| **Dockerfile build ARGs** | Sports/RSS bake `DATABASE_URL` into the image. Finance does not. Yahoo has unrelated ARGs (`DOMAIN_NAME`, `ACME_ENABLED`). |

### 2.2 Leaky Abstractions

| Location | Infrastructure Detail Leaking Into Domain |
|----------|------------------------------------------|
| `ingestion/*/src/database.rs` | `raw_host.strip_prefix("db.")` — a Coolify-specific hostname fixup embedded in every service's DB initialization. This is deployment-platform coupling. |
| `ingestion/sports_service/Dockerfile`, `ingestion/rss_service/Dockerfile` | `ARG DATABASE_URL` / `ENV DATABASE_URL` baked at build time. Build artifacts are coupled to a specific database instance. |
| `ingestion/yahoo_service/Dockerfile` | `ARG DOMAIN_NAME`, `CONTACT_EMAIL`, `ACME_ENABLED` — ACME/TLS config leaked into a data service's Dockerfile. |
| `api/core/constants.go` | `DefaultAllowedOrigins` hardcodes production domains (`myscrollr.com`, `api.myscrollr.relentnet.dev`). Should be env-only. |
| `api/core/database.go` | `GetEncryptionKey()` reads env and decodes base64 on every call to `Encrypt()`. A deployment config detail invoked at runtime per-request. |
| `extension/utils/constants.ts` | `API_URL` defaults to production (`https://api.myscrollr.relentnet.dev`). Dev override not documented. |
| `myscrollr.com/src/main.tsx` | Logto endpoint and app ID hardcoded in the component. Should derive from env variables. |

---

## Phase 3: Recommendations

### 3.1 How New Features Should Be Structured

#### Adding a New Integration (e.g., "weather")

An integration must be implemented at all three layers using the same ID string.

**1. Rust Ingestion Service** (`ingestion/weather_service/`)

- Copy an existing service (prefer `sports_service` for polling-based).
- Maintain the 5-file skeleton: `main.rs`, `lib.rs`, `database.rs`, `types.rs`, `log.rs`.
- Use `&PgPool` (or `&Arc<PgPool>`) consistently for functions that don't need ownership.
- Use `anyhow::Result` for all fallible functions. Use the log-and-empty pattern only for non-critical reads.
- Add a `Dockerfile` following the cargo-chef pattern. Do NOT bake `DATABASE_URL` or other runtime config as build ARGs.
- DB retries: use the 5-retry loop from `finance_service/src/main.rs`.

**2. Go API** (`api/integrations/weather/`)

- Create a new package with `weather.go`.
- Define `type Integration struct` with a `New()` constructor accepting dependencies.
- Implement the core `integration.Integration` interface (3 methods: `Name()`, `DisplayName()`, `RegisterRoutes()`).
- Implement only the capability interfaces you need (`CDCHandler`, `DashboardProvider`, `HealthChecker`, etc.).
- Use one of the 3 documented CDC routing patterns (Broadcast, Record Owner, Per-Resource).
- Register in `main.go` via `srv.RegisterIntegration(weather.New(...))`.
- Add constants to `core/constants.go` (cache keys, TTLs, query limits).
- Use `ErrorResponse{}` struct for all HTTP errors. Use `fiber.Status*` constants.
- Use `getUserID(c)` for auth extraction.

**3. Frontend** (`myscrollr.com/src/integrations/official/weather/`)

- Create `DashboardTab.tsx` implementing the `DashboardTabProps` interface.
- Use shared components from `integrations/shared.tsx` (`StreamHeader`, `ToggleSwitch`, `InfoCard`).
- Register in `integrations/registry.ts` with a manifest matching the integration ID.
- Add to `TAB_ORDER` array.

**4. Extension** (`extension/integrations/official/weather/`)

- Create `FeedTab.tsx` implementing the `FeedTabProps` interface.
- Use `useScrollrCDC<WeatherItem>('weather_data', { keyOf, ... })` for CDC data.
- Create a `WeatherItem.tsx` display component.
- Register in `integrations/registry.ts`.
- Add to `TAB_ORDER` and `DASHBOARD_KEY_MAP` in `FeedBar.tsx`.

**5. Cross-cutting**

- Use the same string ID everywhere: `"weather"`.
- The `stream_type` in `user_streams` will automatically validate against the registered integrations.
- Update `CLAUDE.md` tables if the integration is significant.

---

### 3.2 Specific Refactor Recommendations

Prioritized by impact and aligned with the existing `STANDARDIZATION_PLAN.md`.

#### Tier 1 — High Impact, Low Risk

| # | Refactor | Files | Rationale |
|---|----------|-------|-----------|
| 1 | **Extract `dashboard.tsx` into hooks and sub-components** | `dashboard.tsx` → `useStreams.ts`, `useYahooSync.ts`, `DashboardSidebar.tsx`, `QuickStart.tsx` | A 680-line god component is the single largest architectural debt. Every other component in the system follows clean single-responsibility. |
| 2 | **Create shared Rust crate for `log.rs` and `initialize_pool()`** | New `ingestion/common/` crate; update 4 `Cargo.toml` files | ~426 lines of pure duplication. The `CLAUDE.md` already marks this as planned. Parameterize the log filename. |
| 3 | **Complete the `STANDARDIZATION_PLAN.md` Phase 1** | Go API files per the plan | The plan is thorough and already approved. It addresses constants, error responses, auth extraction, and DB error handling. |

#### Tier 2 — Medium Impact

| # | Refactor | Files | Rationale |
|---|----------|-------|-----------|
| 4 | **Normalize Yahoo service `main.rs`** to match the other 3 services | `yahoo_service/src/main.rs` | Add 5-retry DB loop. Swap spawn direction (spawn business logic, serve HTTP on main). Consistent recovery behavior. |
| 5 | **Unify `create_tables()` signatures** across Rust services | 4 `database.rs` files | Standardize on `pool: &PgPool` (borrow from Arc at call site). |
| 6 | **Add `Initializable` optional interface** to Go API | `integration/integration.go`, `core/server.go`, `main.go` | Formalize the `Init()` protocol that Fantasy uses. Auto-call during `RegisterIntegration()`. |
| 7 | **Create `useAuthenticatedFetch` hook** in frontend | New hook + update `dashboard.tsx`, all DashboardTabs | Eliminate `getToken` prop drilling. A context or hook that wraps `authenticatedFetch` with the token. |
| 8 | **Remove `DATABASE_URL` build ARG** from sports/rss Dockerfiles | 2 Dockerfiles | Runtime-only env prevents baking secrets into image layers. |

#### Tier 3 — Polish

| # | Refactor | Files | Rationale |
|---|----------|-------|-----------|
| 9 | **Use the integration registry** in `integrations.tsx` page | `integrations.tsx` | Eliminate the duplicate `INTEGRATIONS` array. Derive all data from the single registry. |
| 10 | **Add `dashboardKey` to `IntegrationManifest`** (extension) | `integrations/types.ts`, `FeedBar.tsx`, each integration | Eliminate the hardcoded `DASHBOARD_KEY_MAP`. |
| 11 | **Move Coolify `strip_prefix("db.")` fixup** to a single shared function | Rust `database.rs` files (or shared crate) | Deployment-platform coupling should be isolated, not copy-pasted. |
| 12 | **Cache encryption key at startup** in Go API | `api/core/database.go` | `GetEncryptionKey()` reads env + decodes base64 on every `Encrypt()` call. Cache once in `init()` or `NewServer()`. |
| 13 | **Clean up dead code** in extension | `sse.ts` (`FRAMEWORK_TABLES`), `useScrollrCDC.ts` (`itemsRef`), messaging lazy import | Minor hygiene. |
| 14 | **Add error boundaries and toast notifications** to frontend | `dashboard.tsx`, API client | Every `catch` is silent. At minimum, log errors; ideally show user feedback. |

---

### 3.3 Architecture Quality Scorecard

| Component | Consistency | Abstraction Quality | Separation of Concerns | DX / Extensibility | Overall |
|-----------|-------------|--------------------|-----------------------|-------------------|---------|
| Go API Integration System | 5/5 | 5/5 | 4/5 | 5/5 | **4.75/5** |
| Extension Plugin Framework | 5/5 | 4/5 | 5/5 | 5/5 | **4.75/5** |
| Frontend Integration Framework | 4/5 | 3/5 | 3/5 | 4/5 | **3.5/5** |
| Rust Ingestion Services | 3/5 | 3/5 | 4/5 | 3/5 | **3.25/5** |
| Cross-Layer Coherence | 5/5 | 4/5 | 4/5 | 5/5 | **4.5/5** |

The **strongest** aspect of this codebase is the cross-layer integration design — the same ID, same plugin pattern, same registry concept at every layer. This is rare and well-executed.

The **weakest** aspect is the Rust code duplication and the frontend's `dashboard.tsx` god component, both of which are already identified as technical debt.
