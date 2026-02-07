# MyScrollr — Active Streams & Immediate Actions Plan

## Execution Order

| # | Task | Scope | Test After? |
|---|------|-------|-------------|
| 1 | Extension → Browser Auto Sign-In | Extension + Frontend | Yes |
| 4 | Security Node (Logto Account Center) | Frontend | Yes |
| 2 | Active Streams — Backend (DB + API) | Go API | No (tested with Task 3) |
| 3 | Active Streams — Dashboard Refactor | Frontend | Yes |

---

## Task 1: Extension → Browser Auto Sign-In

**Problem:** After signing in via the extension, the user must manually click "Sign In" on the frontend dashboard even though Logto already has an active session (shared browser cookies from `launchWebAuthFlow`).

**Solution:** Two changes — the extension opens the frontend after login, and the frontend auto-triggers Logto sign-in instead of showing a manual button.

### Changes

| File | Change |
|------|--------|
| `extension/entrypoints/background/messaging.ts` | After successful login + dashboard fetch, open `FRONTEND_URL + '/dashboard'` in a new tab |
| `myscrollr.com/src/routes/dashboard.tsx` | Replace the sign-in card (lines 249-275) with auto `signIn()` trigger + loading spinner when user is unauthenticated |

### Flow

1. User clicks "Sign In" in extension popup/content script
2. Extension performs PKCE OAuth via `browser.identity.launchWebAuthFlow` → Logto sets session cookie in browser
3. Extension background fetches `/dashboard` data, merges state
4. **NEW:** Extension opens `https://myscrollr.com/dashboard` in a new tab
5. **NEW:** Frontend `/dashboard` detects `!isAuthenticated`, auto-calls `signIn()` instead of showing a card
6. Logto sees existing session cookie → instantly redirects back → user is authenticated on frontend

---

## Task 4: Security Node (Logto Account Center)

**Problem:** Security Node on `/account` page is disabled with "Coming Soon" badge. Users can't change password, email, or manage MFA.

**Solution:** Enable the Security Node card and link it to Logto's built-in Account Center.

### Changes

| File | Change |
|------|--------|
| `myscrollr.com/src/routes/account.tsx` | Remove `disabled` prop from Security Node `HubCard`. Change `to` to open Logto Account Center URL in a new tab. |

### Logto Account Center URL

```
https://auth.myscrollr.relentnet.dev/account
```

---

## Task 2: Active Streams — Backend

**Problem:** No data model exists for user-configurable "streams." The dashboard has hardcoded module tabs with no persistence.

**Solution:** New `user_streams` database table + CRUD API endpoints.

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS user_streams (
    id              SERIAL PRIMARY KEY,
    logto_sub       TEXT NOT NULL,
    stream_type     TEXT NOT NULL,          -- 'finance', 'sports', 'fantasy', 'rss'
    enabled         BOOLEAN NOT NULL DEFAULT true,
    visible         BOOLEAN NOT NULL DEFAULT true,  -- shown on ticker
    config          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(logto_sub, stream_type)
);
```

### Config JSONB per stream type

- **Finance:** `{ "tracked_symbols": ["AAPL", "TSLA", "BTC", ...] }`
- **Sports:** `{ "tracked_leagues": ["nfl", "nba", "nhl", "mlb"] }`
- **Fantasy:** `{}` (Yahoo config managed separately via existing yahoo_users system)
- **RSS:** `{ "feeds": [{ "name": "Hacker News", "url": "https://..." }] }`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me/streams` | List all streams (auto-seeds defaults if empty) |
| `POST` | `/users/me/streams` | Add a new stream |
| `PUT` | `/users/me/streams/:type` | Update stream (toggle enabled/visible, update config) |
| `DELETE` | `/users/me/streams/:type` | Remove a stream |

### Auto-Seeding

When `GET /users/me/streams` returns empty (new user), auto-create:
- Finance stream (enabled, visible)
- Sports stream (enabled, visible)

### Files

