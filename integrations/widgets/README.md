# Widgets — Widget Rendering & Iframe Sandbox

## Purpose

Handles the secure rendering of third-party widget code in the MyScrollr React frontend. Manages the sandboxed iframe environment, parent ↔ widget communication protocol (`postMessage`), theming integration, and widget lifecycle (load, resize, destroy).

## Why It Exists

Dashboard widgets are custom UI components built by third-party developers. Running untrusted code inside the main React app would be a security risk. Sandboxed iframes provide isolation — widgets can't access the parent DOM, cookies, or same-origin resources. This component defines the sandbox contract, communication protocol, and React components that host widgets.

See [MARKETPLACE.md — Widget Rendering](../MARKETPLACE.md#widget-rendering--sandboxed-iframes) for the security model and library choices.

## How It Fits

```
┌────────────────────────────────────────────────┐
│              React Frontend (myscrollr.com/)    │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  Dashboard                                │  │
│  │  ┌────────────┐  ┌────────────┐          │  │
│  │  │ Widget     │  │ Widget     │ ◄── sandboxed iframes
│  │  │ (iframe)   │  │ (iframe)   │          │  │
│  │  └─────┬──────┘  └─────┬──────┘          │  │
│  │        │ postMessage    │ postMessage     │  │
│  │        ▼                ▼                 │  │
│  │  ┌──────────────────────────────────┐    │  │
│  │  │  Widget Host (widgets/ code)     │    │  │
│  │  │  Theme sync, resize, data pass   │    │  │
│  │  └──────────────────────────────────┘    │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

- **Embedded in**: React frontend (`myscrollr.com/`)
- **Loads from**: Widget `GET /bundle` endpoint (developer-hosted)
- **Communicates via**: `postMessage` API between parent frame and widget iframe
- **Relates to**: `myscrollr.com/` (React dashboard where widgets render), `schemas/` (widget manifest and postMessage protocol specs), `sdk/typescript/` (widget development SDK)

## What Goes Here

```
widgets/
├── README.md               # This file
├── src/
│   ├── WidgetHost.tsx      # React component that renders sandboxed iframe
│   ├── WidgetContainer.tsx # Layout wrapper with resize handling
│   ├── messaging.ts        # postMessage protocol (send/receive typed messages)
│   ├── theme.ts            # Theme sync between parent and widget
│   └── security.ts         # CSP headers, sandbox attribute management
├── types/
│   └── widget.d.ts         # TypeScript types for widget interface contract
└── tests/
```

**Libraries**: `react-safe-src-doc-iframe` (GoDaddy) for safety guards, native `postMessage` API.

## Security Model

Widgets are untrusted third-party code rendered inside the user's authenticated session. The primary threat is a widget displaying phishing UI (fake login forms, "session expired" prompts) or exfiltrating data. Defenses are layered:

### Iframe sandbox policy

```html
<iframe
  src="..."
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
  loading="lazy"
/>
```

**Critical rule**: Never grant `allow-same-origin` and `allow-scripts` together. A widget with both can remove its own `sandbox` attribute via JS and escape isolation entirely.

| Sandbox flag | Granted? | Rationale |
|-------------|----------|-----------|
| `allow-scripts` | Yes | Widgets need JS to function |
| `allow-same-origin` | **No** | Would let widget access parent cookies, localStorage, and escape sandbox |
| `allow-forms` | **No** | Blocks `<form>` submissions — a phishing form can render but can't POST |
| `allow-popups` | **No** | Prevents opening new windows (redirect-based phishing) |
| `allow-top-navigation` | **No** | Prevents widget from redirecting the parent page to a phishing site |

### Content Security Policy

- `frame-src` whitelist restricted to registered integration `base_url` domains only
- `X-Frame-Options` and `Content-Security-Policy` headers on the parent app
- Widget bundles must be served over HTTPS (enforced by manifest validation in `registry/`)

### Bundle integrity — preventing bait-and-switch

Since widgets are self-hosted, a developer could pass review and then change the served code. Three defense layers:

1. **Bundle hash pinning**: At submission time, fetch the bundle, compute SHA-256 hash, store in the registry. `health/` periodically re-fetches and compares. Hash mismatch without a new version submission triggers automatic suspension.
2. **Subresource Integrity (SRI)**: If bundles are proxied through MyScrollr's CDN, the `WidgetHost` enforces SRI on the loaded resource.
3. **Bundle proxying** (recommended): Serve approved bundles from MyScrollr's CDN instead of loading directly from developer servers. New versions go through re-review before the cache updates. Eliminates the bait-and-switch window entirely. See [Key Decisions](#key-decisions--open-questions) for trade-offs.

### Static analysis on widget bundles

Run at submission time and on periodic re-scans by `registry/`:

- **Phishing patterns**: `<input type="password">`, `<form action="...">`, references to `document.cookie`, `localStorage`, `navigator.credentials`
- **Sandbox escape attempts**: `window.top`, `window.parent.location`, `document.domain` manipulation
- **Undeclared network calls**: `fetch()` / `XMLHttpRequest` to domains not listed in the manifest's `allowed_domains` field
- **Dangerous APIs**: `eval()`, `new Function()`, dynamic `<script>` injection

### postMessage hardening

- Always validate `event.origin` against the widget's registered `base_url` before processing any message
- Define a strict typed protocol in `schemas/widget/messages.schema.json` — reject any message not matching the schema
- Auth tokens passed via `postMessage` (not URL params) to avoid leaking in referrer headers or server logs

## Key Decisions / Open Questions

- **`postMessage` protocol spec**: What messages can flow between parent and widget? Theme changes, resize events, data passing — needs a formal protocol definition. See [MARKETPLACE.md — Open Questions](../MARKETPLACE.md#open-questions).
- **CDN/caching for widget bundles**: Should widget JS bundles be cached/proxied through MyScrollr's CDN, or loaded directly from the developer's server? See [BUNDLE_PROXY.md](./BUNDLE_PROXY.md) for a full infrastructure analysis.
- **Module federation vs iframe**: Iframes are the current recommendation for security. Module federation (Webpack 5) offers tighter integration but weaker isolation. Is iframe-only sufficient?
- **Widget size constraints**: What are the allowed widget dimensions? Fixed sizes, responsive, or developer-defined?
