# Scrollr Browser Extension — Implementation Spec

## Overview

Scrollr is a cross-browser extension that injects a real-time data feed bar into web pages. It connects to the myscrollr backend infrastructure (Rust ingestion → Postgres → Sequin → Go API → Redis → SSE) and displays live financial trades and sports scores in a configurable, resizable bar.

**Target browsers:** Chrome, Firefox, Edge, Safari, and any Chromium-based browser (Brave, Opera, Vivaldi, etc.)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser Extension                           │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  Popup   │   │   Options    │   │   Content Script (per   │ │
│  │ (React)  │   │   (React)    │   │   tab, injected UI)     │ │
│  │          │   │              │   │                         │ │
│  │ • Status │   │ • Site list  │   │ • Shadow Root container │ │
│  │ • Mode   │   │ • Auth/login │   │ • Real-time feed bar    │ │
│  │ • Quick  │   │ • Position   │   │ • Trades + Games +      │ │
│  │   toggle │   │ • Appearance │   │   Yahoo (tabs/filters)  │ │
│  └────┬─────┘   └──────┬──────┘   └──────────┬──────────────┘ │
│       │                │                      │                 │
│       └────────────────┼──────────────────────┘                 │
│                        │ chrome.runtime messaging               │
│                   ┌────┴─────┐                                  │
│                   │Background│                                  │
│                   │ (Service │                                  │
│                   │  Worker) │                                  │
│                   │          │                                  │
│                   │ • SSE    │──── EventSource ──→ GET /events  │
│                   │ • State  │                    (public, no   │
│                   │ • Auth   │──── fetch ────────→ GET /dashboard│
│                   │   tokens │                    (Logto JWT)   │
│                   └──────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Content Script UI** | Shadow Root (`createShadowRootUi`) | CSS isolation is critical since we inject onto arbitrary user sites. Tailwind styles won't leak or be affected. |
| **SSE Connection** | Background service worker | Replaces SharedWorker (not available in extensions). Single SSE connection shared across all tabs via `chrome.runtime` messaging. |
| **Auth** | Logto JWT via `browser.identity.launchWebAuthFlow` | `/events` is public (no auth needed for SSE). `/dashboard` initial load needs auth. Background script handles token storage + authenticated fetches (bypasses CORS). |
| **Styling** | Tailwind CSS + `postcss-rem-to-px` | Shadow root breaks `rem` units. PostCSS plugin converts to `px` at build time. |
| **State broadcast** | `chrome.runtime.onMessage` | Background broadcasts SSE updates to all content scripts and popup. Content scripts maintain local React state. |
| **Persistence** | `wxt/storage` (extension storage API) | User preferences (position, size, mode, enabled sites) persisted via `storage.defineItem` with versioning. |
| **Feed bar behavior** | User-configurable: overlay vs push | Overlay floats on top of page content. Push adjusts page margin to make room. User chooses in popup or options. |

---

## Data Flow

### Real-Time Updates (SSE)

1. Sequin CDC detects DB changes → POSTs to `POST /webhooks/sequin`
2. Go API publishes to Redis channel `events:broadcast`
3. Go API's Hub fans out to all SSE clients
4. Extension background service worker receives via `EventSource` at `GET /events`
5. Background parses JSON, upserts into in-memory state, broadcasts to content scripts/popup
6. Content script React UI re-renders with new data

### SSE Event Format

```
data: {"data":[{"action":"update","changes":{...},"metadata":{"table_name":"trades"},"record":{...}}]}
```

- No named event types — all messages use the default `message` event
- Heartbeat: `: ping` comments every 15 seconds (EventSource swallows these)
- First message: `retry: 3000` (reconnect hint from server)

### Initial Data Load (Authenticated)

1. User logs in via `browser.identity.launchWebAuthFlow` → Logto
2. Background exchanges auth code for JWT access token
3. Background fetches `GET /dashboard` with `Authorization: Bearer <token>`
4. Response: `{ finance: Trade[], sports: Game[] }`
5. Background merges into state and broadcasts to all tabs

---

## Data Models

### Trade (Finance)

```typescript
interface Trade {
  id?: number;
  symbol: string;                // e.g. "AAPL"
  price: number | string;
  previous_close?: number;
  price_change?: number | string;
  percentage_change?: number | string;
  direction?: 'up' | 'down';
  last_updated?: string;         // ISO timestamp
}
```

### Game (Sports)

```typescript
interface Game {
  id: number | string;
  league: string;                // e.g. "nfl", "nba"
  external_game_id: string;
  link: string;
  home_team_name: string;
  home_team_logo: string;
  home_team_score: number | string;
  away_team_name: string;
  away_team_logo: string;
  away_team_score: number | string;
  start_time: string;            // ISO timestamp
  short_detail?: string;         // e.g. "Q4 2:30"
  state?: string;                // e.g. "in_progress", "final", "pre"
  created_at?: string;
  updated_at?: string;
}
```

### DashboardResponse (Aggregated)

```typescript
interface DashboardResponse {
  finance: Trade[];
  sports: Game[];
}
```

### CDC Record (SSE Payload)

```typescript
interface CDCRecord {
  action: 'insert' | 'update' | 'delete';
  changes: Record<string, any>;
  metadata: { table_name: string };
  record: Record<string, any>;
}

interface SSEPayload {
  data: CDCRecord[];
}
```

---

## Project Structure

```
scrollr/
├── entrypoints/
│   ├── background/
│   │   ├── index.ts              # Background service worker entry
│   │   ├── sse.ts                # SSE connection manager (reconnect logic)
│   │   ├── auth.ts               # Logto token management
│   │   └── messaging.ts          # Message router (content ↔ background ↔ popup)
│   │
│   ├── popup/
│   │   ├── index.html            # Popup shell
│   │   ├── main.tsx              # React mount
│   │   ├── App.tsx               # Popup root (status, toggles, mode selector)
│   │   └── style.css             # Tailwind entry
│   │
│   ├── options/
│   │   ├── index.html            # Options shell
│   │   ├── main.tsx              # React mount
│   │   ├── App.tsx               # Options root (site management, auth, appearance)
│   │   └── style.css             # Tailwind entry
│   │
│   └── scrollbar.content/
│       ├── index.tsx             # Content script entry + Shadow Root UI mount
│       ├── App.tsx               # Feed bar root component
│       ├── FeedBar.tsx           # Resizable bar container (top/bottom position)
│       ├── TradeItem.tsx         # Single trade ticker item
│       ├── GameItem.tsx          # Single game score item
│       ├── FeedTabs.tsx          # Tab switcher (Finance / Sports / Yahoo)
│       └── style.css             # Tailwind + custom styles
│
├── components/                   # Shared UI components (auto-imported)
│   ├── ConnectionStatus.tsx      # SSE status indicator
│   └── Toggle.tsx                # Reusable toggle switch
│
├── utils/                        # Shared utilities (auto-imported)
│   ├── storage.ts                # All storage.defineItem declarations
│   ├── types.ts                  # Trade, Game, DashboardResponse, etc.
│   ├── messaging.ts              # Type-safe message definitions
│   └── constants.ts              # API URLs, defaults
│
├── assets/
│   └── icon.png                  # Extension icon (for @wxt-dev/auto-icons)
│
├── public/
│   └── (static assets)
│
├── wxt.config.ts                 # WXT config
├── tailwind.config.ts            # Tailwind config
├── postcss.config.ts             # PostCSS (rem-to-px plugin)
├── tsconfig.json
├── package.json
└── SPEC.md                       # This file
```

---

## Storage Schema

All user preferences are persisted via `storage.defineItem` with versioning for future-proofing.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `local:feedPosition` | `'top' \| 'bottom'` | `'bottom'` | Feed bar position |
| `local:feedHeight` | `number` | `200` | Feed bar height in pixels |
| `local:feedMode` | `'comfort' \| 'compact'` | `'comfort'` | Display density |
| `local:feedCollapsed` | `boolean` | `false` | Collapsed state |
| `local:feedBehavior` | `'overlay' \| 'push'` | `'overlay'` | Overlay on top of page or push page content |
| `local:enabledSites` | `string[]` | `[]` | URL patterns to show feed on (empty = all sites) |
| `local:disabledSites` | `string[]` | `[]` | URL patterns to exclude |
| `local:feedEnabled` | `boolean` | `true` | Global on/off toggle |
| `local:activeFeedTabs` | `string[]` | `['finance', 'sports']` | Active feed categories |
| `local:authToken` | `string \| null` | `null` | Logto JWT access token |
| `local:authTokenExpiry` | `number \| null` | `null` | Token expiry timestamp |

---

## Messaging Protocol

### Background → Content Scripts / Popup

```typescript
type BackgroundMessage =
  | { type: 'STREAM_DATA'; payload: SSEPayload }
  | { type: 'CONNECTION_STATUS'; status: 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'INITIAL_DATA'; payload: DashboardResponse }
  | { type: 'AUTH_STATUS'; authenticated: boolean }
  | { type: 'STATE_SNAPSHOT'; trades: Trade[]; games: Game[];
      connectionStatus: string; authenticated: boolean };
```

### Content Script / Popup → Background

```typescript
type ClientMessage =
  | { type: 'GET_STATE' }          // Request full state snapshot
  | { type: 'REQUEST_STATUS' }     // Request connection status only
  | { type: 'REQUEST_INITIAL_DATA' } // Trigger authenticated /dashboard fetch
  | { type: 'LOGIN' }              // Trigger Logto OAuth flow
  | { type: 'LOGOUT' };            // Clear tokens
```

### Message Routing

| Incoming Message | Background Action |
|---|---|
| `GET_STATE` | Reply with `STATE_SNAPSHOT` (current trades, games, connection status, auth status) |
| `REQUEST_INITIAL_DATA` | Fetch `GET /dashboard` with auth token, reply with `INITIAL_DATA` |
| `LOGIN` | Trigger `launchWebAuthFlow`, reply with `AUTH_STATUS` |
| `LOGOUT` | Clear stored tokens, reply with `AUTH_STATUS` |
| `REQUEST_STATUS` | Reply with current `CONNECTION_STATUS` |

### Broadcasting

When new SSE data arrives, background uses:
- `browser.runtime.sendMessage()` to push to popup
- `browser.tabs.sendMessage()` to push to all tabs with active content scripts

---

## Authentication

### Provider

[Logto](https://logto.io/) — self-hosted OIDC provider.

- **Endpoint:** `https://auth.myscrollr.relentnet.dev/`
- **App ID:** `ogbulfshvf934eeli4t9u`
- **Resource/Audience:** `https://api.myscrollr.relentnet.dev`

### Extension OAuth Flow

1. Build authorization URL with PKCE:
   - `client_id`: Logto app ID
   - `redirect_uri`: `browser.identity.getRedirectURL()` (auto-generated per extension)
   - `response_type`: `code`
   - `scope`: `openid profile email`
   - `resource`: API URL
   - `code_challenge` + `code_challenge_method`: S256
2. Call `browser.identity.launchWebAuthFlow({ url, interactive: true })`
3. Extract `code` from redirect URL
4. Exchange code for tokens at Logto's token endpoint
5. Store access token + expiry in extension storage
6. Provide `getAuthToken()` function that checks expiry and refreshes if needed

### Setup Requirement

The extension's redirect URI (`https://<extension-id>.chromiumapp.org/`) must be registered in Logto as a valid redirect URI. This is a one-time configuration step per browser.

### API Endpoints

| Endpoint | Auth Required | Purpose |
|----------|---------------|---------|
| `GET /events` | No | SSE stream (public) |
| `GET /dashboard` | Yes (JWT Bearer) | Initial data load |
| `GET /sports` | Yes | Sports data only |
| `GET /finance` | Yes | Finance data only |
| `GET /health` | No | Health check |

---

## Background Service Worker Details

### SSE Connection Manager

Adapts the existing SharedWorker pattern from `myscrollr.com/src/workers/sse-worker.ts`:

- Opens `EventSource` to `GET /events` (no auth needed)
- Exponential backoff reconnection: 1s base, 30s max (mirrors existing SharedWorker logic)
- Parses incoming JSON payloads
- Routes by `metadata.table_name`:
  - `trades` → upsert into `Trade[]` by `symbol`
  - `games` → upsert into `Game[]` by `id`
- Caps arrays at 50 items (matches existing code)

### MV3 Service Worker Keepalive

Chrome can terminate idle service workers after ~30s of inactivity. Mitigations:

- The SSE connection itself keeps the worker alive while data is flowing
- Use `chrome.alarms.create('keepalive', { periodInMinutes: 0.5 })` as a safety net
- On alarm, check if SSE is connected; if not, reconnect
- WXT handles MV2 (Firefox) vs MV3 (Chrome) differences automatically — in MV2 the background is a persistent page, so this isn't a concern

---

## Content Script — Feed Bar UI

### Shadow Root Setup

- Uses `createShadowRootUi` from WXT for full CSS isolation
- `cssInjectionMode: 'ui'` — Tailwind CSS injected into the shadow root
- `postcss-rem-to-px` converts all `rem` units to `px` at build time (shadow root breaks `rem`)
- `position: 'overlay'` — positioned via CSS, not inline in the DOM

### Site Filtering

```
1. Check global feedEnabled toggle
2. Check if URL matches any disabledSites pattern → hide
3. If enabledSites is empty → show everywhere
4. Check if URL matches any enabledSites pattern → show
5. Otherwise → hide
```

### Component Tree

```
<App>
  <FeedBar position={top|bottom} height={px} behavior={overlay|push}>
    <DragHandle />           ← Resize handle (drag to change height)
    <FeedHeader>
      <FeedTabs />           ← Finance | Sports | Yahoo
      <ConnectionStatus />   ← Green/yellow/red dot
      <CollapseToggle />     ← Minimize/expand
    </FeedHeader>
    <FeedContent mode={comfort|compact}>
      <TradeItem />          ← Repeating: symbol, price, change, direction arrow
      <GameItem />           ← Repeating: logos, teams, scores, status
    </FeedContent>
  </FeedBar>
</App>
```

### Feed Item Layouts

#### TradeItem — Comfort Mode

```
┌──────────────────────────────────────┐
│ AAPL          $189.84    ▲ +1.23%   │
│ Apple Inc     prev: $188.61          │
└──────────────────────────────────────┘
```

#### TradeItem — Compact Mode

```
┌──────────────────────────────┐
│ AAPL $189.84 ▲+1.23%        │
└──────────────────────────────┘
```

#### GameItem — Comfort Mode

```
┌──────────────────────────────────────┐
│ [logo] Lakers    112                 │
│ [logo] Celtics   108     Q4 2:30    │
└──────────────────────────────────────┘
```

#### GameItem — Compact Mode

```
┌──────────────────────────────────────┐
│ [logo] LAL 112 - BOS 108 [logo] Q4  │
└──────────────────────────────────────┘
```

### Feed Bar CSS Positioning

- `position: fixed; left: 0; right: 0;`
- `bottom: 0` or `top: 0` based on `feedPosition` setting
- Height controlled by stored `feedHeight` value
- `z-index: 2147483647` (max, standard for extension overlays)
- **Overlay mode:** floats on top, no page adjustment
- **Push mode:** adjusts `document.body.style.marginBottom` (or `marginTop`) to make room

### State Management

- On mount: send `GET_STATE` to background, receive snapshot
- `browser.runtime.onMessage` listener: receive `STREAM_DATA`, `CONNECTION_STATUS` updates
- Local React state: `trades[]`, `games[]`, `connectionStatus`, `activeTab`
- Storage watchers: listen for preference changes (position, height, mode) so they sync across tabs instantly

---

## Popup UI

Small, focused control panel (~350px wide).

```
┌─────────────────────────────┐
│  Scrollr              [●]   │  ← Title + connection indicator
├─────────────────────────────┤
│                             │
│  Feed:     [ON / OFF]       │  ← Global toggle
│  Mode:     [Comfort ▾]     │  ← Dropdown: comfort / compact
│  Position: [Bottom ▾]      │  ← Dropdown: top / bottom
│  Behavior: [Overlay ▾]     │  ← Dropdown: overlay / push
│                             │
├─────────────────────────────┤
│  This site: [Enabled ▾]    │  ← Per-site override for current tab
├─────────────────────────────┤
│  [Sign In]  or  [Username]  │  ← Auth status + login button
│  [⚙ Options]               │  ← Opens options page
└─────────────────────────────┘
```

---

## Options Page

Full settings page, opens in a new tab.

### Sections

1. **Account** — Logto login/logout, display username/email
2. **Appearance** — Mode (comfort/compact), position (top/bottom), behavior (overlay/push), default height
3. **Sites** — Manage enabled/disabled site patterns (add, remove, import/export)
4. **Feed** — Which categories are active (finance, sports, yahoo), auto-scroll behavior
5. **About** — Version, links to myscrollr.com, support

---

## Browser Compatibility

| Browser | Manifest Version | Notes |
|---------|-----------------|-------|
| Chrome | MV3 | Primary target, service worker background |
| Firefox | MV2 | WXT auto-targets MV2 for Firefox, background page instead of service worker |
| Edge | MV3 | Same build as Chrome |
| Safari | MV2 | Requires `xcrun safari-web-extension-converter` post-build step |
| Brave / Opera / Vivaldi | MV3 | Same as Chrome build |

### Specific Concerns

| Concern | Solution |
|---------|----------|
| MV2 vs MV3 background | WXT auto-converts. Background code uses `browser.*` APIs from `wxt/browser` which work everywhere. |
| `browser.identity` on Firefox | Firefox uses a different redirect URL scheme. The Logto redirect URI registration needs both Chrome and Firefox patterns. |
| Safari | Requires post-build `xcrun safari-web-extension-converter` step. `browser.identity` has limited support — may need to fall back to tab-based auth for Safari. |
| Service worker termination (MV3) | `chrome.alarms` keepalive every 30s. On wake, check SSE connection and reconnect if needed. |
| `EventSource` in service worker | Available in Chrome MV3 service workers. For Firefox MV2 (background page), works normally. |

---

## Constants

```typescript
const API_URL = 'https://api.myscrollr.relentnet.dev';
const SSE_URL = `${API_URL}/events`;
const LOGTO_ENDPOINT = 'https://auth.myscrollr.relentnet.dev';
const LOGTO_APP_ID = 'kq298uwwusrvw8m6yn6b4'; // Logto Native app type
const LOGTO_RESOURCE = API_URL;
const MAX_ITEMS = 50;

const SSE_RECONNECT_BASE = 1000;   // 1 second
const SSE_RECONNECT_MAX = 30000;   // 30 seconds
```

---

## Dependencies

### Runtime

- `react` / `react-dom` (v19)
- `lucide-react` — icons (matches existing frontend)
- `clsx` — conditional class names

### Dev / Build

- `wxt` — extension framework
- `@wxt-dev/module-react` — React integration
- `tailwindcss` / `@tailwindcss/vite` — Tailwind CSS v4
- `postcss-rem-to-px` — Shadow Root `rem` fix
- `typescript`

---

## Build Order

```
Step  1: wxt.config.ts + package.json + Tailwind + PostCSS setup
Step  2: utils/ — types.ts, constants.ts, storage.ts, messaging.ts
Step  3: entrypoints/background/ — SSE + messaging (no auth yet)
Step  4: entrypoints/scrollbar.content/ — Shadow Root mount + basic feed bar
Step  5: Wire up: background broadcasts → content script receives + renders
Step  6: entrypoints/popup/ — Controls + toggles
Step  7: Storage persistence — all preferences read/written
Step  8: Auth — Logto flow in background, login UI in popup/options
Step  9: entrypoints/options/ — Full settings page
Step 10: Feed items — TradeItem, GameItem with comfort/compact modes
Step 11: Resizable bar — drag handle + height persistence
Step 12: Site filtering — enable/disable per site
Step 13: Push mode — adjusts page margin when bar is shown
Step 14: Multi-browser testing + fixes
Step 15: Polish — animations, keyboard shortcuts, error states
```

---

## Phase Summary

### Phase 1 — Core (MVP)
- Project scaffolding (WXT + React + Tailwind + Shadow Root)
- Background SSE connection with reconnection logic
- Content script feed bar displaying trades and games
- Message passing between background and content scripts
- Basic popup with connection status and toggles
- Storage persistence for all preferences
- Multi-browser builds

### Phase 2 — Full Features
- Options page with full settings management
- Logto authentication flow
- Feed tabs (Finance / Sports / Yahoo categories)
- Resizable bar with drag handle
- Comfort / compact display modes

### Phase 3 — Polish
- Yahoo Fantasy integration (requires auth)
- Smooth animations for new items and bar transitions
- Keyboard shortcuts for toggling visibility
- Extension icon badge for significant events
