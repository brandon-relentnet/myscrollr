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
| React | 19 | UI framework for popup and content script |
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
      preferences.ts            #   Server preference sync and stream visibility management
    scrollbar.content/          # Content script injected on <all_urls>
      index.tsx                 #   Entry: site filtering, Shadow Root UI mount
      App.tsx                   #   Root component: state, message listeners, storage watchers
      FeedBar.tsx               #   Main container: header, tabs, scrollable content, drag-to-resize
      FeedTabs.tsx              #   Tab switcher (Finance / Sports / RSS)
      TradeItem.tsx             #   Single trade row (symbol, price, change, direction arrow)
      GameItem.tsx              #   Single game row (teams, logos, scores, status)
      RssItem.tsx               #   RSS article display (comfort/compact modes)
      ConnectionIndicator.tsx   #   Green/amber/red dot for SSE connection status
      style.css                 #   Tailwind import for Shadow Root CSS
    popup/                      # Extension popup (320px wide)
      index.html                #   HTML shell
      main.tsx                  #   React mount
      App.tsx                   #   Quick controls: toggle, mode, position, behavior, auth
      style.css                 #   Tailwind import
  utils/                        # Shared utilities (auto-imported by WXT)
    constants.ts                #   API_URL, SSE_URL, FRONTEND_URL, LOGTO_ENDPOINT, LOGTO_APP_ID, MAX_ITEMS
    types.ts                    #   Trade, Game, RssItem, UserPreferences, UserStream, DashboardResponse, CDCRecord, SSEPayload, etc.
    messaging.ts                #   BackgroundMessage + ClientMessage type definitions
    storage.ts                  #   All WXT storage.defineItem declarations (13 items)
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
                    GET /events?token= (authenticated SSE)
                           |
                     EventSource (SSE)
                           |
                           v
            ┌─── Background Service Worker ───┐
            │                                  │
            │  In-memory state:                │
            │    trades: Trade[]               │
            │    games: Game[]                 │
            │    rssItems: RssItem[]           │
            │    connectionStatus              │
            │    authenticated                 │
            │                                  │
            │  CDC Processing:                 │
            │    trades/games/rss_items:        │
            │      insert/update -> upsert     │
            │      delete -> remove            │
            │      cap at 50 items per category│
            │    user_preferences:             │
            │      -> sync to WXT storage      │
            │    user_streams:                 │
            │      -> update tab visibility    │
            │                                  │
            │  On login:                       │
            │    GET /dashboard (authenticated)│
            │    -> merge into in-memory state │
            └──────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   runtime.sendMessage      tabs.sendMessage
          │                         │
          v                         v
       Popup                 Content Scripts
                              (every tab)
