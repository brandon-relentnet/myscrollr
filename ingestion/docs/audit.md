# AUDIT Report

## Executive Summary (Health Score: 5/10)

The Scrollr Rust Backend demonstrates a solid use of the Axum framework and Tokio runtime for asynchronous tasks. The codebase is well-structured into services and utilities. However, there are significant **architectural anti-patterns** and **robustness issues** that hinder its scalability and reliability. The most critical issue is the misuse of Axum's `State`, which leads to a complete failure of the OAuth2 CSRF protection mechanism. Additionally, the heavy reliance on `unwrap()` and `expect()` in critical paths, combined with aggressive database operations (like clearing tables before successful data fetching), poses a risk to system stability and data integrity.

## Critical Findings (Immediate Action)

### 1. Axum State Misuse & Broken Logic
*   **Issue**: In `scrollr_backend/src/main.rs`, the `get_yahoo_handler` attempts to store a CSRF token in `web_state`. Because Axum clones the state for every request, this mutation is local to the current request and never persists.
*   **Impact**: CSRF validation is impossible to implement correctly with the current architecture, leaving the OAuth flow vulnerable.
*   **Recommendation**: Move volatile state (like CSRF tokens or sessions) into a shared, thread-safe container like `Arc<Mutex<...>>` or use a dedicated session management middleware.

### 2. Brittle Error Handling (Panic Risks)
*   **Issue**: Extensive use of `.unwrap()` and `.expect()` in handlers and background tasks (e.g., `fs::read_to_string(...).unwrap()`, `res.json::<...>().await.unwrap()`).
*   **Impact**: Any external failure (missing config file, malformed API response from ESPN/Yahoo/Finnhub) will cause the individual task to panic. While Tokio handles task panics without crashing the whole server, it results in silent service degradation and poor error reporting.
*   **Recommendation**: Replace `unwrap()` with proper error propagation using `Result`, `?` operator, and `anyhow` or `thiserror`. Implement graceful degradation.

### 3. Destructive Data Ingestion Pattern
*   **Issue**: The `sports_service` calls `clear_tables` *before* attempting to fetch and process new data from the ESPN API.
*   **Impact**: If the API call fails or the network is down, the database is left empty until the next successful trigger. This creates a "blackout" period for users.
*   **Recommendation**: Use an "upsert" (ON CONFLICT) strategy or fetch the new data into memory/temp table first, then perform the swap in a single database transaction.

## Optimization Suggestions (Long-term)

### 1. Decouple Business Logic from Handlers
*   **Observation**: Large blocks of logic (like sports ingestion and OAuth exchange) are directly inside Axum handlers.
*   **Suggestion**: Move complex logic into service layers (e.g., `YahooService`, `SportsIngestor`). Handlers should only be responsible for request parsing and response formatting.

### 2. Implement Background Worker Loop for Sports
*   **Observation**: `sports_service` relies on external POST requests to trigger updates.
*   **Suggestion**: Implement an internal ticker/loop (similar to `finance_service`) to ensure data is updated consistently without relying on external triggers, or use a robust job queue if external triggers are required.

### 3. Centralized Secret Management
*   **Observation**: Secrets are passed around in structs like `Tokens`.
*   **Suggestion**: Keep secrets encapsulated within the service that needs them. Use a specialized "Secret" type that implements `Drop` to zero out memory or at least hides its value in `Debug` prints.

### 4. Improve WebSocket Resilience
*   **Observation**: The Finnhub websocket uses a hard 5-minute sleep on failure.
*   **Suggestion**: Implement exponential backoff for reconnections to recover faster from transient failures while still protecting the API from rate-limiting during extended outages.

## Progress Checklist

- [ ] Refactor `ServerState` to use `Arc<Mutex<...>>` or `Arc<RwLock<...>>` for any mutable state.
- [ ] Audit all `.unwrap()` calls and replace with safe error handling.
- [ ] Refactor `ingest_data` in `sports_service` to avoid clearing tables before fetching.
- [ ] Add request timeouts to all external API calls (reqwest).
- [ ] Implement proper CSRF validation in `yahoo_callback`.
- [ ] Standardize error response format across all endpoints using `ErrorCodeResponse`.
- [ ] Add unit tests for core logic (especially OAuth token handling and data parsing).