| File | Change |
|------|--------|
| `api/database.go` | Add `user_streams` table creation in `ConnectDB()` |
| `api/streams.go` (new) | CRUD handlers + auto-seed logic |
| `api/main.go` | Register 4 new routes |
| `api/models.go` | Add `Stream` struct |

---

## Task 3: Active Streams — Dashboard Refactor

**Problem:** Dashboard currently displays live data (prices, scores) which is the ticker's job. The "Add Stream" button is a no-op. Quick stats are hardcoded.

**Solution:** Refactor `/dashboard` from a data viewer to a stream management interface.

### New Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: "Your Streams" + Add Stream btn + Settings  │
├───────────┬─────────────────────────────────────────┤
│ Sidebar   │ Main Content                            │
│           │                                         │
│ [Finance] │ ┌─ Stream Management Card ────────────┐ │
│  ● active │ │ Finance Stream                      │ │
│           │ │ Status: Connected ● | Last: 2s ago  │ │
│ [Sports]  │ │                                     │ │
│  ● active │ │ [Enabled ✓] [Visible on Ticker ✓]  │ │
│           │ │                                     │ │
│ [Fantasy] │ │ Tracked Symbols: 50                 │ │
│  ○ setup  │ │ ┌────┐ ┌────┐ ┌────┐ ┌────┐       │ │
│           │ │ │AAPL│ │TSLA│ │BTC │ │ +  │       │ │
│ [RSS]     │ │ └────┘ └────┘ └────┘ └────┘       │ │
│  ○ off    │ │                                     │ │
│           │ └─────────────────────────────────────┘ │
│ + Add     │                                         │
└───────────┴─────────────────────────────────────────┘
```

### Stream Management Views

**Finance Stream:**
- Toggle enabled/disabled
- Toggle visible on ticker
- Tracked symbols list (from `config.tracked_symbols` or from `tracked_symbols` DB table)
- Connection status (Finnhub WebSocket status via health endpoint)
- Last update timestamp

**Sports Stream:**
- Toggle enabled/disabled
- Toggle visible on ticker
- Tracked leagues with toggles
- Connection status (ESPN polling)
- Active/upcoming game count

**Fantasy Stream:**
- Yahoo connection status + connect/disconnect
- League list (existing `FantasyConfig` logic)
- Toggle enabled/disabled
- Toggle visible on ticker

**RSS Stream:**
- Feed URL management (add/remove)
- Toggle enabled/disabled
- Toggle visible on ticker

### Quick Stats

Replace hardcoded values with computed values from streams API:
- Active Streams count (from `user_streams` where `enabled = true`)
- Total tracked items (sum of symbols + leagues + feeds)

### Settings Panel

The `SettingsPanel` remains for **general scrollbar settings** only:
- Position (top/bottom)
- Display mode (comfort/compact)
- Behavior (overlay/push)
- Site allow/block lists
- Feed visibility (global on/off)

Stream-specific visibility toggles move to each stream's management card.

### Migration: `active_tabs` → `user_streams.visible`

The existing `user_preferences.active_tabs` field becomes redundant. The frontend/extension should derive active ticker tabs from `user_streams` where `visible = true`. This migration happens gradually:
1. Backend: When returning streams, also include a computed `active_tabs` array for backward compatibility
2. Frontend: Read from streams API instead of preferences
3. Extension: Continue reading `activeFeedTabs` storage (updated by the dashboard when stream visibility changes)

### Files

| File | Change |
|------|--------|
| `myscrollr.com/src/api/client.ts` | Add `streamsApi` with CRUD methods |
| `myscrollr.com/src/routes/dashboard.tsx` | Major refactor: dynamic sidebar from streams API, management views per stream type |
| `myscrollr.com/src/components/SettingsPanel.tsx` | Remove stream-specific controls (categories pills), keep general settings only |

---

## Future Work (Not in this plan)

- Style the ticker itself (extension content script CSS)
- Integrate web search as a new stream type
- Create dashboard pages for each official integration
- Create `/integrations` route (integration marketplace/catalog)
- Finalize homepage with active examples
- Header/navigation cleanup
- RSS feed backend (server-side polling service)
