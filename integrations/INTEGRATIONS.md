# Third-Party Integrations for Scrollr Extension

## Overview

This document outlines the architecture for allowing third-party developers to create pluggable integrations that render within the Scrollr extension's shadow DOM. The system leverages existing infrastructure (Redis, PostgreSQL, Sequin CDC) and WXT's architecture with a tiered sandboxing approach.

## Key Principles

1. **Strict Data Isolation**: Integrations cannot access data from other integrations or core Scrollr data
2. **Developer Self-Hosting**: Developers host their own data ingestion APIs; only UI code lives in the Scrollr repo
3. **Tiered Trust**: Different sandboxing levels based on integration verification status
4. **CDC-Driven**: All data flows through PostgreSQL → Sequin → Redis → Extension (same as core features)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Third-Party Integration System                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐   │
│  │ Developer   │   │ Integration  │   │ Scrollr API         │   │
│  │ submits PR  │──>│ Registry     │──>│ /integrations/*     │   │
│  │ + manifest  │   │ (PostgreSQL) │   │                     │   │
│  └─────────────┘   └──────────────┘   └─────────────────────┘   │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────────┐   │
│  │ Developer   │   │ Redis        │   │ Extension           │   │
│  │ API pushes  │──>│ Pub/Sub      │──>│ Dynamic Tabs        │   │
│  │ data        │   │ (per-user)   │   │ (Shadow DOM)        │   │
│  └─────────────┘   └──────────────┘   └─────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Hosting Model

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **UI Components** | Scrollr monorepo (`integrations/`) | Submitted via PR, built with extension |
| **Backend API** | Developer-hosted | Fetches data, authenticates users, pushes to Scrollr API |
| **Data Storage** | Scrollr PostgreSQL | Stores integration data per-user for CDC |
| **Real-time Delivery** | Scrollr infrastructure | CDC → Redis Pub/Sub → SSE → Extension |

## Tiered Security Model

Based on integration verification status, different sandboxing methods are applied:

| Integration Type | Sandbox Method | Trust Level | Review Process |
|-----------------|----------------|-------------|----------------|
| **Official** | Shadow DOM + Standard CSP | Full trust | Built by Scrollr team |
| **Verified** | Shadow DOM + Strict CSP | High trust | Manual code review required |
| **Unverified** | WebWorker + Proxied APIs | Limited trust | Self-published, automated checks only |

### Shadow DOM + CSP (Official & Verified)

```
┌─────────────────────────────────────────────────────────────┐
│ Scrollr Extension (Content Script)                           │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ Shadow DOM (scrollr-feed)                               │  │
│ │ ┌───────────────────────────────────────────────────┐  │  │
│ │ │ Integration Tab Component                         │  │  │
│ │ │ - Direct React rendering                          │  │  │
│ │ │ - No fetch/XHR (data via props only)              │  │  │
│ │ │ - eval/Function disabled via CSP                  │  │  │
│ │ │ - CSS scoped to shadow root                       │  │  │
│ │ └───────────────────────────────────────────────────┘  │  │
│ └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Integration can use React naturally (direct DOM access to shadow root)
- Good developer experience - familiar patterns
- CSS is naturally isolated via shadow DOM
- Data passed as props - no network access needed in component

**Cons:**
- Requires thorough code review for verified integrations
- Must ensure no malicious code in PR

### WebWorker + Messaging Proxy (Unverified)

```
┌─────────────────────────────────────────────────────────────┐
│ Scrollr Extension                                            │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ Main Thread                                             │  │
│ │ - Renders generic integration wrapper                   │  │
│ │ - Sends data to Worker                                  │  │
│ │ - Receives render instructions (virtual DOM)            │  │
│ └─────────────────────────────────────────────────────────┘  │
│                            │ postMessage                     │
│                            v                                 │
│ ┌─────────────────────────────────────────────────────────┐  │
│ │ WebWorker (Sandboxed)                                   │  │
│ │ - Integration logic runs here                           │  │
│ │ - No DOM access, no window scope                        │  │
│ │ - Returns virtual DOM structure                         │  │
│ │ - Crashes don't affect extension                        │  │
│ └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Complete isolation from extension and page
- Safe to run untrusted code
- Crashes contained to worker

**Cons:**
- More complex development model
- Limited to simple UI patterns
- Performance overhead for complex UIs

## Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Developer      │     │   Scrollr API   │     │   Sequin CDC    │
│  Backend API    │────>│   POST /int/    │────>│   detects       │
│  pushes data    │     │   :slug/data    │     │   changes       │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 v                       v
                        ┌─────────────────┐     ┌─────────────────┐
                        │   PostgreSQL    │     │   Webhook to    │
                        │   integration_  │────>│   Go API        │
                        │   data table    │     │                 │
                        └─────────────────┘     └────────┬────────┘
                                                         │
                                                         v
                                                ┌─────────────────┐
                                                │   Redis Pub/Sub │
                                                │   per-user      │
                                                │   channels      │
                                                └────────┬────────┘
                                                         │
                                                         v
                                                ┌─────────────────┐
                                                │   Extension SSE │
                                                │   processes CDC │
                                                └────────┬────────┘
                                                         │
                                         ┌───────────────┴───────────────┐
                                         v                               v
                                ┌─────────────────┐             ┌─────────────────┐
                                │   Background    │             │   Content UI    │
                                │   updates       │────────────>│   renders       │
                                │   state         │  broadcast  │   integration   │
                                └─────────────────┘             └─────────────────┘
```

## Database Schema

### integration_definitions

Metadata about registered integrations. Created programmatically on API startup.

```sql
CREATE TABLE IF NOT EXISTS integration_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            VARCHAR(100) NOT NULL UNIQUE,   -- URL-friendly identifier (e.g., "crypto-prices")
    developer_id    VARCHAR(255) NOT NULL,          -- Developer's logto_sub
    name            VARCHAR(255) NOT NULL,          -- Display name (e.g., "Crypto Prices")
    description     TEXT,                           -- Short description for marketplace
    version         VARCHAR(50) NOT NULL,           -- Semantic version (e.g., "1.0.0")
    manifest        JSONB NOT NULL,                 -- Full integration manifest
    icon_url        TEXT,                           -- Integration icon URL
    status          VARCHAR(50) DEFAULT 'unverified',  -- official, verified, unverified, suspended
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    approved_at     TIMESTAMPTZ,
    approved_by     VARCHAR(255)                    -- Admin logto_sub who approved
);

CREATE INDEX IF NOT EXISTS idx_integration_definitions_status ON integration_definitions(status);
CREATE INDEX IF NOT EXISTS idx_integration_definitions_developer ON integration_definitions(developer_id);
```

### user_integrations

Which integrations each user has enabled. Follows same pattern as `user_streams`.

```sql
CREATE TABLE IF NOT EXISTS user_integrations (
    id              SERIAL PRIMARY KEY,
    logto_sub       VARCHAR(255) NOT NULL,
    integration_id  UUID NOT NULL REFERENCES integration_definitions(id) ON DELETE CASCADE,
    config          JSONB DEFAULT '{}',             -- User-specific configuration
    enabled         BOOLEAN DEFAULT TRUE,
    visible         BOOLEAN DEFAULT TRUE,           -- Show in tab bar
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(logto_sub, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations(logto_sub);
```

### integration_data

CDC table for integration-specific data. Routed to users via `logto_sub`.

```sql
CREATE TABLE IF NOT EXISTS integration_data (
    id              SERIAL PRIMARY KEY,
    integration_id  UUID NOT NULL REFERENCES integration_definitions(id) ON DELETE CASCADE,
    logto_sub       VARCHAR(255) NOT NULL,          -- Target user for CDC routing
    data_type       VARCHAR(255) NOT NULL,          -- Category (e.g., "price", "alert")
    data_key        VARCHAR(255) NOT NULL,          -- Unique key for upserts (e.g., "BTC-USD")
    payload         JSONB NOT NULL,                 -- The actual data
    expires_at      TIMESTAMPTZ,                    -- Optional TTL for auto-cleanup
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(integration_id, logto_sub, data_type, data_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_data_routing ON integration_data(integration_id, logto_sub);
CREATE INDEX IF NOT EXISTS idx_integration_data_expires ON integration_data(expires_at) WHERE expires_at IS NOT NULL;
```

### integration_api_keys

API keys for developer data ingestion. Keys are hashed with bcrypt.

```sql
CREATE TABLE IF NOT EXISTS integration_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id  UUID NOT NULL REFERENCES integration_definitions(id) ON DELETE CASCADE,
    key_hash        VARCHAR(255) NOT NULL,          -- bcrypt hash of API key
    key_prefix      VARCHAR(12) NOT NULL UNIQUE,    -- First 8 chars for identification (e.g., "scrollr_")
    name            VARCHAR(255),                   -- Key name/description
    scopes          JSONB DEFAULT '["data:write"]', -- Allowed operations
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_api_keys_integration ON integration_api_keys(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_prefix ON integration_api_keys(key_prefix);
```

## Integration Manifest Specification

Developers provide a manifest file (`scrollr.manifest.json`) in their integration directory:

```typescript
interface IntegrationManifest {
  // Required metadata
  id: string;                      // Must match directory name (e.g., "crypto-prices")
  name: string;                    // Display name (e.g., "Crypto Prices")
  version: string;                 // Semantic version (e.g., "1.0.0")
  
  author: {
    name: string;
    email?: string;
    url?: string;
    github: string;                // GitHub username (required for PR verification)
  };
  
  description: {
    short: string;                 // Max 120 chars, shown in marketplace
    long?: string;                 // Full description (markdown supported)
  };
  
  // Data types this integration handles
  dataTypes: {
    [key: string]: {
      description: string;
      schema?: object;             // JSON Schema for validation (optional)
      ttl?: number;                // Auto-expire after N seconds (optional)
    };
  };
  
  // UI configuration
  ui: {
    tab: {
      label: string;               // Tab label (max 12 chars)
      icon?: string;               // Inline SVG or path to .svg file
      order?: number;              // Tab ordering (default: 100, lower = left)
    };
    
    component: string;             // Exported component name (e.g., "CryptoPricesTab")
    
    // Display mode configurations
    modes: {
      comfort: {
        columns?: 1 | 2 | 3 | 4;   // Grid columns (default: 1)
        itemHeight?: number;       // Approximate item height in px
      };
      compact: {
        columns?: 1 | 2 | 3 | 4;
        itemHeight?: number;
      };
    };
  };
  
  // Optional: URL patterns where integration is contextually relevant
  contextualSites?: string[];
  
  // Privacy declaration (enforced, not configurable)
  privacy: {
    dataAccess: 'own_only';        // Always 'own_only' - no cross-integration data
    networkAccess: false;          // Components cannot make network requests
  };
}
```

### Example Manifest

```json
{
  "id": "crypto-prices",
  "name": "Crypto Prices",
  "version": "1.0.0",
  "author": {
    "name": "Alice Developer",
    "email": "alice@example.com",
    "github": "alicedev"
  },
  "description": {
    "short": "Real-time cryptocurrency prices with customizable watchlists",
    "long": "Track your favorite cryptocurrencies with real-time price updates. Features include customizable watchlists, price alerts, and 24h change indicators."
  },
  "dataTypes": {
    "price": {
      "description": "Current price data for a cryptocurrency pair",
      "schema": {
        "type": "object",
        "properties": {
          "symbol": { "type": "string" },
          "price": { "type": "number" },
          "change_24h": { "type": "number" },
          "volume_24h": { "type": "number" }
        },
        "required": ["symbol", "price"]
      }
    },
    "alert": {
      "description": "Triggered price alerts",
      "ttl": 86400
    }
  },
  "ui": {
    "tab": {
      "label": "Crypto",
      "icon": "<svg viewBox='0 0 24 24' fill='currentColor'><path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z'/></svg>",
      "order": 50
    },
    "component": "CryptoPricesTab",
    "modes": {
      "comfort": { "columns": 4, "itemHeight": 72 },
      "compact": { "columns": 1, "itemHeight": 28 }
    }
  },
  "contextualSites": [
    "*://*.coinmarketcap.com/*",
    "*://*.coingecko.com/*",
    "*://*.binance.com/*"
  ],
  "privacy": {
    "dataAccess": "own_only",
    "networkAccess": false
  }
}
```

## Integration Component Contract

Integration components receive data via props and must not make network requests:

```typescript
// Type definition for integration components
interface IntegrationComponentProps<T = unknown> {
  // Data organized by data_type -> data_key -> payload
  data: Record<string, Record<string, T>>;
  
  // Current display mode
  mode: 'comfort' | 'compact';
  
  // Mode-specific config from manifest
  modeConfig: {
    columns?: number;
    itemHeight?: number;
  };
  
  // User's integration config (if any)
  userConfig: Record<string, unknown>;
}

// Example integration component
export function CryptoPricesTab({ data, mode, modeConfig }: IntegrationComponentProps<CryptoPrice>) {
  const prices = data.price ?? {};
  const alerts = data.alert ?? {};
  
  return (
    <div className={clsx(
      'grid gap-px bg-zinc-800',
      modeConfig.columns === 4 && 'grid-cols-4',
      modeConfig.columns === 1 && 'grid-cols-1',
    )}>
      {Object.entries(prices).map(([key, price]) => (
        <CryptoItem key={key} price={price} mode={mode} />
      ))}
    </div>
  );
}
```

## API Endpoints

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/integrations` | List approved integrations (marketplace) |
| `GET` | `/integrations/:slug` | Get integration details by slug |

### Protected Endpoints (User Auth via LogtoAuth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me/integrations` | List user's enabled integrations |
| `POST` | `/users/me/integrations` | Enable an integration |
| `PUT` | `/users/me/integrations/:id` | Update user's integration config |
| `DELETE` | `/users/me/integrations/:id` | Disable an integration |

### Developer Endpoints (Logto Auth + Developer Role)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/developers/me/integrations` | List developer's own integrations |
| `PUT` | `/developers/me/integrations/:slug` | Update integration metadata |
| `POST` | `/developers/me/integrations/:slug/keys` | Create API key |
| `GET` | `/developers/me/integrations/:slug/keys` | List API keys (masked) |
| `DELETE` | `/developers/me/integrations/:slug/keys/:id` | Revoke API key |

### Data Ingestion Endpoints (API Key Auth)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/integrations/:slug/data` | Push data for user(s) |
| `DELETE` | `/integrations/:slug/data` | Delete data by key(s) |

#### Data Push Request Format

Single item:
```json
{
  "user_id": "logto_sub_value",
  "data_type": "price",
  "data_key": "BTC-USD",
  "payload": {
    "symbol": "BTC",
    "price": 45000.50,
    "change_24h": 2.5
  },
  "ttl": 3600
}
```

Batch (up to 100 items):
```json
{
  "items": [
    {
      "user_id": "user_logto_sub_1",
      "data_type": "price",
      "data_key": "BTC-USD",
      "payload": { "symbol": "BTC", "price": 45000.50 }
    },
    {
      "user_id": "user_logto_sub_2",
      "data_type": "price",
      "data_key": "ETH-USD",
      "payload": { "symbol": "ETH", "price": 2500.00 }
    }
  ]
}
```

#### Response Format

```json
{
  "status": "ok",
  "processed": 2,
  "errors": []
}
```

With partial failures:
```json
{
  "status": "partial",
  "processed": 1,
  "errors": [
    { "index": 1, "error": "User not subscribed to integration" }
  ]
}
```

## Extension Implementation

### New Types

```typescript
// extension/utils/types.ts additions

export type IntegrationStatus = 'official' | 'verified' | 'unverified' | 'suspended';

export interface IntegrationManifest {
  id: string;
  name: string;
  version: string;
  author: { name: string; github: string };
  description: { short: string };
  dataTypes: Record<string, { description: string }>;
  ui: {
    tab: { label: string; icon?: string; order?: number };
    component: string;
    modes: {
      comfort: { columns?: number; itemHeight?: number };
      compact: { columns?: number; itemHeight?: number };
    };
  };
}

export interface IntegrationDefinition {
  id: string;              // UUID
  slug: string;
  name: string;
  version: string;
  description: string;
  icon_url?: string;
  status: IntegrationStatus;
  manifest: IntegrationManifest;
}

export interface UserIntegration {
  id: number;
  integration_id: string;
  integration: IntegrationDefinition;
  config: Record<string, unknown>;
  enabled: boolean;
  visible: boolean;
}

export interface IntegrationDataPayload {
  integration_id: string;
  data_type: string;
  data_key: string;
  payload: Record<string, unknown>;
}
```

### New Storage Items

```typescript
// extension/utils/storage.ts additions

/** User's enabled integrations (synced from server) */
export const userIntegrations = storage.defineItem<UserIntegration[]>(
  'local:userIntegrations',
  { fallback: [], version: 1 }
);
```

### CDC Processing

```typescript
// extension/entrypoints/background/sse.ts additions

