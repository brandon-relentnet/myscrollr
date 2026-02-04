# MyScrollr Project Overview

MyScrollr is a multi-component service designed to aggregate financial market data, sports scores, and provide deep integration with Yahoo Fantasy Sports. The project is currently centered around its Rust-based backend services.

## Architecture

The project is organized into several top-level directories, representing different parts of the ecosystem:

*   **`ingestion/`**: The core backend, implemented as a Rust workspace.
    *   **`yahoo_service`**: The Yahoo Bridge & Gateway. An Axum web server that handles Yahoo OAuth2 flow, and proxies data from the specialized services.
    *   **`finance_service`**: Fetches and manages financial data using Finnhub (WebSocket and HTTP).
    *   **`sports_service`**: Polls the ESPN API for live sports scores across various leagues (NFL, NBA, NHL, etc.).
    *   **`yahoo_service/yahoo_fantasy`**: A library crate that wraps the Yahoo Fantasy Sports API, handling token management and data fetching for leagues, standings, and rosters.
*   **`api/`**: The high-performance public API, built with **Go** and **Fiber**.
    *   Designed for low-latency responses to the frontend.
    *   Connects to the shared PostgreSQL database populated by the ingestion services.
    *   Uses **Redis** for high-performance caching of common data.
*   **`extension/`**: (Placeholder) Currently empty. Intended for a browser extension.
*   **`myscrollr.com/`**: (Placeholder) Currently empty. The planned frontend application.
*   **`docs/`**: General project documentation.

## Key Technologies

*   **Language**: Rust (Stable), Go (1.23+)
*   **Web Framework**: Axum (Rust), Fiber (Go)
*   **Runtime**: Tokio (Rust)
*   **Database**: PostgreSQL (via SQLx in Rust, pgx in Go)
*   **Caching**: Redis
*   **Containerization**: Docker (managed via a `Makefile` in `ingestion/`)
*   **External APIs**: Yahoo Fantasy Sports (OAuth2), Finnhub, ESPN.

## Building and Running

### Prerequisites

*   Rust toolchain
*   Go toolchain
*   PostgreSQL
*   Redis
*   Docker (optional, for containerized deployment)

### Backend (Ingestion)

Navigate to the `ingestion/` directory to manage the backend services.

1.  **Configuration**: Copy `.env.example` to `.env` and fill in the required credentials (DB, Yahoo Client ID/Secret, Finnhub API Key).
2.  **Native Run**:
    *   The project documentation refers to a `start.sh` script for release builds, though it may be generated or located in specific environments.
    *   Standard Cargo commands: `cargo build` or `cargo run -p <service_name>` (e.g., `cargo run -p yahoo_service`).
3.  **Docker**:
    *   Build all services: `make build-all`
    *   Run specific services: `make run-backend`, `make run-finance`, or `make run-sports`.

## Development Conventions

*   **Workspace Structure**: Use the Rust workspace in `ingestion/` for backend logic. Shared logic currently resides in individual service `database.rs` and `log.rs` files, with plans to move these to a common utility module/crate.
*   **Error Handling**: (Ongoing improvement) The codebase is transitioning away from `panic`/`unwrap` towards more robust `Result`-based error propagation using `anyhow`.
*   **Type Safety**: Efforts are underway to replace "stringly typed" logic with strongly typed Enums for sports and data trends.
*   **Database**: Tables are created programmatically on service startup. See `create_tables` functions in the respective service modules.

## Key Endpoints (Backend)

*   `GET /yahoo/start`: Initiate Yahoo OAuth flow.
*   `GET /yahoo/leagues`: Fetch user leagues (requires Bearer token).
*   `GET /yahoo/league/:key/standings`: Fetch standings for a specific league.
*   `GET /yahoo/team/:key/roster`: Fetch team roster.
*   `POST /`: Trigger scheduled updates (finance or sports).
