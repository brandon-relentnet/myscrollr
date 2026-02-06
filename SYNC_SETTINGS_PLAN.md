# Server-Synced Extension Settings — Implementation Plan

## Goal

Replace the extension's local-only options page with server-synced preferences controlled from `myscrollr.com/dashboard`. The extension fetches preferences on login and receives live updates via SSE/CDC. No separate browser options page — the dashboard is the settings UI.

---

## Architecture

```
myscrollr.com/dashboard                    Extension (all tabs)
  (settings UI)                            (consumes settings)
       |                                          |
       v                                          v
  PUT /users/me/preferences ──> PostgreSQL ──> Sequin CDC
                                    |              |
                                    |              v
                                    |     POST /webhooks/sequin
                                    |              |
                                    |         Redis Pub/Sub
                                    |              |
                                    |         SSE broadcast
                                    |         (user_preferences CDC records)
                               GET /users/me/      |
                               preferences    ┌────┘
                                    |          |
                                    v          v
                              Extension background script
                              writes synced values to WXT storage
                                    |
                              Content scripts + popup react
                              via existing WXT storage watchers
```

### Key Insight

The extension's content scripts already watch WXT storage items for live preference changes. So **only the background script needs to write to WXT storage** when server preferences arrive — all tabs react automatically via the existing watcher infrastructure. No content script changes needed for preference sync.

---

## Settings Split

| Setting | Storage Key | Synced to Server | Local-Only | Notes |
|---------|-------------|:---:|:---:|-------|
| Feed mode | `local:feedMode` | Yes | | `'comfort'` or `'compact'` |
| Feed position | `local:feedPosition` | Yes | | `'top'` or `'bottom'` |
| Feed behavior | `local:feedBehavior` | Yes | | `'overlay'` or `'push'` |
| Feed enabled | `local:feedEnabled` | Yes | | Global on/off toggle |
| Active categories | `local:activeFeedTabs` | Yes | | `['finance']`, `['sports']`, or both |
| Allowed sites | `local:enabledSites` | Yes | | URL wildcard patterns (empty = all) |
| Blocked sites | `local:disabledSites` | Yes | | URL wildcard patterns |
| Feed height | `local:feedHeight` | | Yes | Per-device UI state (px) |
| Feed collapsed | `local:feedCollapsed` | | Yes | Per-device UI state |
| Auth tokens | `local:authToken`, etc. | | Yes | Never leave the device |

---

## Phase 1: Backend (Go API + PostgreSQL)

### 1a. Database Table

Create a `user_preferences` table. This should be created programmatically on API startup (consistent with the existing pattern — no migration framework).

**Location**: `api/database.go` — add to the existing table creation logic.

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
    logto_sub      TEXT PRIMARY KEY,
    feed_mode      TEXT NOT NULL DEFAULT 'comfort',
    feed_position  TEXT NOT NULL DEFAULT 'bottom',
    feed_behavior  TEXT NOT NULL DEFAULT 'overlay',
    feed_enabled   BOOLEAN NOT NULL DEFAULT true,
    active_tabs    JSONB NOT NULL DEFAULT '["finance","sports"]',
    enabled_sites  JSONB NOT NULL DEFAULT '[]',
    disabled_sites JSONB NOT NULL DEFAULT '[]',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Keyed by `logto_sub` (the Logto user ID, already extracted from the JWT in `auth.go`)
- JSONB columns for array fields (`active_tabs`, `enabled_sites`, `disabled_sites`)
- `updated_at` for conflict resolution and display purposes
- Defaults match the extension's current WXT storage defaults

### 1b. Go Structs

**Location**: `api/models.go` or a new `api/preferences.go`

```go
type UserPreferences struct {
    LogtoSub      string   `json:"-"` // from JWT, never exposed
    FeedMode      string   `json:"feed_mode"`
    FeedPosition  string   `json:"feed_position"`
    FeedBehavior  string   `json:"feed_behavior"`
    FeedEnabled   bool     `json:"feed_enabled"`
    ActiveTabs    []string `json:"active_tabs"`
    EnabledSites  []string `json:"enabled_sites"`
    DisabledSites []string `json:"disabled_sites"`
    UpdatedAt     string   `json:"updated_at"`
}
```

