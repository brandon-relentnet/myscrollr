# SECURE Audit Report

## Executive Summary (Health Score: 4/10)

The project demonstrates a good foundation in some areas, such as using parameterized SQL queries and implementing automated HTTPS via ACME. However, there are **critical security flaws** in the authentication and authorization flow, particularly regarding OAuth2 CSRF protection and token exposure. The current implementation of CSRF "protection" is functionally non-existent and logically flawed due to incorrect state management in the Axum framework. Furthermore, the use of `postMessage` with a wildcard origin (`*`) represents a high-risk vulnerability for token theft.

## Critical Findings (Immediate Action)

### 1. Broken OAuth2 CSRF Protection
*   **Issue**: The `yahoo` handler generates a CSRF token but the `yahoo_callback` never validates it (`//TODO: use csrf_token to validate`).
*   **Logic Flaw**: The `csref_token` is stored in a cloned `ServerState` within the handler. In Axum, `State` is cloned for each request. Changes made to the state within a handler (like `web_state.csref_token = Some(csref_token)`) are local to that request and are lost immediately, making it impossible for the callback to verify the token against the original request.
*   **Impact**: Vulnerable to Cross-Site Request Forgery (CSRF) during the OAuth2 login flow.

### 2. High-Risk `postMessage` Origin
*   **Issue**: In `yahoo_callback`, the authentication tokens are sent to the window opener via `window.opener.postMessage(..., '*')`.
*   **Impact**: Using `'*'` as the target origin allows *any* malicious site that can open the popup or navigate the window to intercept the user's `accessToken` and `refreshToken`.
*   **Recommendation**: Replace `'*'` with the explicit frontend domain (e.g., `https://app.scrollr.com`).

### 3. Sensitive Data in `Tokens` Struct
*   **Issue**: The `Tokens` struct includes `client_secret`. This struct is passed across crate boundaries and through various utility functions.
*   **Impact**: Increased risk of accidental leakage through logging (`Debug` implementations) or if the struct is ever serialized to a client response. The `client_secret` should only exist in the `ServerState` or environment-level configuration.

### 4. Missing Security Headers
*   **Issue**: While `X-Frame-Options` is present, other critical headers are missing:
    *   `Content-Security-Policy` (CSP)
    *   `X-Content-Type-Options: nosniff`
    *   `Strict-Transport-Security` (HSTS) - though ACME is used, the header should be explicitly sent.

## Optimization Suggestions (Long-term)

*   **State Management**: Use `Arc<Mutex<...>>` or a dedicated session store (e.g., Redis or encrypted cookies) to store pending OAuth states for verification.
*   **Secret Masking**: Implement custom `Debug` and `Serialize` for structs containing secrets to ensure they are never logged or leaked.
*   **Token Storage**: Prefer storing tokens exclusively in `HttpOnly`, `Secure` cookies. Avoid passing them back to the frontend JS via `postMessage` if possible; instead, have the frontend rely on the cookies for authenticated requests to the backend proxy.
*   **Rate Limiting**: Implement rate limiting on the `/yahoo/start` and `/yahoo/callback` endpoints to prevent brute-force or exhaustion attacks.

## Progress Checklist

- [ ] Fix `postMessage` target origin from `'*'` to a specific domain.
- [ ] Implement proper OAuth2 `state` validation in `yahoo_callback`.
- [ ] Move `client_secret` out of the `Tokens` struct.
- [ ] Add missing security headers (CSP, HSTS, X-Content-Type-Options).
- [ ] Implement custom `Debug` for `ServerState` and `Tokens` to mask secrets.
- [ ] Verify that error responses do not leak internal system information.
- [ ] Add a CORS layer with a strict allow-list.