```

### Message Passing

All UI surfaces receive data from the background via `browser.runtime.onMessage`. Content scripts and popup can request state via `GET_STATE`. The background responds with a `STATE_SNAPSHOT`.

## Messaging Protocol

### Background -> UI (`BackgroundMessage`)

| Type | Payload | When |
|------|---------|------|
| `CONNECTION_STATUS` | `ConnectionStatus` | SSE connection state changes |
| `INITIAL_DATA` | `DashboardResponse` | After authenticated `/dashboard` fetch |
| `AUTH_STATUS` | `boolean` | Login/logout/token expiry |
| `STATE_UPDATE` | `{ trades, games, rssItems }` | After CDC records are processed |
| `STATE_SNAPSHOT` | `{ trades, games, rssItems, connectionStatus, authenticated }` | Response to `GET_STATE` |

### UI -> Background (`ClientMessage`)

| Type | Purpose |
|------|---------|
| `GET_STATE` | Request full state snapshot |
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
| `local:userSub` | `string \| null` | `null` | Logto user subject identifier |
| `local:authToken` | `string \| null` | `null` | Logto JWT access token |
| `local:authTokenExpiry` | `number \| null` | `null` | Token expiry timestamp (ms) |
| `local:authRefreshToken` | `string \| null` | `null` | Logto refresh token |

Storage watchers in the content script's `App.tsx` react to preference changes from popup in real-time across all tabs.

## Authentication

- **Provider**: Logto (self-hosted OIDC) at `https://auth.myscrollr.relentnet.dev`
- **App ID**: `kq298uwwusrvw8m6yn6b4` (Native app type, separate from the frontend's `ogbulfshvf934eeli4t9u`)
- **Flow**: PKCE authorization code via `browser.identity.launchWebAuthFlow`
- **Scopes**: `openid profile email offline_access`
- **Resource**: `https://api.myscrollr.relentnet.dev` (API audience)
- **Token exchange**: `POST ${API_URL}/extension/token` (proxied to Logto by Go API)
- **Refresh**: Automatic when token expires within 60 seconds; uses `refresh_token` grant
- **Concurrency guards**: `refreshPromise` and `loginPromise` mutexes prevent duplicate requests
- **Expiry handling**: On refresh failure, clears all tokens and broadcasts `AUTH_STATUS: false`

## SSE & Real-Time Data

- **Endpoint**: `GET https://api.myscrollr.relentnet.dev/events?token=` (authenticated via JWT query param)
- **Transport**: `EventSource` in background service worker
- **Event format**: Default `message` events with JSON body `{ data: CDCRecord[] }`
- **CDC routing**: `metadata.table_name` routes to `trades`, `games`, or `rssItems` arrays; also processes `user_preferences` (synced to WXT storage) and `user_streams` (updates tab visibility); unknown tables silently ignored
- **Operations**: `insert`/`update` -> upsert by key (`symbol` for trades, `id` for games, `id` for rssItems); `delete` -> remove
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
- **Tabs**: Finance, Sports, and RSS tabs, filtered by `activeFeedTabs` storage item and stream visibility from `user_streams` CDC records

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
| `FRONTEND_URL` | `https://myscrollr.relentnet.dev` | Frontend web app URL |
| `LOGTO_ENDPOINT` | `https://auth.myscrollr.relentnet.dev` | Logto OIDC server |
| `LOGTO_APP_ID` | `kq298uwwusrvw8m6yn6b4` | Extension's Logto client ID |
| `MAX_ITEMS` | `50` | Max items per category in memory |
| `SSE_RECONNECT_BASE` | `1000` | Initial reconnect delay (ms) |
| `SSE_RECONNECT_MAX` | `30000` | Max reconnect delay (ms) |

## Important Files

| File | Lines | Purpose |
|------|-------|---------|
| `entrypoints/background/index.ts` | 59 | Background entry: wires SSE, messaging, auth, keepalive |
| `entrypoints/background/sse.ts` | 266 | SSE connection manager, CDC processing, in-memory state |
| `entrypoints/background/auth.ts` | 239 | Logto PKCE flow, token refresh, concurrency guards |
| `entrypoints/background/messaging.ts` | 172 | Message handler, broadcast to tabs/popup |
| `entrypoints/background/preferences.ts` | 108 | Server preference sync, stream visibility management |
| `entrypoints/scrollbar.content/index.tsx` | 77 | Content script entry: site filtering, Shadow Root mount |
| `entrypoints/scrollbar.content/App.tsx` | 204 | Content script root: state, message listeners, storage watchers |
| `entrypoints/scrollbar.content/FeedBar.tsx` | 242 | Feed container: header, tabs, content area, drag-to-resize |
| `entrypoints/scrollbar.content/RssItem.tsx` | 94 | RSS article display (comfort/compact modes) |
| `entrypoints/popup/App.tsx` | 227 | Quick controls popup |
| `utils/storage.ts` | 87 | All 13 WXT storage item definitions |
| `utils/messaging.ts` | 66 | Type-safe message protocol definitions |
| `utils/types.ts` | 108 | Shared type definitions (Trade, Game, RssItem, UserPreferences, UserStream, CDC, etc.) |
| `utils/constants.ts` | 15 | API URLs, Logto config, limits, timing constants |
| `wxt.config.ts` | 35 | WXT config: manifest, Vite/Tailwind, PostCSS |
| `SPEC.md` | 572 | Full implementation specification |