### 1c. API Endpoints

**Location**: `api/main.go` (route registration) + `api/preferences.go` (handlers)

| Method | Path | Auth | Request Body | Response |
|--------|------|------|-------------|----------|
| `GET` | `/users/me/preferences` | LogtoAuth | — | `UserPreferences` JSON |
| `PUT` | `/users/me/preferences` | LogtoAuth | Partial `UserPreferences` JSON | Updated `UserPreferences` JSON |

**GET /users/me/preferences**:
1. Extract `logto_sub` from JWT (already available via existing auth middleware)
2. `SELECT * FROM user_preferences WHERE logto_sub = $1`
3. If no row exists, `INSERT` a row with all defaults and return it
4. Return the preferences as JSON

**PUT /users/me/preferences**:
1. Extract `logto_sub` from JWT
2. Parse request body (partial update — only provided fields are changed)
3. Validate values:
   - `feed_mode` must be `'comfort'` or `'compact'`
   - `feed_position` must be `'top'` or `'bottom'`
   - `feed_behavior` must be `'overlay'` or `'push'`
   - `feed_enabled` must be boolean
   - `active_tabs` must be subset of `['finance', 'sports']`
   - `enabled_sites` and `disabled_sites` must be string arrays
4. `INSERT ... ON CONFLICT (logto_sub) DO UPDATE SET ... , updated_at = now()`
5. Return the full updated preferences row

**Route registration** (add to protected group in `main.go`):
```go
api.Get("/users/me/preferences", HandleGetPreferences)
api.Put("/users/me/preferences", HandleUpdatePreferences)
```

### 1d. Include Preferences in Dashboard Response

**Location**: `api/main.go` — `HandleDashboard` handler

Currently `GET /dashboard` returns `{ finance: [], sports: [] }`. Extend it to include preferences:

```go
type DashboardResponse struct {
    Finance     []Trade          `json:"finance"`
    Sports      []Game           `json:"sports"`
    Preferences *UserPreferences `json:"preferences,omitempty"`
}
```

This way, when the extension fetches the dashboard on login, it gets preferences in the same request — no extra round trip needed.

---

## Phase 2: Sequin CDC Configuration

### 2a. Add Table to Sequin

