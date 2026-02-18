# Scrollr Channel Framework

## Overview

Scrollr uses a **compile-time, first-party, plugin-style channel system** spanning three layers: the Go API, the browser extension, and the web frontend. Each data source (finance, sports, RSS, fantasy) is a self-contained channel that plugs into shared infrastructure at each layer.

This is **not** a runtime marketplace. There are no API keys, no database-driven registry, and no third-party publishing flow. Channels are Go packages, React components, and registry entries checked into the monorepo and built at compile time.

### How It Works

Each channel plugs in at three levels:

| Layer                                        | Purpose                                                 | Key Pattern                            |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| **Go API** (`api/channels/`)                 | CDC routing, dashboard data, health checks, HTTP routes | Interface + capability type assertions |
| **Extension** (`extension/channels/`)        | Feed bar tab with real-time CDC data                    | Registry + `useScrollrCDC` hook        |
| **Frontend** (`myscrollr.com/src/channels/`) | Dashboard configuration panel                           | Registry + shared UI components        |

All three layers use the same channel ID (e.g. `"finance"`, `"sports"`, `"rss"`, `"fantasy"`) as the universal key that ties everything together. This ID matches the `channel_type` in `user_channels` and the dashboard response data keys.

## Architecture

```
                      ┌─────────────────────────────────────────────┐
                      │          Rust Ingestion Services            │
                      │  finance:3001  sports:3002  yahoo:3003      │
                      │  rss:3004                                   │
                      └────────────────────┬────────────────────────┘
                                           │ write
                                           v
                      ┌─────────────────────────────────────────────┐
                      │              PostgreSQL                     │
                      │  trades, games, rss_items, yahoo_*          │
                      └────────────────────┬────────────────────────┘
                                           │ CDC
                                           v
                      ┌─────────────────────────────────────────────┐
                      │          Sequin (external CDC)              │
                      │  Detects row changes, sends webhooks        │
                      └────────────────────┬────────────────────────┘
                                           │ POST /webhooks/sequin
                                           v
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Go API (port 8080)                                  │
│                                                                              │
│  core/handlers_webhook.go                                                    │
│    → For each CDC record, iterate ChannelRegistry                            │
│    → if intg.(CDCHandler) && HandlesTable(table) → RouteCDCRecord()          │
│                                                                              │
│  Per channel:                                                                │
│    finance/  → broadcast to channel:subscribers:finance                       │
│    sports/   → broadcast to channel:subscribers:sports                        │
│    rss/      → per-feed-URL routing via rss:subscribers:{url}                │
│    fantasy/  → join resolution (guid/league_key/team_key → logto_sub)        │
│                                                                              │
│  → Redis Pub/Sub → per-user channel events:user:{sub}                        │
│  → SSE endpoint GET /events?token=                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                         │                              │
                         v                              v
          ┌──────────────────────────┐   ┌──────────────────────────┐
          │    Browser Extension     │   │    Web Frontend          │
          │                          │   │    myscrollr.com         │
          │  Background:             │   │                          │
          │    CDC pass-through      │   │  useRealtime hook:       │
          │    → CDC_BATCH to tabs   │   │    processes CDC records │
          │                          │   │                          │
          │  FeedTab components:     │   │  DashboardTab components:│
          │    useScrollrCDC hook    │   │    channel config panels │
          │    manages own state     │   │    shared UI components  │
          └──────────────────────────┘   └──────────────────────────┘
```

## Current Channels

| Channel     | Go Capabilities                                                | Extension FeedTab                 | Frontend DashboardTab                | Rust Service         | CDC Tables                                                            | Routing Strategy                                        |
| ----------- | -------------------------------------------------------------- | --------------------------------- | ------------------------------------ | -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| **finance** | CDCHandler, DashboardProvider, HealthChecker                   | `useScrollrCDC('trades')`         | Info cards, tracked symbols          | finance_service:3001 | `trades`                                                              | Broadcast to `channel:subscribers:finance`              |
| **sports**  | CDCHandler, DashboardProvider, HealthChecker                   | `useScrollrCDC('games')`          | Info cards, league grid              | sports_service:3002  | `games`                                                               | Broadcast to `channel:subscribers:sports`               |
| **rss**     | CDCHandler, DashboardProvider, ChannelLifecycle, HealthChecker | `useScrollrCDC('rss_items')`      | Feed management, catalog browser     | rss_service:3004     | `rss_items`, `tracked_feeds`                                          | Per-feed-URL via `rss:subscribers:{url}`                |
| **fantasy** | CDCHandler, DashboardProvider, HealthChecker                   | Not in extension (dashboard-only) | Yahoo OAuth, league cards, standings | yahoo_service:3003   | `yahoo_leagues`, `yahoo_standings`, `yahoo_matchups`, `yahoo_rosters` | Join resolution (guid/league_key/team_key -> logto_sub) |

