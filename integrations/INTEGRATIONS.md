# Scrollr Integration Framework

## Overview

Scrollr uses a **compile-time, first-party, plugin-style integration system** spanning three layers: the Go API, the browser extension, and the web frontend. Each data source (finance, sports, RSS, fantasy) is a self-contained integration that plugs into shared infrastructure at each layer.

This is **not** a runtime marketplace. There are no API keys, no database-driven registry, and no third-party publishing flow. Integrations are Go packages, React components, and registry entries checked into the monorepo and built at compile time.

### How It Works

Each integration plugs in at three levels:

| Layer | Purpose | Key Pattern |
|-------|---------|------------|
| **Go API** (`api/integrations/`) | CDC routing, dashboard data, health checks, HTTP routes | Interface + capability type assertions |
| **Extension** (`extension/integrations/`) | Feed bar tab with real-time CDC data | Registry + `useScrollrCDC` hook |
| **Frontend** (`myscrollr.com/src/integrations/`) | Dashboard configuration panel | Registry + shared UI components |

All three layers use the same integration ID (e.g. `"finance"`, `"sports"`, `"rss"`, `"fantasy"`) as the universal key that ties everything together. This ID matches the `stream_type` in `user_streams` and the dashboard response data keys.

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
│    → For each CDC record, iterate IntegrationRegistry                        │
│    → if intg.(CDCHandler) && HandlesTable(table) → RouteCDCRecord()          │
│                                                                              │
│  Per integration:                                                            │
│    finance/  → broadcast to stream:subscribers:finance                        │
│    sports/   → broadcast to stream:subscribers:sports                         │
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
          │    useScrollrCDC hook    │   │    stream config panels  │
          │    manages own state     │   │    shared UI components  │
          └──────────────────────────┘   └──────────────────────────┘
```

## Current Integrations

| Integration | Go Capabilities | Extension FeedTab | Frontend DashboardTab | Rust Service | CDC Tables | Routing Strategy |
|-------------|----------------|-------------------|----------------------|-------------|------------|-----------------|
| **finance** | CDCHandler, DashboardProvider, HealthChecker | `useScrollrCDC('trades')` | Info cards, tracked symbols | finance_service:3001 | `trades` | Broadcast to `stream:subscribers:finance` |
| **sports** | CDCHandler, DashboardProvider, HealthChecker | `useScrollrCDC('games')` | Info cards, league grid | sports_service:3002 | `games` | Broadcast to `stream:subscribers:sports` |
| **rss** | CDCHandler, DashboardProvider, StreamLifecycle, HealthChecker | `useScrollrCDC('rss_items')` | Feed management, catalog browser | rss_service:3004 | `rss_items`, `tracked_feeds` | Per-feed-URL via `rss:subscribers:{url}` |
| **fantasy** | CDCHandler, DashboardProvider, HealthChecker | Not in extension (dashboard-only) | Yahoo OAuth, league cards, standings | yahoo_service:3003 | `yahoo_leagues`, `yahoo_standings`, `yahoo_matchups`, `yahoo_rosters` | Join resolution (guid/league_key/team_key -> logto_sub) |

## Adding a New Integration

This section walks through adding a complete integration across all three layers. Each layer has a `_template/` scaffold you can copy as a starting point.

### Step 1: Go API Layer

The Go API uses a core `Integration` interface (3 methods) plus 5 optional capability interfaces checked via type assertions. You only implement what you need.

**Quick start:**

```bash
cp -r api/integrations/_template api/integrations/myservice
```

1. Change `package _template` to `package myservice`
2. Implement the core interface: `Name()`, `DisplayName()`, `RegisterRoutes()`
3. Implement optional capabilities as needed (uncomment in template, delete what you don't use)
4. Register in `api/main.go`:

```go
import "github.com/brandon-relentnet/myscrollr/api/integrations/myservice"