In the Sequin dashboard (or via Sequin's API/config):
1. Add `user_preferences` to the list of tracked tables
2. Sequin will start sending CDC records to `POST /webhooks/sequin` for inserts, updates, and deletes on this table

### 2b. CDC Record Format

The CDC records for `user_preferences` will arrive in the same format as trades/games:

```json
{
  "action": "update",
  "metadata": {
    "table_name": "user_preferences"
  },
  "record": {
    "logto_sub": "abc123",
    "feed_mode": "compact",
    "feed_position": "top",
    ...
  },
  "changes": { ... }
}
```

### 2c. Go API Webhook Handler

**Location**: `api/handlers_webhook.go`

The existing `HandleSequinWebhook` already receives CDC records and publishes them to Redis Pub/Sub. The `user_preferences` records will flow through the same pipeline automatically — the webhook handler publishes all CDC records to the `events:broadcast` channel regardless of table name. **No changes needed here.**

The SSE hub will broadcast these records to all connected clients. Filtering (only applying preferences for the current user) happens on the client side (extension background script).

---

## Phase 3: Frontend — Dashboard Settings UI

### 3a. Preferences API Client

**Location**: `myscrollr.com/src/api/client.ts`

Add new functions:

```ts
export async function getPreferences(getToken: () => Promise<string | undefined>): Promise<UserPreferences> {
  return authenticatedFetch<UserPreferences>('/users/me/preferences', getToken);
}

export async function updatePreferences(
  getToken: () => Promise<string | undefined>,
  prefs: Partial<UserPreferences>,
): Promise<UserPreferences> {
  return authenticatedFetch<UserPreferences>('/users/me/preferences', getToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
}
```

### 3b. TypeScript Types

**Location**: `myscrollr.com/src/types/` or alongside the API client

```ts
export interface UserPreferences {
  feed_mode: 'comfort' | 'compact';
  feed_position: 'top' | 'bottom';
  feed_behavior: 'overlay' | 'push';
  feed_enabled: boolean;
  active_tabs: ('finance' | 'sports')[];
  enabled_sites: string[];
  disabled_sites: string[];
  updated_at: string;
}
```

### 3c. Settings Panel on Dashboard

**Location**: `myscrollr.com/src/routes/dashboard.tsx` or a new component

Wire up the existing Settings2 icon button (line ~266 of `dashboard.tsx`) to open a settings panel/modal/sidebar. The panel should contain controls for:

| Setting | Control Type |
|---------|-------------|
| Feed Enabled | Toggle switch |
| Display Mode | Segmented control: Comfort / Compact |
| Position | Segmented control: Bottom / Top |
| Behavior | Segmented control: Overlay / Push Content |
| Active Categories | Toggle buttons: Finance, Sports |
| Allowed Sites | Text input list with add/remove |
| Blocked Sites | Text input list with add/remove |

**Behavior**:
- On panel open: `GET /users/me/preferences` to load current values
- On any change: `PUT /users/me/preferences` with the updated field(s)
- Optimistic UI: update local state immediately, revert on API error
- Changes propagate to the extension via Sequin CDC -> SSE -> background script

### 3d. Real-Time Preference Updates via useRealtime

**Location**: `myscrollr.com/src/hooks/useRealtime.ts`

Add a handler for `user_preferences` CDC records in the SSE message processing:

```ts
case 'user_preferences': {
  // Only apply if this is the current user's preferences
  if (record.logto_sub === currentUserSub) {
    // Update local preferences state
    setPreferences(record);
  }
  break;
}
```

This enables real-time sync if the user has multiple browser tabs open on `myscrollr.com` — changing settings in one tab instantly updates the other.

---

## Phase 4: Extension — Preference Sync

### 4a. Types Update

**Location**: `extension/utils/types.ts`

Add the `UserPreferences` type (matching the API response):

```ts
export interface UserPreferences {
  feed_mode: FeedMode;
  feed_position: FeedPosition;
  feed_behavior: FeedBehavior;
  feed_enabled: boolean;
  active_tabs: FeedCategory[];
  enabled_sites: string[];
  disabled_sites: string[];
  updated_at: string;
}
```

Update `DashboardResponse` to include preferences:

```ts
export interface DashboardResponse {
  finance: Trade[];
  sports: Game[];
  preferences?: UserPreferences;
}
```

### 4b. Background — Apply Preferences to WXT Storage

**Location**: `extension/entrypoints/background/sse.ts` or a new `preferences.ts` helper

Create a helper that writes server preferences into WXT storage:

```ts
import {
  feedMode, feedPosition, feedBehavior, feedEnabled,
  activeFeedTabs, enabledSites, disabledSites,
} from '~/utils/storage';

export async function applyServerPreferences(prefs: UserPreferences): Promise<void> {
  await Promise.all([
    feedMode.setValue(prefs.feed_mode),
    feedPosition.setValue(prefs.feed_position),
    feedBehavior.setValue(prefs.feed_behavior),
    feedEnabled.setValue(prefs.feed_enabled),
    activeFeedTabs.setValue(prefs.active_tabs),
    enabledSites.setValue(prefs.enabled_sites),
    disabledSites.setValue(prefs.disabled_sites),
  ]);
}
```

### 4c. Background — Sync on Login

**Location**: `extension/entrypoints/background/messaging.ts`

In the `LOGIN` message handler, after fetching dashboard data, apply preferences:

```ts
case 'LOGIN': {
  await login();
  const authed = await isAuthenticated();
  broadcast({ type: 'AUTH_STATUS', authenticated: authed });

  if (authed) {
    const dashboard = await fetchDashboardData();
    if (dashboard) {
      mergeDashboardData(dashboard.finance ?? [], dashboard.sports ?? []);
      broadcast({ type: 'INITIAL_DATA', payload: dashboard });

      // Apply server preferences to local storage
      if (dashboard.preferences) {
        await applyServerPreferences(dashboard.preferences);
      }
    }
  }
  break;
}
```

Also fetch preferences on extension startup if already authenticated (e.g., token still valid from previous session):

**Location**: `extension/entrypoints/background/index.ts`

```ts
// After startSSE() and setupMessageListeners()...
// If already authenticated, sync preferences
const authed = await isAuthenticated();
if (authed) {
  try {
    const dashboard = await fetchDashboardData();
    if (dashboard?.preferences) {
      await applyServerPreferences(dashboard.preferences);
    }
  } catch {}
}
```

### 4d. Background — Handle Preference CDC via SSE

**Location**: `extension/entrypoints/background/sse.ts`

Add `user_preferences` to the CDC routing in `processCDCRecord`:

```ts
function processCDCRecord(cdc: CDCRecord): void {
  const table = cdc.metadata.table_name;

  switch (table) {
    case 'trades':
      // ... existing logic
      break;
    case 'games':
      // ... existing logic
      break;
    case 'user_preferences':
      // Only apply if this is the current user's preferences
      if (cdc.action === 'insert' || cdc.action === 'update') {
        handlePreferenceUpdate(cdc.record);
      }
      break;
    default:
      break;
  }
}
```

The `handlePreferenceUpdate` function needs to:
1. Get the current user's `logto_sub` (from the JWT or stored separately)
2. Compare with `cdc.record.logto_sub`
3. If they match, call `applyServerPreferences(cdc.record)`

**Important**: The extension needs to know the current user's `logto_sub` to filter CDC records. Options:
- Decode the JWT access token to extract the `sub` claim (JWTs are base64, no crypto needed for reading)
- Store the `sub` in WXT storage during login
- The simplest approach: add a new storage item `local:userSub` that gets set during the login flow after token exchange

### 4e. Store User Sub on Login

**Location**: `extension/utils/storage.ts`

```ts
export const userSub = storage.defineItem<string | null>('local:userSub', {
  fallback: null,
  version: 1,
});
```

**Location**: `extension/entrypoints/background/auth.ts`

After successful token exchange in `doLogin()`, decode the access token to extract `sub`:

```ts
// After storing tokens...
// Decode JWT payload (no verification needed, just reading)
const payload = JSON.parse(atob(data.access_token.split('.')[1]));
await userSub.setValue(payload.sub);
```

And clear it on logout:

```ts
export async function logout(): Promise<void> {
  await authToken.setValue(null);
  await authTokenExpiry.setValue(null);
  await authRefreshToken.setValue(null);
  await userSub.setValue(null);
}
```

### 4f. Popup — Write Preferences to API

**Location**: `extension/entrypoints/popup/App.tsx`

The popup currently has quick toggles that write directly to WXT storage. Update them to also sync to the server:

```ts
async function updatePreference(key: string, value: any) {
  // Write locally for instant effect (storage watchers propagate to all tabs)
  // Also PUT to server for persistence + cross-device sync
  const token = await getValidToken();
  if (token) {
    fetch(`${API_URL}/users/me/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {}); // Fire and forget — local state is already updated
  }
}
```

This way the popup's quick toggles work instantly (via WXT storage) and also persist to the server. If the API call fails, the local change still works — it just won't sync to other devices until the next change.

### 4g. Remove Options Entrypoint

Delete the following:
- `extension/entrypoints/options/` directory (4 files: `index.html`, `main.tsx`, `App.tsx`, `style.css`)

Update the popup's "Settings" link to open the dashboard:

```ts
// Before:
browser.runtime.openOptionsPage();

