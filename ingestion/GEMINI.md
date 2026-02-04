# Scrollr Rust Backend

## Project Overview

This is the backend for **Scrollr**, a service that aggregates financial market data and sports scores, and provides integration with Yahoo Fantasy Sports. It is built as a **Rust workspace** consisting of a central web server and specialized micro-services/libraries.

The system uses **Axum** for the web server, **PostgreSQL** (via SQLx) for persistence, and **Tokio** for asynchronous runtime. It supports automatic TLS via Let's Encrypt (`tokio_rustls_acme`).

## Architecture

The project is organized as a Rust workspace with the following members:

*   **`scrollr_backend`**: The main entry point. It runs the Axum web server, initializes the finance and sports services, and handles HTTP requests, including the Yahoo OAuth2 flow and API proxying.
*   **`finance_service`**: Responsible for fetching and storing financial data.
    *   Connects to **Finnhub** via WebSocket for real-time updates and HTTP for daily close data.
    *   Manages database tables for symbols, trades, and previous closes.
*   **`sports_service`**: Responsible for fetching and storing sports scores.
    *   Polls the **ESPN API** for live game data.
    *   Supports configurable leagues via `configs/leagues.json`.
*   **`yahoo_fantasy`**: A library crate wrapping the Yahoo Fantasy Sports API.
    *   Handles OAuth2 token exchange and refreshing.
    *   Fetches user leagues, standings, and team rosters (supporting NFL, NBA, NHL).
*   **`utils`**: Shared utilities.
    *   **Database**: Centralized `PgPool` initialization and schema management (programmatic table creation).
    *   **Logging**: Custom asynchronous logging setup.

## Getting Started

### Prerequisites

*   **Rust**: Stable toolchain.
*   **PostgreSQL**: A running Postgres instance.
*   **Environment Variables**: A `.env` file is required.

### Configuration

1.  Copy the example configuration:
    ```bash
    cp .env.example .env
    ```
2.  Edit `.env` to provide:
    *   Database credentials (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.).
    *   Yahoo API credentials (`YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`).
    *   Finnhub API key.
    *   Domain name and contact email (for Let's Encrypt).

### Building and Running

The project includes a `start.sh` script to handle the release build and execution.

```bash
./start.sh
```

This script will:
1.  Check for `cargo`.
2.  Clean up previous builds in `./release`.
3.  Compile the project in **release mode**.
4.  Create a `./release` directory containing the binary, configs, and `.env`.
5.  Run the application.

**Note:** The application attempts to bind to port **8443** (HTTPS) and requires a valid domain name configured in `.env` for the ACME challenge.

## Key Features & Endpoints

### Yahoo Fantasy Integration
The backend acts as a proxy/middleware for Yahoo Fantasy API, handling authentication.

*   `GET /yahoo/start`: Initiates OAuth flow (redirects to Yahoo).
*   `GET /yahoo/callback`: Handle OAuth callback, exchanges code for tokens, and returns a page that posts the token back to the opener window.
*   `GET /yahoo/leagues`: Fetches the authenticated user's leagues.
*   `GET /yahoo/league/:league_key/standings`: Fetches standings for a specific league.
*   `GET /yahoo/team/:team_key/roster`: Fetches roster for a specific team.

### Scheduled Jobs
The root endpoint `POST /` is used to trigger scheduled tasks (likely from an external scheduler like Supabase or cron).

*   **Payload**: `{ "schedule_type": "finance" }` -> Updates previous day's stock closes.
*   **Payload**: `{ "schedule_type": "sports", "data": ["nfl", "nba"] }` -> Triggers polling for specific sports leagues.

## Database & Persistence

*   **Technology**: PostgreSQL, accessed via `sqlx`.
*   **Schema**: Tables are created programmatically on service startup (`create_tables` functions in `finance_service` and `sports_service`).
*   **Configuration**: Connection pooling is configured in `utils::database::initialize_pool`.

## Development

*   **Logging**: Logs are written to the `./logs` directory and stdout.
*   **Configs**: League configurations are in `configs/leagues.json` and subscription (stock) configurations in `configs/subscriptions.json`.
