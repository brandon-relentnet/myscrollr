## Display Tab Redesign Plan

This document describes the interaction and UI refinements for the Display tab. Apply the same UX to both surfaces:

- **Website**: the hosted demo/showcase (no install required).
- **Extension**: the Chrome Web Store build under `frontend_wxt/`.
  The goals are clearer status, less clutter inside dropdowns, and more intentional controls for each source.

### Core Pattern (applies to all sections)

- Keep draggable cards with master toggles.
- Header shows: icon + title only (status/description removed to keep height tight), plus a clear On/Off pill + toggle. Pills for counts can be used sparingly in the header if needed.
- When disabled, the body shows a short hint CTA instead of an empty state.
- Chevron rotates and header highlights when open. Persist open/closed per user (already stored).

### Sports Section

- Header status: “On · NFL · 6 games (live) · WS connected” or “Off · Not configured”.
- Body layout:
  - Quick sport chips (already implemented): NFL / NBA / MLB / NHL with On/Off badge.
  - Later: add highlight selector dropdown (“Live games”, “My teams only”, “All games”) and connection badge + Retry button.
  - Selected sports shown as chips with clear “X” to remove (future enhancement).

### Finance Section

- Implemented: preset cards for Stocks (S&P/NASDAQ/Dow + Custom modal) and Crypto (Popular coins + Custom), On/Off per category, concise descriptions, and badges. Subheaders removed to reduce height.
- Still to do: inline status (e.g., “Realtime: 12 symbols subscribed”), and richer counts/health indicators if desired.

### Fantasy Section

- Header status: “Signed in · Sport: NFL · Team: (none)” or “Off · Not signed in”.
- Header controls: sport chips (NFL / NBA / NHL), sign-in badge (“Sign in with Yahoo” / “Signed in”).
- Body layout:
  - League select and Team select stacked, with counts and a “Refresh leagues” button.
  - Inline error chip if backend errors; keep retry button visible.
  - Filters collapsed into a row: date picker, Show Bench/IL toggle, Sort dropdown.
  - After selection, show roster summary chip: “QB/RB/WR… · 9 starters · 5 bench”.

### RSS Section

- Header status: “On · 6 feeds · 4 categories” or “Off · Default feeds only”.
- Body layout:
  - Category groups; feeds as toggle chips.
  - Per-category Select All / None buttons.
  - Feed health badges (“OK” / “Error” / “Never fetched”).
  - Search bar; “Default feeds” quick toggle; “+ Add feed” button with validation.

### Pinned Section (if shown)

- Header status: “Pinned · Finance 3 · Sports 2 · Fantasy 1 · RSS 0”.
- Body layout: list by type with inline Remove and a “Clear all” (confirm).

### Micro-interactions

- Chevron rotation + background highlight on open.
- Tooltips on master toggles (“Controls whether this source appears in the ticker”).
- Persisted open/closed state and last selections (already present).
