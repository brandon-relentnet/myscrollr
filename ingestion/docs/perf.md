# PERF Audit Report

## Executive Summary (Health Score: 6/10)

The Scrollr Rust backend demonstrates a solid foundation using asynchronous Rust (`tokio`, `axum`). However, it suffers from several "death by a thousand cuts" performance issues, primarily centered around database interaction patterns, redundant I/O, and unoptimized background service logic. The system is functional but will face significant scalability issues as the number of tracked symbols or sports leagues increases.

## Critical Findings (Immediate Action)

### 1. Inefficient Database Connection Management
- **Issue**: Functions like `upsert_game`, `update_trade`, and `update_previous_close` acquire a new connection from the `PgPool` for every single operation.
- **Location**: `utils/src/database/*.rs`
- **Impact**: High overhead and latency. During batch updates (e.g., finance websocket trades or sports ingests), the system may exhaust the connection pool or spend more time managing connections than executing queries.

### 2. Lack of Bulk Database Operations
- **Issue**: Data is ingested and updated row-by-row in loops.
- **Location**: `finance_service/src/websocket.rs`, `sports_service/src/lib.rs`
- **Impact**: Significant database round-trip overhead. Upserting 30 games or 50 trade updates one-by-one is exponentially slower than a single bulk UPSERT.

### 3. Redundant Disk I/O
- **Issue**: `configs/leagues.json` is read and parsed from disk on every `sports` schedule request and every poll cycle.
- **Location**: `scrollr_backend/src/main.rs`, `sports_service/src/lib.rs`
- **Impact**: Unnecessary system calls and CPU cycles spent on JSON parsing for static configuration.

### 4. WebSocket Batch Processing Bottleneck
- **Issue**: `process_batch` in `finance_service` fetches the *entire* `trades` table from the database into a `HashMap` for every batch processing cycle.
- **Location**: `finance_service/src/websocket.rs:166`
- **Impact**: As the `trades` table grows, this operation becomes increasingly expensive, potentially leading to memory bloat and high latency in real-time updates.

## Optimization Suggestions (Long-term)

### 1. Connection Sharing & Transactions
- Refactor database utility functions to accept an `Executor` (either `&PgPool`, `&mut PgConnection`, or `&mut Transaction`) to allow multiple operations to reuse a single connection or run within a transaction.

### 2. Bulk UPSERTs
- Implement bulk UPSERT logic for sports games and finance trades using `UNNEST` or similar PostgreSQL features to reduce round-trips.

### 3. Persistent Configuration Caching
- Load `leagues.json` and `subscriptions.json` into `ServerState` or a `Lazy` static at startup. Use `Arc` to share the configuration across services.

### 4. Optimized Network Clients
- **Issue**: `sports_service` creates a new `reqwest::Client` for every `ingest_data` call.
- **Fix**: Share a single `reqwest::Client` (which is internally `Arc`ed) across the entire application to benefit from connection pooling.

### 5. XML Parsing Performance
- **Issue**: `yahoo_fantasy` uses `serde-xml-rs`.
- **Fix**: Migrate to `quick-xml`'s built-in `Deserialize` support, which is significantly faster and better maintained.

### 6. Streaming JSON Deserialization
- **Issue**: `finance_service` reads the entire response body into a string before parsing.
- **Fix**: Use `response.json::<T>()` or `serde_json::from_reader` to parse data directly from the response stream.

## Progress Checklist
- [ ] Implement bulk `upsert_game` in `utils/src/database/sports.rs`.
- [ ] Implement bulk `update_trade` in `utils/src/database/finance.rs`.
- [ ] Cache configuration files in `ServerState` at startup.
- [ ] Refactor `finance_service` websocket to avoid fetching all trades per batch.
- [ ] Centralize `reqwest::Client` usage.
- [ ] Migrate `yahoo_fantasy` to `quick-xml` for XML deserialization.
- [ ] Remove double-indirection `Arc<PgPool>` (use `PgPool` directly).
