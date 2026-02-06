# CLAUDE.md — Browser Extension

This file provides guidance to Claude Code when working in the `extension/` directory.

This is the **Scrollr browser extension**, part of the MyScrollr monorepo. It injects a real-time financial and sports data feed bar into every webpage via a Shadow Root content script. The root `../CLAUDE.md` has full platform context (API endpoints, database schema, Rust ingestion services, frontend, deployment).

## Build Commands

```bash
npm install             # Install dependencies
npm run dev             # Dev mode (Chrome, auto-opens browser)
npm run dev:firefox     # Dev mode (Firefox)
npm run dev:edge        # Dev mode (Edge)
npm run build           # Production build for Chrome MV3
npm run build:firefox   # Production build for Firefox MV2
npm run build:edge      # Production build for Edge MV3
npm run build:safari    # Production build for Safari MV2
npm run zip             # Package for Chrome Web Store
npm run zip:firefox     # Package for Firefox Add-ons
npm run compile         # Type-check only (tsc --noEmit)
npm run postinstall     # wxt prepare (generates types in .wxt/)
```

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| WXT | v0.20 | Extension framework (file-based entrypoints, manifest generation, dev mode) |
| React | 19 | UI framework for popup, options, and content script |
| Tailwind CSS | v4 | Styling (via `@tailwindcss/vite` plugin) |
| TypeScript | 5.9 | Type safety |
| PostCSS rem-to-px | 6.0 | Converts `rem` to `px` in content script CSS (Shadow Root breaks `rem` inheritance) |
| clsx | 2.1 | Conditional CSS class joining |

## Project Structure

```
extension/
  entrypoints/
    background/                 # MV3 service worker / MV2 background page
      index.ts                  #   Entry: wires up SSE, messaging, auth, keepalive
      sse.ts                    #   SSE connection manager, CDC processing, in-memory state
      auth.ts                   #   Logto PKCE OAuth flow, token refresh, concurrency guards
      messaging.ts              #   Message handler + broadcast to all tabs/popup
    scrollbar.content/          # Content script injected on <all_urls>
      index.tsx                 #   Entry: site filtering, Shadow Root UI mount
      App.tsx                   #   Root component: state, message listeners, storage watchers
      FeedBar.tsx               #   Main container: header, tabs, scrollable content, drag-to-resize
      FeedTabs.tsx              #   Tab switcher (Finance / Sports)
      TradeItem.tsx             #   Single trade row (symbol, price, change, direction arrow)
      GameItem.tsx              #   Single game row (teams, logos, scores, status)
      ConnectionIndicator.tsx   #   Green/amber/red dot for SSE connection status
      style.css                 #   Tailwind import for Shadow Root CSS
    popup/                      # Extension popup (320px wide)
      index.html                #   HTML shell
      main.tsx                  #   React mount
      App.tsx                   #   Quick controls: toggle, mode, position, behavior, auth
      style.css                 #   Tailwind import
    options/                    # Options page (opens in new tab)
      index.html                #   HTML shell (manifest.open_in_tab = true)
      main.tsx                  #   React mount
      App.tsx                   #   Full settings: appearance, categories, site filters, account
      style.css                 #   Tailwind import
  utils/                        # Shared utilities (auto-imported by WXT)
    constants.ts                #   API_URL, SSE_URL, LOGTO_ENDPOINT, LOGTO_APP_ID, MAX_ITEMS
    types.ts                    #   Trade, Game, DashboardResponse, CDCRecord, SSEPayload, etc.
    messaging.ts                #   BackgroundMessage + ClientMessage type definitions
    storage.ts                  #   All WXT storage.defineItem declarations (12 items)
  assets/
    tailwind.css                #   Base Tailwind import
  public/
    icon/                       #   Extension icons (16, 32, 48, 96, 128 png)
  wxt.config.ts                 #   WXT config: manifest, Vite plugins, PostCSS
  tsconfig.json                 #   Extends .wxt/tsconfig.json
  SPEC.md                       #   Full implementation specification (572 lines)
```

## Architecture

### Data Flow

```
                    GET /events (public, unauthenticated)
                           |
                     EventSource (SSE)
                           |
                           v
            ┌─── Background Service Worker ───┐
            │                                  │
            │  In-memory state:                │
            │    trades: Trade[]               │
            │    games: Game[]                 │
            │    connectionStatus              │
            │    authenticated                 │
            │                                  │
            │  CDC Processing:                 │
            │    insert/update -> upsert       │
            │    delete -> remove              │
            │    cap at 50 items per category  │
            │                                  │
            │  On login:                       │
            │    GET /dashboard (authenticated)│
            │    -> merge into in-memory state │
            └──────────┬───────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   runtime.sendMessage │   tabs.sendMessage
          │            │            │
          v            v            v
       Popup      Options     Content Scripts
                   Page       (every tab)
```

### Message Passing