// In-memory integration data state
let integrationData: Record<string, Record<string, Record<string, unknown>>> = {};
// Structure: integrationData[integration_id][data_type][data_key] = payload

export function getIntegrationData() {
  return integrationData;
}

function processIntegrationDataCDC(record: Record<string, unknown>) {
  const integrationId = record.integration_id as string;
  const dataType = record.data_type as string;
  const dataKey = record.data_key as string;
  const payload = record.payload as Record<string, unknown>;
  
  // Initialize nested structure
  if (!integrationData[integrationId]) {
    integrationData[integrationId] = {};
  }
  if (!integrationData[integrationId][dataType]) {
    integrationData[integrationId][dataType] = {};
  }
  
  // Upsert
  integrationData[integrationId][dataType][dataKey] = payload;
}

function removeIntegrationDataCDC(record: Record<string, unknown>) {
  const integrationId = record.integration_id as string;
  const dataType = record.data_type as string;
  const dataKey = record.data_key as string;
  
  delete integrationData[integrationId]?.[dataType]?.[dataKey];
}

// Add to processCDCRecord switch statement:
case 'integration_data':
  if (cdc.action === 'delete') {
    removeIntegrationDataCDC(cdc.record);
  } else {
    processIntegrationDataCDC(cdc.record);
  }
  // Broadcast update
  onUpdate?.('integration', { 
    integrationId: cdc.record.integration_id,
    data: integrationData[cdc.record.integration_id as string] 
  });
  break;

