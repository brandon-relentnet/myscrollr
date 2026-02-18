# CLAUDE.md — Browser Extension

This file provides guidance to Claude Code when working in the `extension/` directory.

This is the **Scrollr browser extension**, part of the MyScrollr monorepo. It injects a real-time data feed bar into every webpage via a Shadow Root content script. The feed bar renders **channel-provided FeedTab components** discovered at build time from `../channels/*/extension/`. Each channel owns its own data lifecycle and UI. The root `../CLAUDE.md` has full platform context (API endpoints, database schema, Rust ingestion services, frontend, deployment).

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

| Technology        | Version | Purpose                                                                             |
| ----------------- | ------- | ----------------------------------------------------------------------------------- |
| WXT               | v0.20   | Extension framework (file-based entrypoints, manifest generation, dev mode)         |
| React             | 19      | UI framework for popup and content script                                           |
| Tailwind CSS      | v4      | Styling (via `@tailwindcss/vite` plugin)                                            |
| TypeScript        | 5.9     | Type safety                                                                         |
| PostCSS rem-to-px | 6.0     | Converts `rem` to `px` in content script CSS (Shadow Root breaks `rem` inheritance) |
| clsx              | 2.1     | Conditional CSS class joining                                                       |

## Project Structure

```
extension/
  channels/                     # Channel framework (shared infrastructure)
    types.ts                    #   FeedTabProps, ChannelManifest contracts
    registry.ts                 #   Convention-based discovery via import.meta.glob + META lookup
    hooks/
      useScrollrCDC.ts          #   Generic CDC subscription hook for official channels
  # NOTE: FeedTab components live in ../channels/*/extension/ (monorepo-level)
  #   finance: ../channels/finance/extension/{FeedTab.tsx, TradeItem.tsx}
  #   sports:  ../channels/sports/extension/{FeedTab.tsx, GameItem.tsx}
  #   rss:     ../channels/rss/extension/{FeedTab.tsx, RssItem.tsx}
  #   fantasy: ../channels/fantasy/extension/FeedTab.tsx
  entrypoints/
    background/                 # MV3 service worker / MV2 background page
      index.ts                  #   Entry: wires up SSE, messaging, auth, keepalive
      sse.ts                    #   SSE connection manager, CDC pass-through routing
      auth.ts                   #   Logto PKCE OAuth flow, token refresh, concurrency guards
      messaging.ts              #   Per-tab CDC subscriptions, broadcast, message handler
      preferences.ts            #   Server preference sync and channel visibility management
      dashboard.ts              #   Dashboard fetch and snapshot storage
    scrollbar.content/          # Content script injected on <all_urls>
      index.tsx                 #   Entry: site filtering, Shadow Root UI mount
      App.tsx                   #   Root component: dashboard state, preferences, message listeners
      FeedBar.tsx               #   Generic shell: header, registry-driven tabs, mounts active FeedTab
      FeedTabs.tsx              #   Registry-driven tab switcher
      ConnectionIndicator.tsx   #   Green/amber/red dot for SSE connection status
      style.css                 #   Tailwind import for Shadow Root CSS
    popup/                      # Extension popup (320px wide)
      index.html                #   HTML shell
      main.tsx                  #   React mount
      App.tsx                   #   Quick controls: toggle, mode, position, behavior, auth
      style.css                 #   Tailwind import
  utils/                        # Shared utilities (auto-imported by WXT)
    constants.ts                #   API_URL, SSE_URL, FRONTEND_URL, LOGTO_ENDPOINT, LOGTO_APP_ID, MAX_ITEMS
    types.ts                    #   Trade, Game, RssItem, UserPreferences, UserChannel, DashboardResponse, CDCRecord, SSEPayload, etc.
    messaging.ts                #   BackgroundMessage + ClientMessage type definitions (CDC_BATCH, SUBSCRIBE_CDC, etc.)
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

### Channel Framework

The extension uses a **plugin-style channel framework**. Each channel registers a `FeedTab` React component via a `ChannelManifest` in `channels/registry.ts`. The feed bar is a generic shell that mounts whichever channel's FeedTab is active.

**Channel tiers**:

- **Official**: First-party channels (finance, sports, rss) that use the shared CDC/SSE pipeline via `useScrollrCDC` hook
- **Verified**: Community-built, reviewed by Scrollr team — fetch their own data
- **Community**: Community-built, lighter review — fetch their own data

**Key contracts**:

- `FeedTabProps`: `{ mode: FeedMode, channelConfig: Record<string, unknown> }` — passed to every FeedTab
- `ChannelManifest`: `{ id, name, tabLabel, tier, FeedTab }` — registered in the registry
- `useScrollrCDC<T>({ table, initialItems, keyOf, validate?, sort? })`: Hook for official channels to subscribe to CDC records from SSE

**Adding a channel**: Create a `FeedTab.tsx` component, add a `ChannelManifest` to `channels/registry.ts`. The framework handles tab rendering, data routing, and lifecycle.

### Data Flow

```
                    GET /events?token= (authenticated SSE)
                           |
                     EventSource (SSE)
                           |
                           v
            ┌─── Background Service Worker ───┐
            │                                  │
            │  CDC Pass-Through Router:        │
            │    Framework tables:             │
            │      user_preferences → storage  │
            │      user_channels → tab visibility│
             │    Channel tables:               │
            │      trades, games, rss_items →  │
            │      CDC_BATCH to subscribed tabs│
            │                                  │
            │  Dashboard Snapshot:             │
            │    lastDashboard (for GET_STATE) │
            │                                  │
            │  Per-tab CDC subscriptions:      │
            │    tabSubscriptions Map          │
            │    tabId → Set<tableName>        │
            │                                  │
            │  On login:                       │
            │    GET /dashboard (authenticated)│
            │    → store as lastDashboard      │
            │    → broadcast INITIAL_DATA      │
            └──────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
   runtime.sendMessage      tabs.sendMessage
          │                    (to subscribed tabs only)
          v                         │
       Popup                 Content Scripts
                              (every tab)
                                    │
                             ┌──────┴──────┐
                             │   FeedBar   │
                             │  (generic)  │
                             └──────┬──────┘
                                    │
                          ┌─────────┴─────────┐
                          │  Active FeedTab   │
                          │  (from registry)  │
                          │                   │
                          │  useScrollrCDC()  │
                          │  manages own      │
                          │  items[] state    │
                          └───────────────────┘