All UI surfaces receive data from the background via `browser.runtime.onMessage`. Content scripts and popup/options can request state via `GET_STATE`. The background responds with a `STATE_SNAPSHOT`.

## Messaging Protocol

### Background -> UI (`BackgroundMessage`)

| Type | Payload | When |
|------|---------|------|
| `STREAM_DATA` | `SSEPayload` | Raw SSE event received (rarely used by UI directly) |
| `CONNECTION_STATUS` | `ConnectionStatus` | SSE connection state changes |
| `INITIAL_DATA` | `DashboardResponse` | After authenticated `/dashboard` fetch |
| `AUTH_STATUS` | `boolean` | Login/logout/token expiry |
| `STATE_UPDATE` | `{ trades, games }` | After CDC records are processed |
| `STATE_SNAPSHOT` | `{ trades, games, connectionStatus, authenticated }` | Response to `GET_STATE` |

### UI -> Background (`ClientMessage`)

| Type | Purpose |
|------|---------|
| `GET_STATE` | Request full state snapshot |
| `REQUEST_STATUS` | Request connection status only |
| `REQUEST_INITIAL_DATA` | Trigger authenticated `/dashboard` fetch |
| `LOGIN` | Start Logto OAuth flow |
| `LOGOUT` | Clear tokens, broadcast auth status |

## Storage Schema

All items use WXT `storage.defineItem` with `local:` prefix, version 1, and explicit fallbacks.

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `local:feedPosition` | `'top' \| 'bottom'` | `'bottom'` | Feed bar position on page |
| `local:feedHeight` | `number` | `200` | Feed bar height in pixels |
| `local:feedMode` | `'comfort' \| 'compact'` | `'comfort'` | Display density |
| `local:feedCollapsed` | `boolean` | `false` | Whether feed bar is collapsed |
| `local:feedBehavior` | `'overlay' \| 'push'` | `'overlay'` | Overlay page or push content |
| `local:feedEnabled` | `boolean` | `true` | Global feed on/off toggle |
| `local:enabledSites` | `string[]` | `[]` | URL patterns to show feed (empty = all) |
| `local:disabledSites` | `string[]` | `[]` | URL patterns to hide feed |
| `local:activeFeedTabs` | `FeedCategory[]` | `['finance', 'sports']` | Active data categories |
| `local:authToken` | `string \| null` | `null` | Logto JWT access token |
| `local:authTokenExpiry` | `number \| null` | `null` | Token expiry timestamp (ms) |
| `local:authRefreshToken` | `string \| null` | `null` | Logto refresh token |

Storage watchers in the content script's `App.tsx` react to preference changes from popup/options in real-time across all tabs.

## Authentication