case 'user_integrations':
  if (cdc.action === 'insert' || cdc.action === 'update') {
    handleUserIntegrationUpdate(cdc.record);
  } else if (cdc.action === 'delete') {
    handleUserIntegrationDelete(cdc.record);
  }
  break;
```

### Webhook Routing

```go
// api/handlers_webhook.go additions

case "integration_data":
    routeIntegrationData(ctx, rec.Record, payload)

case "user_integrations":
    routeToRecordOwner(rec.Record, "logto_sub", payload)

func routeIntegrationData(ctx context.Context, record map[string]interface{}, payload []byte) {
    logtoSub, ok := record["logto_sub"].(string)
    if !ok || logtoSub == "" {
        return
    }
    SendToUser(logtoSub, payload)
}
```

## Developer Onboarding Flow

### 1. Repository Structure

```
integrations/
├── INTEGRATIONS.md              # This document
├── _template/                   # Template for new integrations
│   ├── scrollr.manifest.json
│   ├── src/
│   │   ├── index.ts             # Exports main component
│   │   └── ExampleTab.tsx
│   └── README.md
├── crypto-prices/               # Example integration
│   ├── scrollr.manifest.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── CryptoPricesTab.tsx
│   │   └── CryptoItem.tsx
│   └── README.md
└── weather/
    ├── scrollr.manifest.json
    ├── src/
    │   ├── index.ts
    │   └── WeatherTab.tsx
    └── README.md
