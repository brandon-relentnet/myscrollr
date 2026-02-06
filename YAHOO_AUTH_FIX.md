# Yahoo OAuth Fix Plan

## Problem

Clicking "Connect Yahoo Account" on the dashboard returns:
```json
{"status":"unauthorized","error":"Missing authentication"}
```

## Root Cause

`/yahoo/start` is protected by `LogtoAuth` middleware (`api/main.go:145`).
The dashboard opens this URL via `<a target="_blank">`, which opens a **new browser tab**.
That tab does not carry the Logto JWT (sent via `Authorization` header by the React app),
so the middleware rejects the request before the Yahoo OAuth redirect ever fires.

## Fix: Make `/yahoo/start` a Public Route

**File:** `api/main.go`

**Current (line 145):**
```go
api.Get("/yahoo/start", LogtoAuth, YahooStart)
```

**Change to (move to public routes section, around line 128):**
```go
app.Get("/yahoo/start", YahooStart)
```

### Security Analysis

This is safe because:

| Concern | Mitigation |
|---------|-----------|
| **CSRF** | `YahooStart` generates a random `state` token stored in Redis with a 10-minute TTL. `YahooCallback` validates it via `GetDel`, so it can only be used once. |
| **Redirect URI** | Yahoo validates the `redirect_uri` matches the registered app config. An attacker can't redirect tokens to their own server. |
| **Data exposure** | `/yahoo/start` returns zero user data. It only issues a 307 redirect to Yahoo's login page. |
| **Token endpoints** | `/yahoo/leagues`, `/yahoo/league/:key/standings`, etc. all remain behind `LogtoAuth`. No data is exposed. |

### Steps

- [ ] **1. Move route to public section in `api/main.go`**
  - Move `app.Get("/yahoo/start", YahooStart)` to public routes (next to `/yahoo/callback`).
  - Remove the old `api.Get("/yahoo/start", LogtoAuth, YahooStart)` line.

- [ ] **2. Build and verify**
  - Docker build the API to confirm compilation.

- [ ] **3. Commit and push to staging**

- [ ] **4. Test**
  - Navigate to Dashboard -> Fantasy tab.
  - Click "Connect Yahoo Account".
  - Verify redirect to Yahoo login page (not a 401 error).
  - Complete Yahoo login and verify callback closes the popup.
