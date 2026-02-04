# SECURE Audit Report

## Executive Summary (Health Score: 6/10)

The MyScrollr project demonstrates a solid understanding of modern authentication flows (OIDC, OAuth2 with PKCE/CSRF) and secure database interaction (parameterized queries). However, the **storage of long-lived refresh tokens in plaintext** and some loose configurations in CSP and cross-origin communication represent significant risks that must be addressed to ensure production readiness.

## Critical Findings (Immediate Action)

### 1. Plaintext Refresh Token Storage

- **Location**: `yahoo_users` table, managed by both Go API (`api/database.go`) and Rust Ingestion (`ingestion/yahoo_service/src/database.rs`).
- **Issue**: Yahoo OAuth2 refresh tokens are stored as `TEXT NOT NULL` without encryption. These tokens are long-lived and grant persistent access to user data.
- **Risk**: A database leak would compromise all connected Yahoo Fantasy accounts indefinitely until tokens are manually revoked.
- **Recommendation**: Implement AES-256-GCM encryption for the `refresh_token` column using a key derived from an environment variable (e.g., `ENCRYPTION_KEY`).

### 2. Loose `postMessage` Target Origin

- **Location**: `api/yahoo.go` - `YahooCallback` function.
- **Issue**: The `postMessage` call uses `frontendURL` as the target origin. If `FRONTEND_URL` is not configured, it may default to an empty string, which some browsers might interpret as `*` or fail silently.
- **Risk**: Sensitive auth completion events could be intercepted by malicious sites if the user is tricked into opening the auth flow from a different origin.
- **Recommendation**: Hardcode a default origin or enforce a strict check that `frontendURL` is set and valid before sending the message.

### 3. Sensitive Data in Redis Keys

- **Location**: `api/yahoo.go` - `getGuid` and `YahooCallback`.
- **Issue**: Yahoo access tokens are used directly in Redis keys (e.g., `"token_to_guid:"+accessToken`).
- **Risk**: Redis logs or `MONITOR` commands could leak active access tokens.
- **Recommendation**: Hash the access token (e.g., SHA-256) before using it as a Redis key.

## Optimization Suggestions (Long-term)

### 1. Hardened CSP

- **Issue**: The current CSP allows `https://cdn.tailwindcss.com` and `unsafe-inline` styles.
- **Recommendation**: For production, move to a build-step Tailwind process, remove the CDN script, and use nonces or hashes for any required inline styles.

### 2. Strict Audience Verification

- **Issue**: Logto audience verification is skipped if `LOGTO_API_RESOURCE` is missing.
- **Recommendation**: Make `LOGTO_API_RESOURCE` a required environment variable in production to prevent token misuse across different applications.

### 3. Database Error Handling

- **Issue**: Multiple locations in Rust ingestion use `let _ = query(...).execute(pool).await;`, ignoring potential database failures.
- **Recommendation**: Use `?` or explicit error logging to ensure database failures are visible and don't lead to silent data desynchronization.

## Progress Checklist

- [x] Encrypt `refresh_token` in `yahoo_users` table.

- [x] Hash access tokens used in Redis keys.

- [x] Enforce strict origin in `postMessage` for Yahoo callback.

- [x] Require `LOGTO_API_RESOURCE` for JWT validation.

- [ ] Refactor CSP to remove external CDNs and `unsafe-inline`.

- [x] Implement robust error handling for all database operations in ingestion services.