```

### 2. Development Workflow

1. **Fork & Clone**: Developer forks the Scrollr repository
2. **Create Integration**: Copy `_template/` to `integrations/{slug}/`
3. **Implement Component**: Build React component following the contract
4. **Update Manifest**: Fill in `scrollr.manifest.json` with metadata
5. **Test Locally**: Run extension in dev mode with integration
6. **Submit PR**: Open pull request to `main` branch

### 3. PR Review Process

```
┌─────────────────┐
│   PR Submitted  │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────┐
│  Automated Checks (CI)              │
│  - Manifest schema validation       │
│  - TypeScript compilation           │
│  - Component exports check          │
│  - No network imports               │
│  - Bundle size limits               │
└────────┬────────────────────────────┘
         │
         ├──── Pass ────┐
         │              v
         │     ┌─────────────────┐
         │     │ Request Status? │
         │     └────────┬────────┘
         │              │
         │    ┌─────────┴─────────┐
         │    v                   v
         │  Unverified        Verified
         │    │                   │
         │    v                   v
         │  Auto-merge      Manual Review
         │    │              - Security
         │    │              - Code quality
         │    │              - UX review
         │    │                   │
         │    └─────────┬─────────┘
         │              v
         │     ┌─────────────────┐
         │     │ Merge & Deploy  │
         │     └────────┬────────┘
         │              │
         v              v
