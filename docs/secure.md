# SECURE Audit Report

## Executive Summary (Health Score: 6/10)

The MyScrollr project demonstrates a strong foundation in security best practices, particularly regarding authentication and session management. The use of Logto with OIDC/PKCE, CSRF protection via Redis, and secure, HTTPOnly cookies is commendable. However, a **CRITICAL** finding regarding the storage of Yahoo refresh tokens in plain text significantly impacts the overall health score. Addressing this, along with improving input sanitization and logging hygiene, will substantially harden the system.

## Critical Findings (Immediate Action)

### 1. Plain-text Refresh Tokens in Database

- **Location**: `ingestion/yahoo_service/src/database.rs` -> `yahoo_users` table.
- **Issue**: Yahoo OAuth2 `refresh_token` values are stored as plain text. If the database is compromised, an attacker gains permanent access to all users' Yahoo Fantasy data.
- **Recommendation**: Implement AES-256-GCM encryption for the `refresh_token` column. Use a Pepper/Master Key stored in an HSM or a secure environment variable (managed via secret manager like HashiCorp Vault or AWS KMS).

### 2. PostMessage Origin Security

- **Location**: `api/yahoo.go` -> `YahooCallback` function.
- **Issue**: The `postMessage` target origin uses `frontendURL`, which defaults to the API's own domain or a potentially insecure fallback if `FRONTEND_URL` is not set.
- **Recommendation**: Ensure `FRONTEND_URL` is strictly validated against a whitelist and never defaults to a wildcard or the current request's domain without verification.

## Optimization Suggestions (Long-term)

### 1. Database Column Encryption (PG-Crypto)

Consider using PostgreSQL's `pgcrypto` extension for transparent or application-level encryption of sensitive data beyond just refresh tokens, such as user identifiers if PII concerns arise.

### 2. Input Sanitization & Type Safety

- **Location**: `api/yahoo.go` (`league_key`, `team_key`)
- **Issue**: Route parameters are injected directly into Yahoo API URLs.
- **Recommendation**: Implement regex validation for Yahoo-specific identifiers (e.g., `^\d+\.l\.\d+$`) before using them in upstream requests to prevent potential URL injection or unexpected API behavior.

### 3. WebSocket URL Masking

- **Location**: `ingestion/finance_service/src/websocket.rs`
- **Issue**: Finnhub API Key is passed as a query parameter in the WebSocket URL.
- **Recommendation**: Ensure the logging middleware specifically redacts the `token` query parameter from any "connecting to..." log messages.

### 4. Content Security Policy (CSP)

The `LandingPage` in `api/main.go` serves inline scripts and styles. Implementing a strict CSP would mitigate XSS risks, especially as the application grows.

## Progress Checklist

- [ ] Implement encryption for `yahoo_users.refresh_token`.
- [ ] Add regex validation for `league_key` and `team_key` in API routes.
- [ ] Audit all logs for potential secret leakage (Finnhub tokens, etc.).
- [ ] Verify `FRONTEND_URL` configuration in all production environments.
- [ ] Implement Content Security Policy (CSP) headers in Fiber middleware.
- [ ] Rotate `YAHOO_CLIENT_SECRET` after implementing DB encryption.