```

### Message Passing

Content scripts send `SUBSCRIBE_CDC` / `UNSUBSCRIBE_CDC` to the background to register interest in specific CDC tables. The background routes `CDC_BATCH` messages only to tabs that subscribed. Content scripts request initial state via `GET_STATE`, which returns the latest dashboard snapshot.

## Messaging Protocol

### Background -> UI (`BackgroundMessage`)

| Type                | Payload                                          | When                                                            |
| ------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `CONNECTION_STATUS` | `ConnectionStatus`                               | SSE connection state changes                                    |
| `INITIAL_DATA`      | `DashboardResponse`                              | After authenticated `/dashboard` fetch                          |
| `AUTH_STATUS`       | `boolean`                                        | Login/logout/token expiry                                       |
| `CDC_BATCH`         | `{ table: string, records: CDCRecord[] }`        | CDC records for a specific table (sent to subscribed tabs only) |
| `STATE_SNAPSHOT`    | `{ dashboard, connectionStatus, authenticated }` | Response to `GET_STATE`                                         |

### UI -> Background (`ClientMessage`)

| Type              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `GET_STATE`       | Request full state snapshot (dashboard + connection + auth)             |
| `LOGIN`           | Start Logto OAuth flow                                                  |
| `LOGOUT`          | Clear tokens, broadcast auth status                                     |
| `SUBSCRIBE_CDC`   | `{ tables: string[] }` — register for CDC records from specified tables |
| `UNSUBSCRIBE_CDC` | `{ tables: string[] }` — unregister from CDC records                    |

## Storage Schema

All items use WXT `storage.defineItem` with `local:` prefix, version 1, and explicit fallbacks.

| Key                      | Type                     | Default                 | Purpose                                               |
| ------------------------ | ------------------------ | ----------------------- | ----------------------------------------------------- |
| `local:feedPosition`     | `'top' \| 'bottom'`      | `'bottom'`              | Feed bar position on page                             |
| `local:feedHeight`       | `number`                 | `200`                   | Feed bar height in pixels                             |
| `local:feedMode`         | `'comfort' \| 'compact'` | `'comfort'`             | Display density                                       |
| `local:feedCollapsed`    | `boolean`                | `false`                 | Whether feed bar is collapsed                         |
| `local:feedBehavior`     | `'overlay' \| 'push'`    | `'overlay'`             | Overlay page or push content                          |
| `local:feedEnabled`      | `boolean`                | `true`                  | Global feed on/off toggle                             |
| `local:enabledSites`     | `string[]`               | `[]`                    | URL patterns to show feed (empty = all)               |
| `local:disabledSites`    | `string[]`               | `[]`                    | URL patterns to hide feed                             |
| `local:activeFeedTabs`   | `string[]`               | `['finance', 'sports']` | Visible channel tab IDs (driven by user_channels CDC) |
| `local:userSub`          | `string \| null`         | `null`                  | Logto user subject identifier                         |
| `local:authToken`        | `string \| null`         | `null`                  | Logto JWT access token                                |
| `local:authTokenExpiry`  | `number \| null`         | `null`                  | Token expiry timestamp (ms)                           |
| `local:authRefreshToken` | `string \| null`         | `null`                  | Logto refresh token                                   |

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
- **CDC routing**: Background is a **pass-through router**. Framework tables (`user_preferences`, `user_channels`) are handled internally. Channel tables (`trades`, `games`, `rss_items`, etc.) are batched by table name and forwarded as `CDC_BATCH` messages to content script tabs that sent `SUBSCRIBE_CDC` for those tables.
- **FeedTab data management**: Each FeedTab uses the `useScrollrCDC` hook which handles upsert/remove by key, optional sort, validation, and capping at `MAX_ITEMS`. The background no longer maintains centralized data arrays.
- **Reconnection**: Exponential backoff starting at 1s, doubling each attempt, capped at 30s
- **MV3 keepalive**: `chrome.alarms` fires every 30 seconds; reconnects SSE if disconnected (handles service worker termination)
- **Dashboard snapshot**: After login, `GET /dashboard` stores the response as `lastDashboard` and broadcasts `INITIAL_DATA`. Content scripts pass this to FeedTabs as initial data via `channelConfig.__initialItems`.

## Content Script UI

- **Mount method**: `createShadowRootUi` with `position: 'overlay'` — isolates CSS from the host page
- **CSS isolation**: Tailwind CSS compiled with `postcss-rem-to-responsive-pixel` converting all `rem` to `px` (Shadow Root breaks `rem` inheritance from the host page's `<html>` font-size)
- **Site filtering**: Before mounting, checks `feedEnabled`, then `disabledSites` (block list), then `enabledSites` (allow list, empty = all). Patterns support simple wildcards (`*`) converted to regex.
- **Push mode**: When `feedBehavior` is `'push'`, adjusts `document.body.style.marginTop` or `marginBottom` to make room for the feed bar
- **Drag-to-resize**: Feed bar has a drag handle; updates height in real-time with min 100px / max 600px constraints, persisted to storage
- **Tabs**: Registry-driven — derived from `activeFeedTabs` storage (set by `user_channels` CDC) and resolved via `getChannel()`. Tab order follows `TAB_ORDER` from the registry.
- **FeedTab rendering**: FeedBar looks up the active channel from the registry and renders its `FeedTab` component with `mode` and `channelConfig` props.

## Browser Targets

| Browser | Manifest Version | Notes                                                        |
| ------- | ---------------- | ------------------------------------------------------------ |
| Chrome  | MV3              | Primary target, service worker background                    |
| Firefox | MV2              | WXT auto-targets MV2 for Firefox, persistent background page |
| Edge    | MV3              | Same as Chrome build                                         |
| Safari  | MV2              | Requires post-build `xcrun safari-web-extension-converter`   |

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
- **Messaging**: Type-safe message protocol defined in `utils/messaging.ts`. Background is the CDC pass-through router; FeedTab components manage their own state via `useScrollrCDC`.
- **Styling**: Tailwind CSS v4 with `@import 'tailwindcss'`. Content script CSS goes through rem-to-px PostCSS transform. Use `clsx` for conditional classes.
- **Auto-imports**: WXT auto-imports from `utils/`, `hooks/`, `components/` directories plus WXT APIs (`storage`, `defineContentScript`, `createShadowRootUi`, `browser`, etc.). Use `#imports` for explicit imports. **Note**: Files in `channels/` are NOT auto-imported — use explicit imports.
- **Type definitions**: Shared types live in `utils/types.ts`. Message types in `utils/messaging.ts`. Channel contracts in `channels/types.ts`.
- **State management**: No external state library. Background stores `lastDashboard` snapshot; each FeedTab manages its own items via `useScrollrCDC` hook. Preferences live in WXT storage with reactive watchers.
- **Adding channels**: Create a new directory at `../channels/<name>/extension/` with a `FeedTab.tsx` component. The registry auto-discovers it via `import.meta.glob`. Official channels use `useScrollrCDC` for CDC data; others fetch their own data.