// After:
browser.tabs.create({ url: 'https://myscrollr.com/dashboard' });
// Or if you have the frontend URL in constants:
browser.tabs.create({ url: `${FRONTEND_URL}/dashboard` });
```

**Note**: You may want to add `FRONTEND_URL` to `extension/utils/constants.ts`:

```ts
export const FRONTEND_URL = 'https://myscrollr.com';
```

---

## Phase 5: Popup Quick Toggles (Bidirectional Sync)

The popup should remain a lightweight control surface. Keep these quick toggles:

| Toggle | Local Effect | Server Sync |
|--------|-------------|-------------|
| Feed ON/OFF | Write `feedEnabled` storage | `PUT { feed_enabled }` |
| Mode: Comfort/Compact | Write `feedMode` storage | `PUT { feed_mode }` |
| Position: Top/Bottom | Write `feedPosition` storage | `PUT { feed_position }` |
| Behavior: Overlay/Push | Write `feedBehavior` storage | `PUT { feed_behavior }` |

Pattern: write locally first (instant), then fire-and-forget PUT to server.

---

## Implementation Order

### Step 1: Go API (backend)
1. Add `user_preferences` table creation to `database.go`
2. Add `UserPreferences` struct to `models.go`
3. Create `preferences.go` with `HandleGetPreferences` and `HandleUpdatePreferences`
4. Register routes in `main.go`
5. Update `DashboardResponse` to include `preferences`
6. Update `HandleDashboard` to fetch and include preferences

### Step 2: Sequin Configuration
1. Add `user_preferences` to Sequin's tracked tables
2. Verify CDC records flow through the webhook -> SSE pipeline

### Step 3: Extension Sync (background)
1. Add `UserPreferences` type and update `DashboardResponse` in `utils/types.ts`
2. Add `userSub` storage item to `utils/storage.ts`
3. Create `applyServerPreferences` helper
4. Update `auth.ts` to store/clear `userSub`
5. Update `sse.ts` to handle `user_preferences` CDC records
6. Update `messaging.ts` LOGIN handler to apply preferences from dashboard
7. Update `index.ts` to sync preferences on startup if already authenticated

### Step 4: Remove Extension Options Page
1. Delete `entrypoints/options/` directory
2. Update popup "Settings" link to open `myscrollr.com/dashboard`
3. Add `FRONTEND_URL` constant

### Step 5: Update Popup for Server Sync
1. Add `updatePreference` helper that writes locally + PUTs to API
2. Update all toggle handlers to use it

### Step 6: Frontend Settings UI
1. Add preference types and API client functions
2. Add `user_preferences` CDC handling to `useRealtime.ts`
3. Wire up Settings2 button on dashboard to open settings panel
4. Build settings panel component with all preference controls
5. Connect controls to `GET`/`PUT` preference endpoints

---

## Edge Cases & Considerations

### First-Time Users
When `GET /users/me/preferences` finds no row, the API creates one with defaults and returns it. The defaults match the extension's current WXT storage defaults, so there's no jarring change.

### Offline / Logged-Out Fallback
Local WXT storage values persist regardless of server state. If the user is offline or logged out, the extension uses the last-known values. On next login, server preferences overwrite local values (server wins).

### Conflict Resolution
**Server wins.** When preferences arrive via CDC or API fetch, they overwrite local WXT storage. This is simple and predictable. The popup's fire-and-forget PUT ensures local changes reach the server quickly.

### Multiple Devices
User logs in on Device A and Device B. Changes on Device A -> PUT to server -> CDC -> SSE -> Device B background receives and applies. Both devices stay in sync via the SSE stream.

### Race Conditions
If the user rapidly toggles settings in the popup, multiple PUTs may be in flight. The server always applies the latest `updated_at` write. Since we're doing full-field updates (not increments), the last write wins, which is the correct behavior for user preferences.

### Content Script Changes
**None required.** Content scripts already watch WXT storage items and react to changes. Whether the change comes from the popup, the options page, or the background syncing server preferences — the content scripts don't care about the source. They just see the storage value change and re-render.

### SSE Privacy
CDC records for `user_preferences` will be broadcast to ALL SSE clients (the SSE endpoint is public). The background script filters by `logto_sub` to only apply its own user's preferences. Other users' preference changes are silently ignored. This is acceptable because:
- Preference data is not sensitive (mode, position, etc.)
- The `logto_sub` is an opaque ID, not PII
- If this becomes a concern later, the Go API could filter CDC records per-user before publishing to SSE (but this adds significant complexity)