┌─────────────────────────────────────┐
│  Integration Available              │
│  - Entry added to registry          │
│  - Developer can generate API keys  │
└─────────────────────────────────────┘
```

### 4. API Key Generation

After PR is merged:

1. Developer authenticates via Scrollr
2. Navigates to Developer Dashboard (or uses CLI)
3. Generates API key for their integration
4. Uses key to push data from their backend

## Error Handling

### Data Ingestion Errors

| Error Code | Description |
|------------|-------------|
| `400` | Invalid request format |
| `401` | Invalid or expired API key |
| `403` | API key doesn't match integration |
| `404` | Integration not found |
| `422` | Payload validation failed (schema mismatch) |
| `429` | Rate limit exceeded (1000 req/min default) |

### Extension Errors

- **Integration Load Failure**: Show error state in tab, log to console
- **Component Crash**: Catch with error boundary, show fallback UI
- **Data Parse Error**: Log warning, skip malformed record

## Future Considerations

### Revenue Share (Planned)

- Paid integrations may be supported in the future
- Revenue share model TBD
- Will require Stripe integration

### Potential Enhancements

- Integration ratings/reviews
- Usage analytics for developers
- CLI tool for scaffolding
- Hot-reload during development

---

## TODO List

### Phase 1: Database & Core API (Priority: High)

- [ ] Create `integration_definitions` table in `api/database.go`
- [ ] Create `user_integrations` table in `api/database.go`
- [ ] Create `integration_data` table in `api/database.go`
- [ ] Create `integration_api_keys` table in `api/database.go`
- [ ] Add Sequin CDC tracking for `integration_data` table
- [ ] Add Sequin CDC tracking for `user_integrations` table
- [ ] Create `api/integrations.go` with CRUD handlers
- [ ] Implement `GET /integrations` endpoint (marketplace list)
- [ ] Implement `GET /integrations/:slug` endpoint
- [ ] Implement `GET /users/me/integrations` endpoint
- [ ] Implement `POST /users/me/integrations` endpoint
- [ ] Implement `PUT /users/me/integrations/:id` endpoint
- [ ] Implement `DELETE /users/me/integrations/:id` endpoint
- [ ] Create `api/integrations_data.go` for data ingestion
- [ ] Implement `POST /integrations/:slug/data` endpoint
- [ ] Implement `DELETE /integrations/:slug/data` endpoint
- [ ] Create API key authentication middleware
- [ ] Create `api/integrations_keys.go` for key management
- [ ] Update `api/handlers_webhook.go` to route `integration_data`
- [ ] Update `api/handlers_webhook.go` to route `user_integrations`
- [ ] Add integration data to dashboard response

### Phase 2: Extension Framework (Priority: High)

- [ ] Add integration types to `extension/utils/types.ts`
- [ ] Add `userIntegrations` storage item to `extension/utils/storage.ts`
- [ ] Update `extension/utils/messaging.ts` with integration message types
- [ ] Add integration CDC processing to `extension/entrypoints/background/sse.ts`
- [ ] Create `extension/entrypoints/background/integrations.ts` for state management
- [ ] Update `extension/entrypoints/scrollbar.content/App.tsx` to handle integrations
- [ ] Update `extension/entrypoints/scrollbar.content/FeedTabs.tsx` for dynamic tabs
- [ ] Update `extension/entrypoints/scrollbar.content/FeedBar.tsx` to render integration tabs
- [ ] Create `extension/entrypoints/scrollbar.content/IntegrationTab.tsx`
- [ ] Add integration loading states to UI
- [ ] Add integration error boundary

### Phase 3: Sandboxing (Priority: Medium)

- [ ] Define CSP policy for verified integrations in `extension/wxt.config.ts`
- [ ] Create component loader with trust-level checks
- [ ] Implement WebWorker sandbox for unverified integrations
- [ ] Create WebWorker message protocol
- [ ] Create `SandboxedIntegration` wrapper component
- [ ] Test sandbox isolation (DOM, network, storage)
- [ ] Document security model for reviewers

### Phase 4: Developer Experience (Priority: Medium)

- [ ] Create `integrations/_template/` directory structure
- [ ] Create `scrollr.manifest.schema.json` for validation
- [ ] Create `@scrollr/integration-types` package (or inline types)
- [ ] Add manifest validation to extension build
- [ ] Create example integration (`crypto-prices`)
- [ ] Set up GitHub Actions for integration PR checks
- [ ] Write integration developer guide (`integrations/DEVELOPER_GUIDE.md`)
- [ ] Create integration testing utilities

### Phase 5: Dashboard & Management (Priority: Low)

- [ ] Add integrations marketplace page to `myscrollr.com`
- [ ] Add "My Integrations" section to dashboard
- [ ] Add integration enable/disable/configure UI
- [ ] Create developer dashboard for API key management
- [ ] Add integration usage analytics

### Phase 6: Documentation & Polish (Priority: Low)

- [ ] Write integration submission guidelines
- [ ] Document all API endpoints with examples
- [ ] Create integration showcase page
- [ ] Add integration status badges
- [ ] Create review checklist for maintainers
- [ ] Add integration search/filtering to marketplace

### Deferred / Future

- [ ] Revenue share infrastructure
- [ ] Paid integrations support
- [ ] Integration ratings/reviews system
- [ ] Integration update/versioning workflow
- [ ] Integration deprecation workflow
- [ ] CLI tool (`@scrollr/cli`) for development
- [ ] Analytics dashboard for developers
- [ ] Webhook notifications for developers