## Constants

Defined in `utils/constants.ts`:

| Constant             | Value                                  | Purpose                          |
| -------------------- | -------------------------------------- | -------------------------------- |
| `API_URL`            | `https://api.myscrollr.relentnet.dev`  | Base API URL                     |
| `SSE_URL`            | `${API_URL}/events`                    | SSE stream endpoint              |
| `FRONTEND_URL`       | `https://myscrollr.relentnet.dev`      | Frontend web app URL             |
| `LOGTO_ENDPOINT`     | `https://auth.myscrollr.relentnet.dev` | Logto OIDC server                |
| `LOGTO_APP_ID`       | `kq298uwwusrvw8m6yn6b4`                | Extension's Logto client ID      |
| `MAX_ITEMS`          | `50`                                   | Max items per category in memory |
| `SSE_RECONNECT_BASE` | `1000`                                 | Initial reconnect delay (ms)     |
| `SSE_RECONNECT_MAX`  | `30000`                                | Max reconnect delay (ms)         |

## Important Files

| File                                        | Purpose                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `channels/types.ts`                         | `FeedTabProps`, `ChannelManifest` — the channel contract                            |
| `channels/registry.ts`                      | Channel registry: `getChannel()`, `getAllChannels()`, `sortTabOrder()`, `TAB_ORDER` |
| `channels/hooks/useScrollrCDC.ts`           | Generic CDC subscription hook (subscribe, upsert/remove, sort, validate, cap)       |
| `../channels/finance/extension/FeedTab.tsx` | Finance tab — `useScrollrCDC('trades')`, renders TradeItem list                     |
| `../channels/sports/extension/FeedTab.tsx`  | Sports tab — `useScrollrCDC('games')`, renders GameItem list                        |
| `../channels/rss/extension/FeedTab.tsx`     | RSS tab — `useScrollrCDC('rss_items')`, renders RssItem list                        |
| `../channels/fantasy/extension/FeedTab.tsx` | Fantasy tab — placeholder (data best viewed on web)                                 |