## Adding a New Channel

This section walks through adding a complete channel across all three layers. Each layer has a `_template/` scaffold you can copy as a starting point.

### Step 1: Go API Layer

The Go API uses a core `Channel` interface (3 methods) plus 5 optional capability interfaces checked via type assertions. You only implement what you need.

**Quick start:**

```bash
cp -r api/channels/_template api/channels/myservice
```

1. Change `package _template` to `package myservice`
2. Implement the core interface: `Name()`, `DisplayName()`, `RegisterRoutes()`
3. Implement optional capabilities as needed (uncomment in template, delete what you don't use)
4. Register in `api/main.go`:

```go
import "github.com/brandon-relentnet/myscrollr/api/channels/myservice"

srv.RegisterChannel(myservice.New(core.DBPool, core.SendToUser, core.RouteToChannelSubscribers))
```

**Capability decision guide:**

| Need                                  | Implement           | Example                            |
| ------------------------------------- | ------------------- | ---------------------------------- |
| Push CDC events to users              | `CDCHandler`        | All current channels               |
| Contribute data to `GET /dashboard`   | `DashboardProvider` | All current channels               |
| React to channel create/update/delete | `ChannelLifecycle`  | RSS (syncs feeds to tracked_feeds) |
| Monitor a backing service's health    | `HealthChecker`     | All current channels               |
| Advertise config JSON Schema          | `Configurable`      | None currently                     |

**CDC routing patterns:**

| Pattern         | Use Case                                | Implementation                                                          |
| --------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Broadcast       | All subscribers of a channel type       | `RouteToChannelSubscribers(ctx, "channel:subscribers:<type>", payload)` |
| Record owner    | Route to user identified in record      | `SendToUser(record["logto_sub"], payload)`                              |
| Per-resource    | Users subscribed to a specific resource | `RouteToChannelSubscribers(ctx, "rss:subscribers:<url>", payload)`      |
| Join resolution | Resolve via DB lookup                   | Query `yahoo_users`/`yahoo_leagues` to find `logto_sub`                 |

> **Full Go API guide:** See [`api/CHANNELS.md`](../api/CHANNELS.md) for the complete interface reference, lifecycle diagrams, available `core/` helpers, and step-by-step instructions.

### Step 2: Extension Layer

The extension uses a registry-driven framework. Each channel registers a `FeedTab` React component that manages its own data via the `useScrollrCDC` hook.

**Quick start:**

```bash
cp extension/channels/_template/FeedTab.tsx extension/channels/official/myservice/FeedTab.tsx
```

1. Implement the `FeedTab` component using `useScrollrCDC` for CDC data:

```tsx
import { useScrollrCDC } from '~/channels/hooks/useScrollrCDC';
import type { FeedTabProps } from '~/channels/types';

export default function MyServiceFeedTab({ mode, channelConfig }: FeedTabProps) {
  const initialItems = (channelConfig.__initialItems as MyItem[]) ?? [];

  const { items } = useScrollrCDC<MyItem>({
    table: 'my_table',           // CDC table name
    initialItems,
    keyOf: (item) => item.id,    // Unique key extractor
    sort: (a, b) => ...,         // Optional sort
    validate: (record) => ...,   // Optional validation
  });

  return (
    <div className={clsx('grid gap-px', mode === 'comfort' ? 'grid-cols-4' : 'grid-cols-1')}>
      {items.map((item) => <MyItem key={item.id} item={item} mode={mode} />)}
    </div>
  );
}
```

2. Register in `extension/channels/registry.ts`:

```ts
import MyServiceFeedTab from './official/myservice/FeedTab';

const myservice: ChannelManifest = {
  id: 'myservice',
  name: 'My Service',
  tabLabel: 'MyServ',
  tier: 'official',
  FeedTab: MyServiceFeedTab,
};

// Add to the channels Map:
[myservice.id, myservice],

// Add to TAB_ORDER:
export const TAB_ORDER: readonly string[] = ['finance', 'sports', 'fantasy', 'rss', 'myservice'];
```

3. Add the dashboard key mapping in `extension/entrypoints/scrollbar.content/FeedBar.tsx`:

```ts
const DASHBOARD_KEY_MAP: Record<string, string> = {
  finance: "finance",
  sports: "sports",
  rss: "rss",
  myservice: "myservice", // Must match the key in DashboardResponse.data
};
```

**Key contracts:**

| Type               | Location                          | Purpose                                                                        |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `FeedTabProps`     | `channels/types.ts`               | `{ mode, channelConfig }` — props every FeedTab receives                       |
| `ChannelManifest`  | `channels/types.ts`               | `{ id, name, tabLabel, tier, FeedTab }` — registry entry                       |
| `useScrollrCDC<T>` | `channels/hooks/useScrollrCDC.ts` | Subscribe to CDC table, upsert/remove by key, sort, validate, cap at MAX_ITEMS |

**How data flows to FeedTabs:**

1. Background receives CDC records via SSE
2. Background routes `CDC_BATCH { table, records }` to content script tabs that sent `SUBSCRIBE_CDC`
3. `useScrollrCDC` hook receives the batch and upserts/removes items in local state
4. For initial data: `GET /dashboard` response is stored as `lastDashboard`, broadcast as `INITIAL_DATA`, and injected into `channelConfig.__initialItems` via `DASHBOARD_KEY_MAP`

### Step 3: Frontend Layer

The frontend uses a similar registry pattern. Each channel provides a `DashboardTab` component for the channel configuration panel.

**Quick start:**

```bash
cp myscrollr.com/src/channels/_template/DashboardTab.tsx myscrollr.com/src/channels/official/myservice/DashboardTab.tsx
```

1. Implement the `DashboardTab` component using shared UI components:

```tsx
import { ChannelHeader, InfoCard } from "@/channels/shared";
import { Zap } from "lucide-react";
import type { DashboardTabProps, ChannelManifest } from "@/channels/types";

function MyServiceDashboardTab({
  channel,
  connected,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  return (
    <div>
      <ChannelHeader
        channel={channel}
        icon={<Zap size={20} className="text-primary" />}
        title="My Service"
        subtitle="Description of your channel"
        connected={connected}
        onToggle={onToggle}
        onDelete={onDelete}
      />
      <div className="grid grid-cols-3 gap-3">
        <InfoCard label="Metric" value="42" />
      </div>
    </div>
  );
}

export const myserviceChannel: ChannelManifest = {
  id: "myservice",
  name: "My Service",
  tabLabel: "MyServ",
  description: "Brief description",
  icon: Zap,
  DashboardTab: MyServiceDashboardTab,
};
```

2. Register in `myscrollr.com/src/channels/registry.ts`:

```ts
import { myserviceChannel } from "./official/myservice/DashboardTab";

register(myserviceChannel);

// Update TAB_ORDER:
export const TAB_ORDER = [
  "finance",
  "sports",
  "fantasy",
  "rss",
  "myservice",
] as const;
```

**Key contracts:**

| Type                | Location              | Purpose                                                                             |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `DashboardTabProps` | `channels/types.ts`   | `{ channel, getToken, onToggle, onDelete, onChannelUpdate, connected, extraProps }` |
| `ChannelManifest`   | `channels/types.ts`   | `{ id, name, tabLabel, description, icon, DashboardTab }`                           |
| `ChannelHeader`     | `channels/shared.tsx` | Shared header with toggle switch, delete confirm, connection indicator              |
| `InfoCard`          | `channels/shared.tsx` | Small stat card for displaying metrics                                              |

**The `extraProps` pattern:**

For channels with state beyond the channel (e.g., Fantasy needs Yahoo OAuth status), the dashboard route passes extra data via `extraProps`:

```tsx
// In dashboard.tsx:
extraProps={activeChannel === 'fantasy' ? { yahooUser, yahooLeagues, ... } : undefined}
```

The DashboardTab component type-narrows `extraProps` to access channel-specific data.

### Step 4: Infrastructure

After implementing all three layers:

1. **Database tables**: Create tables in your Rust ingestion service via `CREATE TABLE IF NOT EXISTS` on startup
2. **Sequin CDC**: Configure Sequin to track your new tables and webhook changes to `POST /webhooks/sequin`
3. **Environment variables**: If you have a new ingestion service, add `INTERNAL_MYSERVICE_URL` to the Go API's env
4. **Channel type validation**: Handled automatically. `api/core/channels.go` builds `ValidChannelTypes` from the channel registry at startup via `BuildValidChannelTypes()` — no hardcoded lists
5. **CDC processing in useRealtime.ts**: Add your table to the frontend's `useRealtime` hook if the frontend needs to process CDC records directly (for real-time dashboard updates)

## API Discovery

The Go API exposes a `GET /channels` endpoint that returns all registered channels with their capabilities. This is useful for frontend discovery and debugging.

**Request:**

```
GET https://api.myscrollr.relentnet.dev/channels
```

**Response:**

```json
[
  {
    "name": "finance",
    "display_name": "Finance",
    "capabilities": ["cdc", "dashboard", "health"]
  },
  {
    "name": "sports",
    "display_name": "Sports",
    "capabilities": ["cdc", "dashboard", "health"]
  },
  {
    "name": "rss",
    "display_name": "RSS",
    "capabilities": ["cdc", "dashboard", "channel_lifecycle", "health"]
  },
  {
    "name": "fantasy",
    "display_name": "Fantasy",
    "capabilities": ["cdc", "dashboard", "health"]
  }
]
```

**Capability values:**

| Capability          | Interface           | Meaning                                         |
| ------------------- | ------------------- | ----------------------------------------------- |
| `cdc`               | `CDCHandler`        | Receives and routes Sequin CDC events           |
| `dashboard`         | `DashboardProvider` | Contributes data to `GET /dashboard`            |
| `channel_lifecycle` | `ChannelLifecycle`  | Reacts to channel create/update/delete          |
| `health`            | `HealthChecker`     | Has a backing service whose health is monitored |
| `configurable`      | `Configurable`      | Advertises a JSON Schema for channel config     |

## Key Files Reference

### Go API

| File                                 | Purpose                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `api/core/channels.go`               | Core `Channel` interface (3 methods) + 5 optional capability interfaces, shared types |
| `api/core/server.go`                 | `RegisterChannel()`, `Setup()`, `GET /channels`, `BuildValidChannelTypes()`           |
| `api/core/channels.go`               | Channels CRUD, dynamic `ValidChannelTypes`, `ChannelLifecycle` hook dispatch          |
| `api/core/handlers_webhook.go`       | Sequin CDC webhook, iterates channels for `CDCHandler`                                |
| `api/channels/_template/template.go` | Documented Go scaffold with all interfaces                                            |
| `api/channels/finance/finance.go`    | Finance: broadcast CDC, dashboard data, health proxy                                  |
| `api/channels/sports/sports.go`      | Sports: broadcast CDC, dashboard data, health proxy                                   |
| `api/channels/rss/rss.go`            | RSS: per-URL CDC routing, feed catalog, channel lifecycle                             |
| `api/channels/fantasy/fantasy.go`    | Fantasy: join-based CDC routing, Yahoo OAuth flow                                     |
| `api/main.go`                        | Channel registration at startup                                                       |
| `api/CHANNELS.md`                    | Full Go-layer developer guide (interface reference, lifecycle, helpers)               |

### Browser Extension

| File                                                   | Purpose                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `extension/channels/types.ts`                          | `FeedTabProps`, `ChannelManifest`, `ChannelTier`                                |
| `extension/channels/registry.ts`                       | Registry Map, `getChannel()`, `getAllChannels()`, `sortTabOrder()`, `TAB_ORDER` |
| `extension/channels/hooks/useScrollrCDC.ts`            | Generic CDC subscription hook (subscribe, upsert/remove, sort, validate, cap)   |
| `extension/channels/_template/FeedTab.tsx`             | Documented scaffold for new FeedTab channels                                    |
| `extension/channels/official/finance/FeedTab.tsx`      | Finance tab: `useScrollrCDC('trades')`, renders TradeItem grid                  |
| `extension/channels/official/sports/FeedTab.tsx`       | Sports tab: `useScrollrCDC('games')`, renders GameItem grid                     |
| `extension/channels/official/rss/FeedTab.tsx`          | RSS tab: `useScrollrCDC('rss_items')`, renders RssItem list                     |
| `extension/entrypoints/scrollbar.content/FeedBar.tsx`  | Generic feed shell, `DASHBOARD_KEY_MAP`, mounts active FeedTab                  |
| `extension/entrypoints/scrollbar.content/FeedTabs.tsx` | Registry-driven tab switcher                                                    |
| `extension/entrypoints/background/sse.ts`              | SSE connection, CDC pass-through routing                                        |
| `extension/entrypoints/background/messaging.ts`        | Per-tab CDC subscriptions, `CDC_BATCH` routing                                  |

### Web Frontend

| File                                                           | Purpose                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `myscrollr.com/src/channels/types.ts`                          | `DashboardTabProps`, `ChannelManifest`                                         |
| `myscrollr.com/src/channels/registry.ts`                       | Registry Map, `register()`, `getChannel()`, `sortTabOrder()`, `TAB_ORDER`      |
| `myscrollr.com/src/channels/shared.tsx`                        | `ChannelHeader`, `ToggleSwitch`, `InfoCard` shared components                  |
| `myscrollr.com/src/channels/_template/DashboardTab.tsx`        | Documented scaffold for new DashboardTab channels                              |
| `myscrollr.com/src/channels/official/finance/DashboardTab.tsx` | Finance channel config panel                                                   |
| `myscrollr.com/src/channels/official/sports/DashboardTab.tsx`  | Sports channel config panel                                                    |
| `myscrollr.com/src/channels/official/fantasy/DashboardTab.tsx` | Fantasy channel config (Yahoo OAuth, league cards)                             |
| `myscrollr.com/src/channels/official/rss/DashboardTab.tsx`     | RSS channel config (feed management, catalog browser)                          |
| `myscrollr.com/src/routes/dashboard.tsx`                       | Generic dashboard shell (607 lines), renders active DashboardTab from registry |
| `myscrollr.com/src/hooks/useRealtime.ts`                       | SSE client, processes CDC records for all tables                               |