- **Provider**: Logto (self-hosted OIDC) at `https://auth.myscrollr.relentnet.dev`
- **App ID**: `kq298uwwusrvw8m6yn6b4` (Native app type, separate from the frontend's `ogbulfshvf934eeli4t9u`)
- **Flow**: PKCE authorization code via `browser.identity.launchWebAuthFlow`
- **Scopes**: `openid profile email offline_access`
- **Resource**: `https://api.myscrollr.relentnet.dev` (API audience)
- **Token exchange**: `POST ${LOGTO_ENDPOINT}/oidc/token`
- **Refresh**: Automatic when token expires within 60 seconds; uses `refresh_token` grant
- **Concurrency guards**: `refreshPromise` and `loginPromise` mutexes prevent duplicate requests
- **Expiry handling**: On refresh failure, clears all tokens and broadcasts `AUTH_STATUS: false`

## SSE & Real-Time Data

- **Endpoint**: `GET https://api.myscrollr.relentnet.dev/events` (public, no auth required)
- **Transport**: `EventSource` in background service worker
- **Event format**: Default `message` events with JSON body `{ data: CDCRecord[] }`
- **CDC routing**: `metadata.table_name` routes to `trades` or `games` arrays; unknown tables silently ignored
- **Operations**: `insert`/`update` -> upsert by key (`symbol` for trades, `id` for games); `delete` -> remove
- **Cap**: 50 items max per category (`MAX_ITEMS`)
- **Reconnection**: Exponential backoff starting at 1s, doubling each attempt, capped at 30s
- **MV3 keepalive**: `chrome.alarms` fires every 30 seconds; reconnects SSE if disconnected (handles service worker termination)
- **Dashboard merge**: After login, `GET /dashboard` fetches full state and merges into in-memory arrays via `mergeDashboardData()`

## Content Script UI

- **Mount method**: `createShadowRootUi` with `position: 'overlay'` — isolates CSS from the host page
- **CSS isolation**: Tailwind CSS compiled with `postcss-rem-to-responsive-pixel` converting all `rem` to `px` (Shadow Root breaks `rem` inheritance from the host page's `<html>` font-size)
- **Site filtering**: Before mounting, checks `feedEnabled`, then `disabledSites` (block list), then `enabledSites` (allow list, empty = all). Patterns support simple wildcards (`*`) converted to regex.
- **Push mode**: When `feedBehavior` is `'push'`, adjusts `document.body.style.marginTop` or `marginBottom` to make room for the feed bar
- **Drag-to-resize**: Feed bar has a drag handle; updates height in real-time with min 100px / max 600px constraints, persisted to storage
- **Tabs**: Finance and Sports tabs, filtered by `activeFeedTabs` storage item

## Browser Targets

| Browser | Manifest Version | Notes |
|---------|-----------------|-------|
| Chrome | MV3 | Primary target, service worker background |
| Firefox | MV2 | WXT auto-targets MV2 for Firefox, persistent background page |
| Edge | MV3 | Same as Chrome build |
| Safari | MV2 | Requires post-build `xcrun safari-web-extension-converter` |

## Manifest Configuration

Defined in `wxt.config.ts`:
- **Permissions**: `storage`, `identity`, `alarms`
- **Host permissions**: `https://api.myscrollr.relentnet.dev/*`, `https://auth.myscrollr.relentnet.dev/*`
- **Firefox gecko ID**: `scrollr@relentnet.dev`
- **Content scripts**: `<all_urls>`, `cssInjectionMode: 'ui'`
- **Background**: `type: 'module'`

## Development Conventions

- **Entrypoints**: WXT directory-based entrypoints. Runtime code must be inside the `main` function (or `defineBackground`/`defineContentScript` callback) — not at module top level.
- **Storage**: Always use `storage.defineItem` from `utils/storage.ts`. All items are versioned (currently v1) and use `local:` prefix. Add watchers for cross-tab reactivity.
- **Messaging**: Type-safe message protocol defined in `utils/messaging.ts`. Background is the single source of truth for state; UI surfaces are consumers.
- **Styling**: Tailwind CSS v4 with `@import 'tailwindcss'`. Content script CSS goes through rem-to-px PostCSS transform. Use `clsx` for conditional classes.
- **Auto-imports**: WXT auto-imports from `utils/`, `hooks/`, `components/` directories plus WXT APIs (`storage`, `defineContentScript`, `createShadowRootUi`, `browser`, etc.). Use `#imports` for explicit imports.
- **Type definitions**: Shared types live in `utils/types.ts`. Message types in `utils/messaging.ts`.
- **State management**: No external state library. Background holds authoritative state in module-scoped variables; React components use local `useState` hydrated from `GET_STATE` response and updated via message listeners.

## Constants

Defined in `utils/constants.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `API_URL` | `https://api.myscrollr.relentnet.dev` | Base API URL |
| `SSE_URL` | `${API_URL}/events` | SSE stream endpoint |
| `LOGTO_ENDPOINT` | `https://auth.myscrollr.relentnet.dev` | Logto OIDC server |
| `LOGTO_APP_ID` | `kq298uwwusrvw8m6yn6b4` | Extension's Logto client ID |
| `LOGTO_RESOURCE` | Same as `API_URL` | JWT audience for API access |
| `MAX_ITEMS` | `50` | Max items per category in memory |
| `SSE_RECONNECT_BASE` | `1000` | Initial reconnect delay (ms) |
| `SSE_RECONNECT_MAX` | `30000` | Max reconnect delay (ms) |

## Important Files

| File | Lines | Purpose |
|------|-------|---------|
| `entrypoints/background/index.ts` | 29 | Background entry: wires SSE, messaging, auth, keepalive |
| `entrypoints/background/sse.ts` | 196 | SSE connection manager, CDC processing, in-memory state |
| `entrypoints/background/auth.ts` | 234 | Logto PKCE flow, token refresh, concurrency guards |
| `entrypoints/background/messaging.ts` | 149 | Message handler, broadcast to tabs/popup |
| `entrypoints/scrollbar.content/index.tsx` | 62 | Content script entry: site filtering, Shadow Root mount |
| `entrypoints/scrollbar.content/App.tsx` | 154 | Content script root: state, message listeners, storage watchers |
| `entrypoints/scrollbar.content/FeedBar.tsx` | 178 | Feed container: header, tabs, content area, drag-to-resize |
| `entrypoints/options/App.tsx` | 444 | Full settings page (largest file in the project) |
| `entrypoints/popup/App.tsx` | 196 | Quick controls popup |
| `utils/storage.ts` | 80 | All 12 WXT storage item definitions |
| `utils/messaging.ts` | 81 | Type-safe message protocol definitions |
| `utils/types.ts` | 64 | Shared type definitions (Trade, Game, CDC, etc.) |
| `utils/constants.ts` | 16 | API URLs, Logto config, limits, timing constants |
| `wxt.config.ts` | 36 | WXT config: manifest, Vite/Tailwind, PostCSS |
| `SPEC.md` | 572 | Full implementation specification |
