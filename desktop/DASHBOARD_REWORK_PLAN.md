# Dashboard Rework Plan

## Goal

Make the dashboard the single management hub. Every common action (ticker toggle, remove, reorder) is doable without leaving the dashboard. Detail views are for viewing data (Feed) and configuring sources (Configure). No modal edit modes.

## Design Decisions

- **Source management actions** (ticker toggle, remove, reorder) go **directly on dashboard cards**
- **Kill edit mode entirely** — reorder always available, card display prefs move to per-source Configure tab
- **Two tabs per source**: Feed + Configure (drop About, rename Settings → Configure)
- **Ticker status dot** always visible on each card (channel hex when on, muted when off)
- **About tab content** dropped entirely

## New Dashboard Card Layout

```
┌─ accent bar ─────────────────────────────────────────┐
│ [icon] Name                        [●] [⚙] [▲▼] [✕] │
│                                                       │
│   Summary content (stocks, scores, headlines, etc.)   │
│                                                       │
└───────────────────────────────────────────────────────┘
```

| Element | Visibility | Behavior |
|---|---|---|
| `●` ticker dot | Always visible | 6px dot. Channel hex when on ticker, muted when off. Clickable to toggle. |
| `[icon] Name` | Always visible | Clickable → navigates to `/channel/$type/feed` or `/widget/$id/feed` |
| sliders icon | On card hover (stays lit when active) | Toggles inline card display editor below summary. Customize what data the card shows. |
| `⚙` gear | On card hover | Navigates to `/channel/$type/configuration` or `/widget/$id/configuration` |
| `▲ ▼` arrows | On card hover | Reorder within panel. undefined/disabled when first/last. |
| `✕` remove | On card hover | Two-click confirm: first click arms (red + "Remove?"), second executes. 3s auto-disarm. |

All cards use header-click navigation (no more channel vs widget asymmetry).

## Files to Change

### Phase 1: Rewrite `components/dashboard/DashboardCard.tsx`

**Remove:**
- `editing`, `headerClickOnly`, `schema`, `editorValues`, `onEditorChange` props
- All edit-mode conditional rendering
- `CardEditor` import
- `fullCardClick` / widget full-card-click behavior

**Add new props:**
```typescript
interface DashboardCardProps {
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hex: string;
  onClick: () => void;
  onConfigure: () => void;
  children: React.ReactNode;
  tickerEnabled: boolean;
  onToggleTicker: () => void;
  onMoveUp?: () => void;    // undefined = first item (disabled)
  onMoveDown?: () => void;  // undefined = last item (disabled)
  onRemove: () => void;
}
```

**Add:**
- Always-visible ticker dot (left of hover controls)
- Hover-revealed action group: gear, up/down arrows, remove ×
- Internal two-click delete confirmation state (arm → confirm → 3s disarm)
- All cards use header-click-only navigation pattern

**Keep:** GhostCard unchanged.

### Phase 2: Rewrite `routes/feed.tsx`

**Remove:**
- `editing` state, toggle button, edit-mode grid class
- `Pencil`, `Check` icon imports
- `CardEditor`-related imports: `CHANNEL_SCHEMAS`, `WIDGET_SCHEMAS`, `CHANNEL_PREFS_KEY`, `WIDGET_PREFS_KEY`, `EditorField`, `DashboardCardPrefs` type import
- `handleCardPrefChange` callback
- Schema/editor props passed to DashboardCard
- Edit-mode auto-exit `useEffect`

**Add to each channel card:**
- `tickerEnabled={ch.visible}`
- `onToggleTicker={() => onToggleChannelTicker(ch.channel_type, !ch.visible)}`
- `onRemove={() => onDeleteChannel(ch.channel_type)}`
- `onMoveUp` / `onMoveDown` — same moveItem logic, always passed (not gated on editing)

**Add to each widget card:**
- `tickerEnabled={shell.prefs.widgets.widgetsOnTicker.includes(widget.id)}`
- `onToggleTicker={() => onToggleWidgetTicker(widget.id)}`
- `onRemove={() => onToggleWidget(widget.id)}`
- Same reorder pattern

**Keep:** Two-panel layout, ghost cards, card order state, summary renderers, `cardPrefs` state (read-only for summaries now).

**Note:** `cardPrefs` stays loaded from localStorage for summary rendering. No longer editable on dashboard — editing happens in Configure tabs. Add storage event listener to re-sync if prefs change while on dashboard.

### Phase 3: Modify `routes/channel.$type.$tab.tsx`

**Tab changes:**
- TABS: `[{ key: "feed", label: "Feed" }, { key: "configuration", label: "Configure" }]`
- Remove `ChannelInfoTab` component entirely
- Remove `tab === "info"` rendering branch

**Config tab changes:**
- Remove "Source" management section (ticker toggle + delete button)
- Remove `Trash2` import, delete confirmation state/refs
- Add "Dashboard Card" section at bottom with `CardEditor`:
  - Import `CardEditor`, `loadCardPrefs`, `saveCardPrefs`, channel schemas from dashboardPrefs
  - Local state: `useState(loadCardPrefs)` for card prefs
  - Render `CardEditor` with the channel's schema and prefs slice

### Phase 4: Modify `routes/widget.$id.$tab.tsx`

Same treatment as Phase 3:
- Drop About tab (delete `WidgetInfoTab`)
- Rename Settings → Configure
- Remove "Source" section
- Add "Dashboard Card" section with `CardEditor` and widget schemas

### Phase 5: Cleanup

- `CardEditor.tsx` — keep (used by config tabs)
- `dashboardPrefs.ts` — keep (schemas still needed)
- Remove stale imports from all modified files
- Build verification

## Execution Order

Phases 1, 3, 4 are independent. Phase 2 depends on Phase 1. Phase 5 is last.

```
Phase 1 (DashboardCard) ──┐
                          ├── Phase 2 (feed.tsx) ── Phase 5 (cleanup + build)
Phase 3 (channel route) ──┤
Phase 4 (widget route)  ──┘
```

## Click Count Comparison

| Task | Before | After |
|---|---|---|
| Toggle ticker visibility | 2-3 clicks + navigation | 1 click (dot on card) |
| Remove a source | 3-4 clicks + navigation | 2 clicks (×, confirm) |
| Reorder cards | 2+ clicks (enter edit mode) | 1 click (arrow, always there) |
| Change card display prefs | 2+ clicks (enter edit mode) | 1 click (sliders icon, inline on card) |
| Configure a source | 1-2 clicks | 1 click (gear on card) |
| View source feed | 1 click | 1 click (unchanged) |