srv.RegisterIntegration(myservice.New(core.DBPool, core.SendToUser, core.RouteToStreamSubscribers))
```

**Capability decision guide:**

| Need | Implement | Example |
|------|-----------|---------|
| Push CDC events to users | `CDCHandler` | All current integrations |
| Contribute data to `GET /dashboard` | `DashboardProvider` | All current integrations |
| React to stream create/update/delete | `StreamLifecycle` | RSS (syncs feeds to tracked_feeds) |
| Monitor a backing service's health | `HealthChecker` | All current integrations |
| Advertise config JSON Schema | `Configurable` | None currently |

**CDC routing patterns:**

| Pattern | Use Case | Implementation |
|---------|----------|---------------|
| Broadcast | All subscribers of a stream type | `RouteToStreamSubscribers(ctx, "stream:subscribers:<type>", payload)` |
| Record owner | Route to user identified in record | `SendToUser(record["logto_sub"], payload)` |
| Per-resource | Users subscribed to a specific resource | `RouteToStreamSubscribers(ctx, "rss:subscribers:<url>", payload)` |
| Join resolution | Resolve via DB lookup | Query `yahoo_users`/`yahoo_leagues` to find `logto_sub` |

> **Full Go API guide:** See [`api/INTEGRATIONS.md`](../api/INTEGRATIONS.md) for the complete interface reference, lifecycle diagrams, available `core/` helpers, and step-by-step instructions.

### Step 2: Extension Layer

The extension uses a registry-driven framework. Each integration registers a `FeedTab` React component that manages its own data via the `useScrollrCDC` hook.

**Quick start:**

```bash
cp extension/integrations/_template/FeedTab.tsx extension/integrations/official/myservice/FeedTab.tsx
```

1. Implement the `FeedTab` component using `useScrollrCDC` for CDC data:

```tsx
import { useScrollrCDC } from '~/integrations/hooks/useScrollrCDC';
import type { FeedTabProps } from '~/integrations/types';

