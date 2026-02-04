# [DX] Audit Report

## Executive Summary (Health Score: 6/10)

The codebase demonstrates a solid architectural foundation, utilizing a Cargo workspace to separate concerns effectively (`finance`, `sports`, `yahoo`, `backend`).The choice of modern libraries (`axum`, `tokio`, `sqlx`) indicates a forward-looking stack. However, the Developer Experience and system stability are significantly compromised by the pervasive use of "panic-on-error" patterns (`.unwrap()`) and "stringly typed" logic. While the happy path works, the codebase is fragile and prone to crashes when encountering unexpected external data.

## Critical Findings (Immediate Action)

### 1. The "Unwrap" Epidemic (Stability Risk)

**Severity:** Critical
The codebase frequently uses `.unwrap()` and `.expect()` on operations that can fail at runtime, particularly when dealing with external I/O (files, network requests, parsing).

- **Locations:**
- `sports_service/src/lib.rs`: `fs::read_to_string(...).unwrap()`, `res.json::<ScoreboardResponse>().await.unwrap()`, `datetime_utc...unwrap()`.
- `scrollr_backend/src/main.rs`: `serde_json::from_str(...).unwrap()`, `result.unwrap()`.
- `yahoo_fantasy/src/lib.rs`: `token_result.unwrap()`.
- **Impact:** A single API failure from ESPN or a typo in `leagues.json` will crash the entire application service.
- **Remediation:** Replace all `.unwrap()` usage with proper `Result` propagation (`?` operator) and handle errors gracefully.

### 2. "Stringly Typed" Logic

**Severity:** High
Core business logic relies on raw string matching rather than Rust's type system.

- **Locations:**
- `scrollr_backend/src/main.rs`: `match query.sport.as_str() { "nfl" | "football" => ... }`.
- `finance_service/src/lib.rs`: Direction strings `"up"` / `"down"`.
- **Impact:** Prone to typos and refactoring errors. The compiler cannot catch invalid sport names or states.
- **Remediation:** Introduce `enum Sport { NFL, NBA, ... }` and `enum Trend { Up, Down }`. Implement `FromStr` for parsing strings into these enums.

### 3. Inline HTML/JS Generation

**Severity:** Medium
The Yahoo OAuth callback handler generates a full HTML page with embedded JavaScript using `format!` inside `main.rs`.

- **Location:** `scrollr_backend/src/main.rs` (`yahoo_callback` function).
- **Impact:** Hard to read, maintain, and lint. No syntax highlighting for the embedded HTML/JS.
- **Remediation:** Move this content to a separate file (e.g., `templates/callback.html`) or at least a constant with clear separation.

## Optimization Suggestions (Long-term)

### 1. Centralized Configuration

Currently, `env::var` calls are scattered, and `leagues.json` reading is duplicated.

- **Suggestion:** Create a global `Config` struct initialized at startup that loads all ENV variables and JSON configs. This fails fast at startup if configs are missing.

### 2. Semantic Error Handling

The project uses `anyhow` in some places but generic `Box<dyn Error>` or string errors in others.

- **Suggestion:** Standardize on `thiserror` for library crates and `anyhow` for the application binary to expose typed errors.

### 3. Service Trait Abstraction

The `finance_service` and `sports_service` are tightly coupled to specific providers.

- **Suggestion:** Define a `DataSource` trait to allow easier swapping of providers without rewriting the service logic.

## Progress Checklist

- [ ] **Refactor:** Remove `unwrap()` from `sports_service/src/lib.rs` (Replace with `if let Ok` or `?`).
- [ ] **Refactor:** Remove `unwrap()` from `scrollr_backend/src/main.rs` config loading.
- [ ] **Type Safety:** Create `enum Sport` in `types.rs` and use it in routing/logic.
- [ ] **Cleanup:** Extract Yahoo callback HTML string to a constant or external file.
- [ ] **Docs:** Add doc comments to `scrollr_backend` handler functions explaining the request flow.
