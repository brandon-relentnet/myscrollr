# Schemas — Shared Contracts & Validation Schemas

## Purpose

Single source of truth for all data contracts shared across the integration platform: manifest schema, data source output schemas, widget interface contract, postMessage protocol, broker topic payloads, and API request/response types. Schemas defined here are used for validation (registry), code generation (SDKs), and documentation (portal).

## Why It Exists

Multiple components need to agree on the same data shapes — the registry validates manifests, SDKs generate typed interfaces, the broker validates message payloads, and the portal displays contract documentation. Without a single source, these definitions drift apart across components. Centralizing schemas here ensures consistency and enables automated code generation for both TypeScript and Python SDKs.

See [MARKETPLACE.md — API Contract & SDK](../MARKETPLACE.md#api-contract--sdk) for the contract definitions and [Integration Registry & Manifest](../MARKETPLACE.md#integration-registry--manifest) for the manifest schema.

## How It Fits

```
schemas/ (source of truth)
    │
    ├──► registry/    (validates manifests against schemas)
    ├──► sdk/typescript/  (generated TypeScript types)
    ├──► sdk/python/      (generated Pydantic models)
    ├──► broker/          (message payload validation)
    ├──► widgets/         (widget interface + postMessage protocol)
    └──► portal/          (rendered as API documentation)
```

- **Consumed by**: Every other component in `integrations/`
- **Format**: JSON Schema for validation, with codegen tooling to produce TypeScript types and Pydantic models
- **Relates to**: `registry/` (manifest validation), `sdk/` (type generation), `broker/` (payload schemas), `widgets/` (widget contract)

## What Goes Here

```
schemas/
├── README.md                   # This file
├── manifest.schema.json        # Integration manifest (see MARKETPLACE.md example)
├── security/
│   ├── allowed-domains.schema.json   # Network allowlist format
│   └── scope-justification.schema.json # Scope justification entries
├── data-source/
│   ├── response.schema.json    # GET /data response schema
│   └── schema.schema.json      # GET /schema response (self-describing data shape)
├── widget/
│   ├── manifest.schema.json    # Widget-specific manifest fields
│   └── messages.schema.json    # postMessage protocol (parent ↔ widget)
├── lifecycle/
│   ├── install.schema.json     # Install event payload
│   └── uninstall.schema.json   # Uninstall event payload
├── broker/
│   └── envelope.schema.json    # Standard broker message envelope
└── codegen/
    ├── generate-ts.sh          # Generate TypeScript types from schemas
    └── generate-py.sh          # Generate Pydantic models from schemas
```

**Tooling**: JSON Schema as the canonical format. Code generation via `json-schema-to-typescript` (npm) and `datamodel-code-generator` (Python/Pydantic).

## Security-Related Schemas

Several schemas exist specifically to support anti-phishing and anti-malware measures across the platform:

### Manifest security fields

The `manifest.schema.json` includes fields that `registry/` validates at submission time:

- **`allowed_domains`** (string array, required): External domains the integration communicates with. Enforced via CSP `connect-src` on widget iframes. Undeclared network calls are blocked. Defined in `security/allowed-domains.schema.json`.
- **`scope_justifications`** (object, required when scopes are requested): Maps each requested scope to a developer-provided explanation. Displayed on the Logto consent screen and to reviewers. Defined in `security/scope-justification.schema.json`.

```json
{
  "scopes": ["dashboard:write", "profile:read"],
  "scope_justifications": {
    "dashboard:write": "Adds a price ticker widget to your dashboard",
    "profile:read": "Personalizes the ticker with your preferred currency"
  },
  "allowed_domains": ["api.coingecko.com", "cdn.example.com"]
}
```

### Widget message protocol

`widget/messages.schema.json` defines the strict typed protocol for `postMessage` between parent and widget. Only messages matching this schema are processed by `widgets/src/messaging.ts` — anything else is silently dropped. This prevents widgets from sending crafted messages to exploit the parent frame.

## Key Decisions / Open Questions

- **Schema flexibility vs strict typing**: How rigid should data source schemas be? Strict typing catches errors but limits what integrations can express. See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **Versioning**: Schemas need versioning. Semver? How do breaking changes propagate to SDKs and existing integrations?
- **Codegen automation**: Run codegen in CI on schema changes, or manual process?
- **`postMessage` protocol**: The widget ↔ parent message schema needs a formal spec. See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
