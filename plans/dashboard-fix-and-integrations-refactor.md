# Dashboard Bug Fix & Integrations Refactor

## Overview

Two changes that complete the "Build Your Own Scrollr" architecture shift:

1. **Dashboard Bug Fix**: Fix "No Streams Yet" shown incorrectly when `activeModule` defaults to `finance` but user has no finance stream. Enhance empty state with Quick Start and Browse Integrations CTAs.
2. **Integrations Refactor**: Remove `isCore` distinction — all integrations use the same uniform "Add to Account" flow.

---

## Step 1: Dashboard Bug Fix + Enhanced Empty State

**File**: `myscrollr.com/src/routes/dashboard.tsx`

### Change 1.1 — Add imports

Add `Link` from `@tanstack/react-router`. Add `Puzzle` and `Zap` to lucide-react imports.

### Change 1.2 — Fix `fetchStreams` (~lines 154-163)

Use functional `setActiveModule` updater to fall back to first stream if current `activeModule` doesn't exist in fetched data:

```ts
const fetchStreams = useCallback(async () => {
  try {
    const data = await streamsApi.getAll(getToken)
    const fetched = data.streams || []
    setStreams(fetched)
    if (fetched.length > 0) {
      setActiveModule((current) => {
        const exists = fetched.some((s) => s.stream_type === current)
        return exists ? current : fetched[0].stream_type
      })
    }
  } catch {
    // Silently fail — keep existing state
  } finally {
    setStreamsLoading(false)
  }
}, [getToken])
```

**Why functional updater**: Avoids adding `activeModule` to deps, avoids stale closures, keeps dependency array unchanged at `[getToken]`.

### Change 1.3 — Add `handleQuickStart` handler (after `handleDeleteStream`)

```ts
const handleQuickStart = async () => {
  const recommended: StreamType[] = ['finance', 'sports', 'rss']
  const toAdd = recommended.filter(
    (t) => !streams.some((s) => s.stream_type === t),
  )
  if (toAdd.length === 0) return

  try {
    const created = await Promise.all(
      toAdd.map((t) => streamsApi.create(t, {}, getToken)),
    )
    setStreams((prev) => [...prev, ...created])
    setActiveModule(created[0].stream_type)
  } catch {
    fetchStreams()
  }
}
```

### Change 1.4 — Tighten empty state guard (line 627)

```diff
- {!activeStream && !streamsLoading && (
+ {!activeStream && !streamsLoading && streams.length === 0 && (
```

Ensures "No Streams Yet" only appears when the user truly has zero streams, not when the selected tab doesn't match.

### Change 1.5 — Enhance empty state content

Keep existing "No Streams Yet" heading and description. Add three CTAs:

1. **"Quick Start"** button (primary) — calls `handleQuickStart`, adds finance + sports + rss
2. **"Add Stream"** button (secondary) — existing behavior, opens dropdown
3. **"Browse Integrations"** link — links to `/integrations`

**Commit**: `fix(dashboard): fall back to first available stream and enhance empty state with quick start`

---

## Step 2: Refactor Integrations Page

**File**: `myscrollr.com/src/routes/integrations.tsx`

### Change 2.1 — Update `Integration` interface

- Remove `category: 'core' | 'available'`
- Add `recommended?: boolean`

### Change 2.2 — Merge arrays into single `INTEGRATIONS`

- Finance, Sports, RSS get `recommended: true`
- Yahoo Fantasy: no `recommended` flag
- Delete `CORE_INTEGRATIONS` and `AVAILABLE_INTEGRATIONS` constants

### Change 2.3 — Update hero text

- Counter: reference `INTEGRATIONS.length` instead of sum of two arrays
- Description: remove "Core integrations are included with every account" language

### Change 2.4 — Merge into single section

Replace the two separate sections (Core / Available) with one "Integrations" section rendering all 4 cards.

### Change 2.5 — Update `IntegrationCard` component

- Remove `isCore` from props interface and destructure
- Add `recommended?: boolean` prop
- Badge logic:
  - Loading → "Loading" (unchanged)
  - `recommended && !installed` → "Recommended" (replaces "Core")
  - `installed` → "Added" (unchanged)
  - Otherwise → no badge
- Action logic: Remove entire `isCore` branch. All integrations use uniform flow:
  - `installed` → "Manage on Dashboard" link
  - `!installed && !isAuthenticated` → "Sign in to Add" button
  - `!installed && isAuthenticated` → "Add to Account" button

### Change 2.6 — Pass `recommended` prop from parent

```tsx
<IntegrationCard
  integration={integration}
  installed={hasStream(integration.streamType)}
  loading={loading}
  onAdd={handleAdd}
  adding={adding === integration.id}
  isAuthenticated={isAuthenticated}
  recommended={integration.recommended}
/>
```

**Commit**: `refactor(integrations): uniform stream-based flow for all integrations`

---

## Step 3: Verify

- Run `npx tsc --noEmit` in `myscrollr.com/`
- Regenerate route tree if needed (`npx tsr generate`)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Functional `setActiveModule` not updating if streams are empty | Low | Guarded by `if (fetched.length > 0)` |
| Quick Start creating duplicate streams (409 from API) | Low | Filtered by `toAdd` check; catch block refetches |
| Removing `isCore` breaks something | None | Only used inside `IntegrationCard` — removing both producer and consumer |
| Type errors after refactor | Low | Verified with `tsc --noEmit` |