export default function MyServiceFeedTab({ mode, streamConfig }: FeedTabProps) {
  const initialItems = (streamConfig.__initialItems as MyItem[]) ?? [];

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

2. Register in `extension/integrations/registry.ts`:

```ts
import MyServiceFeedTab from './official/myservice/FeedTab';

const myservice: IntegrationManifest = {
  id: 'myservice',
  name: 'My Service',
  tabLabel: 'MyServ',
  tier: 'official',
  FeedTab: MyServiceFeedTab,
};

// Add to the integrations Map:
[myservice.id, myservice],

// Add to TAB_ORDER:
export const TAB_ORDER: readonly string[] = ['finance', 'sports', 'fantasy', 'rss', 'myservice'];
```

3. Add the dashboard key mapping in `extension/entrypoints/scrollbar.content/FeedBar.tsx`:

```ts
const DASHBOARD_KEY_MAP: Record<string, string> = {
  finance: 'finance',
  sports: 'sports',
  rss: 'rss',
  myservice: 'myservice',  // Must match the key in DashboardResponse.data
};
```

**Key contracts:**

| Type | Location | Purpose |
|------|----------|---------|
| `FeedTabProps` | `integrations/types.ts` | `{ mode, streamConfig }` — props every FeedTab receives |
| `IntegrationManifest` | `integrations/types.ts` | `{ id, name, tabLabel, tier, FeedTab }` — registry entry |
| `useScrollrCDC<T>` | `integrations/hooks/useScrollrCDC.ts` | Subscribe to CDC table, upsert/remove by key, sort, validate, cap at MAX_ITEMS |

**How data flows to FeedTabs:**

1. Background receives CDC records via SSE
2. Background routes `CDC_BATCH { table, records }` to content script tabs that sent `SUBSCRIBE_CDC`
3. `useScrollrCDC` hook receives the batch and upserts/removes items in local state
4. For initial data: `GET /dashboard` response is stored as `lastDashboard`, broadcast as `INITIAL_DATA`, and injected into `streamConfig.__initialItems` via `DASHBOARD_KEY_MAP`

### Step 3: Frontend Layer

The frontend uses a similar registry pattern. Each integration provides a `DashboardTab` component for the stream configuration panel.

**Quick start:**

```bash
cp myscrollr.com/src/integrations/_template/DashboardTab.tsx myscrollr.com/src/integrations/official/myservice/DashboardTab.tsx
```

1. Implement the `DashboardTab` component using shared UI components:

```tsx
import { StreamHeader, InfoCard } from '@/integrations/shared';
import { Zap } from 'lucide-react';
import type { DashboardTabProps, IntegrationManifest } from '@/integrations/types';

function MyServiceDashboardTab({ stream, connected, onToggle, onDelete }: DashboardTabProps) {
  return (
    <div>
      <StreamHeader
        stream={stream}
        icon={<Zap size={20} className="text-primary" />}
        title="My Service"
        subtitle="Description of your integration"
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

export const myserviceIntegration: IntegrationManifest = {
  id: 'myservice',
  name: 'My Service',
  tabLabel: 'MyServ',
  description: 'Brief description',
  icon: Zap,
  DashboardTab: MyServiceDashboardTab,
};
```

2. Register in `myscrollr.com/src/integrations/registry.ts`:

```ts
import { myserviceIntegration } from './official/myservice/DashboardTab';

register(myserviceIntegration);

// Update TAB_ORDER:
export const TAB_ORDER = ['finance', 'sports', 'fantasy', 'rss', 'myservice'] as const;
```

**Key contracts:**

| Type | Location | Purpose |
|------|----------|---------|
| `DashboardTabProps` | `integrations/types.ts` | `{ stream, getToken, onToggle, onDelete, onStreamUpdate, connected, extraProps }` |
| `IntegrationManifest` | `integrations/types.ts` | `{ id, name, tabLabel, description, icon, DashboardTab }` |
| `StreamHeader` | `integrations/shared.tsx` | Shared header with toggle switch, delete confirm, connection indicator |
| `InfoCard` | `integrations/shared.tsx` | Small stat card for displaying metrics |

**The `extraProps` pattern:**

For integrations with state beyond the stream (e.g., Fantasy needs Yahoo OAuth status), the dashboard route passes extra data via `extraProps`:

```tsx
// In dashboard.tsx:
extraProps={activeStream === 'fantasy' ? { yahooUser, yahooLeagues, ... } : undefined}
```

The DashboardTab component type-narrows `extraProps` to access integration-specific data.

### Step 4: Infrastructure

After implementing all three layers:

1. **Database tables**: Create tables in your Rust ingestion service via `CREATE TABLE IF NOT EXISTS` on startup
2. **Sequin CDC**: Configure Sequin to track your new tables and webhook changes to `POST /webhooks/sequin`
3. **Environment variables**: If you have a new ingestion service, add `INTERNAL_MYSERVICE_URL` to the Go API's env
4. **Stream type validation**: Handled automatically. `core/streams.go` builds `ValidStreamTypes` from the integration registry at startup via `BuildValidStreamTypes()` — no hardcoded lists
5. **CDC processing in useRealtime.ts**: Add your table to the frontend's `useRealtime` hook if the frontend needs to process CDC records directly (for real-time dashboard updates)

## API Discovery

The Go API exposes a `GET /integrations` endpoint that returns all registered integrations with their capabilities. This is useful for frontend discovery and debugging.

**Request:**

```
GET https://api.myscrollr.relentnet.dev/integrations
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
    "capabilities": ["cdc", "dashboard", "stream_lifecycle", "health"]
  },
  {
    "name": "fantasy",
    "display_name": "Fantasy",
    "capabilities": ["cdc", "dashboard", "health"]
  }
]
```

**Capability values:**

| Capability | Interface | Meaning |
|-----------|-----------|---------|
| `cdc` | `CDCHandler` | Receives and routes Sequin CDC events |
| `dashboard` | `DashboardProvider` | Contributes data to `GET /dashboard` |
| `stream_lifecycle` | `StreamLifecycle` | Reacts to stream create/update/delete |
| `health` | `HealthChecker` | Has a backing service whose health is monitored |
| `configurable` | `Configurable` | Advertises a JSON Schema for stream config |

## Key Files Reference

### Go API

| File | Purpose |
|------|---------|
| `api/integration/integration.go` | Core `Integration` interface (3 methods) + 5 optional capability interfaces, shared types |
| `api/core/server.go` | `RegisterIntegration()`, `Setup()`, `GET /integrations`, `BuildValidStreamTypes()` |
| `api/core/streams.go` | Streams CRUD, dynamic `ValidStreamTypes`, `StreamLifecycle` hook dispatch |
| `api/core/handlers_webhook.go` | Sequin CDC webhook, iterates integrations for `CDCHandler` |
| `api/integrations/_template/template.go` | Documented Go scaffold with all interfaces |
| `api/integrations/finance/finance.go` | Finance: broadcast CDC, dashboard data, health proxy |
| `api/integrations/sports/sports.go` | Sports: broadcast CDC, dashboard data, health proxy |
| `api/integrations/rss/rss.go` | RSS: per-URL CDC routing, feed catalog, stream lifecycle |
| `api/integrations/fantasy/fantasy.go` | Fantasy: join-based CDC routing, Yahoo OAuth flow |
| `api/main.go` | Integration registration at startup |
| `api/INTEGRATIONS.md` | Full Go-layer developer guide (interface reference, lifecycle, helpers) |

### Browser Extension

| File | Purpose |
|------|---------|
| `extension/integrations/types.ts` | `FeedTabProps`, `IntegrationManifest`, `IntegrationTier` |
| `extension/integrations/registry.ts` | Registry Map, `getIntegration()`, `getAllIntegrations()`, `sortTabOrder()`, `TAB_ORDER` |
| `extension/integrations/hooks/useScrollrCDC.ts` | Generic CDC subscription hook (subscribe, upsert/remove, sort, validate, cap) |
| `extension/integrations/_template/FeedTab.tsx` | Documented scaffold for new FeedTab integrations |
| `extension/integrations/official/finance/FeedTab.tsx` | Finance tab: `useScrollrCDC('trades')`, renders TradeItem grid |
| `extension/integrations/official/sports/FeedTab.tsx` | Sports tab: `useScrollrCDC('games')`, renders GameItem grid |
| `extension/integrations/official/rss/FeedTab.tsx` | RSS tab: `useScrollrCDC('rss_items')`, renders RssItem list |
| `extension/entrypoints/scrollbar.content/FeedBar.tsx` | Generic feed shell, `DASHBOARD_KEY_MAP`, mounts active FeedTab |
| `extension/entrypoints/scrollbar.content/FeedTabs.tsx` | Registry-driven tab switcher |
| `extension/entrypoints/background/sse.ts` | SSE connection, CDC pass-through routing |
| `extension/entrypoints/background/messaging.ts` | Per-tab CDC subscriptions, `CDC_BATCH` routing |

### Web Frontend

| File | Purpose |
|------|---------|
| `myscrollr.com/src/integrations/types.ts` | `DashboardTabProps`, `IntegrationManifest` |
| `myscrollr.com/src/integrations/registry.ts` | Registry Map, `register()`, `getIntegration()`, `sortTabOrder()`, `TAB_ORDER` |
| `myscrollr.com/src/integrations/shared.tsx` | `StreamHeader`, `ToggleSwitch`, `InfoCard` shared components |
| `myscrollr.com/src/integrations/_template/DashboardTab.tsx` | Documented scaffold for new DashboardTab integrations |
| `myscrollr.com/src/integrations/official/finance/DashboardTab.tsx` | Finance stream config panel |
| `myscrollr.com/src/integrations/official/sports/DashboardTab.tsx` | Sports stream config panel |
| `myscrollr.com/src/integrations/official/fantasy/DashboardTab.tsx` | Fantasy stream config (Yahoo OAuth, league cards) |
| `myscrollr.com/src/integrations/official/rss/DashboardTab.tsx` | RSS stream config (feed management, catalog browser) |
| `myscrollr.com/src/routes/dashboard.tsx` | Generic dashboard shell (607 lines), renders active DashboardTab from registry |
| `myscrollr.com/src/hooks/useRealtime.ts` | SSE client, processes CDC records for all tables |