| `entrypoints/background/index.ts` | Background entry: wires SSE, messaging, auth, keepalive |
| `entrypoints/background/sse.ts` | SSE connection, CDC pass-through routing, dashboard snapshot storage |
| `entrypoints/background/messaging.ts` | Per-tab CDC subscriptions, CDC_BATCH routing, message handler |
| `entrypoints/background/auth.ts` | Logto PKCE flow, token refresh, concurrency guards |
| `entrypoints/background/preferences.ts` | Server preference sync, channel visibility management |
| `entrypoints/background/dashboard.ts` | Dashboard fetch and snapshot storage |
| `entrypoints/scrollbar.content/index.tsx` | Content script entry: site filtering, Shadow Root mount |
| `entrypoints/scrollbar.content/App.tsx` | Root component: dashboard state, preferences, message listeners |
| `entrypoints/scrollbar.content/FeedBar.tsx` | Generic feed shell: header, registry-driven tabs, mounts active FeedTab |
| `entrypoints/scrollbar.content/FeedTabs.tsx` | Registry-driven tab switcher |
| `entrypoints/popup/App.tsx` | Quick controls popup |
| `utils/storage.ts` | All 13 WXT storage item definitions |
| `utils/messaging.ts` | Type-safe message protocol (CDC_BATCH, SUBSCRIBE_CDC, etc.) |
| `utils/types.ts` | Shared type definitions (Trade, Game, RssItem, CDC, etc.) |
| `utils/constants.ts` | API URLs, Logto config, limits, timing constants |
| `wxt.config.ts` | WXT config: manifest, Vite/Tailwind, PostCSS |
