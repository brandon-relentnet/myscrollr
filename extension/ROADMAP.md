# Extension Roadmap

Comprehensive audit and improvement plan for the Scrollr browser extension, organized by priority and effort.

---

## Tier 1: Robustness & Reliability (High Impact, Should Do First)

These are things that could cause real bugs or confusing behavior for users.

### 1. SPA / Navigation Handling

The content script evaluates site filters once and never re-evaluates. On SPAs (YouTube, Twitter, Gmail), navigating between pages doesn't trigger the content script again. WXT provides `wxt:locationchange` events specifically for this. The feed bar should show/hide as the URL changes.

- `scrollbar.content/index.tsx` line 37: `shouldShowOnSite(window.location.href)` only runs once at mount time
- No `wxt:locationchange`, `popstate`, or `hashchange` listeners exist anywhere

### 2. ContentScriptContext Usage

The `ctx` object from `defineContentScript` is available but never passed to the React app. After an extension update/reinstall, message listeners throw `"Extension context invalidated"` errors indefinitely. Using `ctx.addEventListener` and `ctx.onInvalidated` would clean up gracefully.

- `scrollbar.content/index.tsx` line 36: `ctx` is available
- `scrollbar.content/App.tsx` line 90: `browser.runtime.onMessage.addListener(handleMessage)` should use `ctx` for cleanup

### 3. Push Mode Body Margin Cleanup

The extension directly sets `document.body.style.marginTop/Bottom` but doesn't save/restore the original value. If the extension is disabled or context invalidated, the page could be left with permanent extra margin.

- `scrollbar.content/App.tsx` lines 112-127: Directly modifies `document.body.style`
- Cleanup in useEffect return (lines 123-126) may not fire reliably if service worker is killed

### 4. Storage Write Debouncing for Drag Resize

The drag-to-resize writes to `storage.setValue()` on every single mousemove pixel. This should debounce — write only on `mouseup`.

- `scrollbar.content/FeedBar.tsx` lines 59-85: Drag handler calls `onHeightChange` on every `mousemove`
- `scrollbar.content/App.tsx`: `feedHeightStorage.setValue` fires on every pixel

### 5. activeFeedTabs Storage Watcher Missing

Changing active categories in options doesn't update already-open content scripts until page reload. Need to add a watcher.

- `scrollbar.content/App.tsx` lines 97-110: Watches 6 storage items but NOT `activeFeedTabs`
- `scrollbar.content/FeedBar.tsx` lines 52-56: Loads active tab once on mount, never updates

---

## Tier 2: Performance (Medium Impact, Quick Wins Available)

### 6. Memoize List Components

`TradeItem` and `GameItem` re-render on every SSE update because the parent always passes new arrays. Wrapping them in `React.memo` is a one-line change per component that prevents unnecessary re-renders of unchanged items.

- `scrollbar.content/TradeItem.tsx` line 22: `export default function TradeItem` — no memoization
- `scrollbar.content/GameItem.tsx` line 25: `export default function GameItem` — no memoization
- With 50 trades or 50 games, this means 50+ re-renders per SSE message

### 7. Parallelize Content Script Startup

`shouldShowOnSite` makes 3 sequential `await` calls to storage. Using `Promise.all` would be ~3x faster on content script startup.

- `scrollbar.content/index.tsx` lines 7-17: Three sequential storage reads

### 8. Broadcasting Efficiency

Every SSE update queries `browser.tabs.query({})` and sends to all tabs. Most tabs don't have the content script. No immediate fix needed, but worth noting for when the extension has many users with many tabs.

- `background/messaging.ts` lines 16-24: O(n) per SSE message, generates errors for most tabs

---

## Tier 3: UX Polish (High Visibility, Medium Effort)

### 9. Loading & Progress States

No loading states anywhere in the extension. When the extension first loads, all three UI surfaces show controls immediately with stale/default data, then silently hydrate.

- Show a loading state while `GET_STATE` is pending
- Show a "Signing in..." state on the login button while `launchWebAuthFlow` is open
- Show toast/confirmation when settings are saved
- `scrollbar.content/App.tsx` lines 36-59: `useEffect` fires `GET_STATE` but user sees default empty state
- `popup/App.tsx` lines 25-41: Same pattern
- `options/App.tsx` lines 88-108: Same pattern

### 10. Empty State Improvements

Replace "Waiting for trade data..." with states that distinguish between "Loading...", "Disconnected", and "No data available". The `connectionStatus` is already available — just not used in the empty state.

- `scrollbar.content/FeedBar.tsx` line 147: `"Waiting for trade data..."` — plain text, not actionable
- `scrollbar.content/FeedBar.tsx` line 164: `"Waiting for game data..."` — same issue
- Neither differentiates between loading, disconnected, or genuinely empty

### 11. Error Visibility

The codebase has 20+ instances of `.catch(() => {})` with no logging or user feedback. Replace with at minimum `console.warn` for debugging, and user-visible error states for critical failures.

- `scrollbar.content/App.tsx` lines 48, 53-58: 6 instances
- `popup/App.tsx` lines 35, 37-40: 5 instances
- `options/App.tsx` lines 98, 100-107: 9 instances
- No distinction between expected and unexpected failures

### 12. Login/Logout Feedback

No visual feedback when clicking "Sign In" or "Sign Out". The auth flow can take several seconds (browser popup opens, user enters credentials).

- `popup/App.tsx` lines 83-85: `handleLogin` fires and forgets — no loading spinner, no disabled button state
- `options/App.tsx` lines 190-192: Same issue
- Login failure returns `false` but does not communicate why (network error vs. user cancellation vs. server error)

---

## Tier 4: Code Quality & Maintainability (Low Urgency, High Long-Term Value)

### 13. Extract Shared Components

Duplicated code across popup, options, and content script:

- **ConnectionIndicator** — Dedicated component in `scrollbar.content/ConnectionIndicator.tsx`, duplicated inline in `popup/App.tsx` lines 99-109 and `options/App.tsx` lines 215-225. Move to `components/`.
- **useExtensionState() hook** — The `GET_STATE` + storage loading + message listener pattern is duplicated 3 times across `scrollbar.content/App.tsx`, `popup/App.tsx`, and `options/App.tsx`.
- **Shared CSS class strings** — `selectClass` variable in options, same string inline 3 times in popup.

### 14. Fix Type Safety

- Remove the 8 `as unknown` casts in `sse.ts` by making `upsertTrade`/`upsertGame` accept `Trade`/`Game` directly
- Add runtime type guards for incoming messages instead of blind `as` casts (`scrollbar.content/App.tsx` line 63, `popup/App.tsx` line 46, `background/messaging.ts` line 74)
- Remove unused `LOGTO_RESOURCE` export from `constants.ts`

### 15. Remove Dead Code

- `assets/tailwind.css` — Unused, each entrypoint has its own `style.css`
- `stopSSE` in `sse.ts` line 152 — Exported but never called
- `useRef` import + `barRef` in `FeedBar.tsx` — Assigned but never read

### 16. SSE Reconnection Improvements

- **No maximum retry count** — SSE reconnects indefinitely, burning CPU/battery if API is down for hours
- **No jitter in backoff** — Pure exponential without jitter means simultaneous reconnect storms
- **No user notification** — Malformed SSE messages logged to service worker console only

---

## Tier 5: Developer Experience (Sets Up Future Success)

### 17. Testing Infrastructure

Set up Vitest with WXT's `WxtVitest` plugin and `@webext-core/fake-browser`. Zero test infrastructure currently exists.

Priority test targets:
- URL pattern matching (`shouldShowOnSite`, `urlMatchesPattern`)
- CDC record processing (upsert/delete logic in `sse.ts`)
- Token refresh/expiry logic in `auth.ts`
- Storage schema versioning and migrations

### 18. Environment Variables

Replace hardcoded API URLs in `constants.ts` with `import.meta.env.WXT_API_URL` etc., backed by a `.env` file. This enables local development against a local API and staging environments.

- `utils/constants.ts`: All URLs hardcoded to production
- WXT supports `.env` files with `WXT_` prefix but this is not utilized

### 19. Update SPEC.md

The SPEC.md is out of date in several ways:
- Wrong App ID in Auth section (lists frontend ID `ogbulfshvf934eeli4t9u` instead of extension ID `kq298uwwusrvw8m6yn6b4`)
- Doesn't reflect the token proxy architecture
- Scopes listed as `openid profile email` but implementation uses `openid profile email offline_access`
- References `lucide-react` icons but Unicode characters are used instead
- Either update it to match reality or deprecate it in favor of `CLAUDE.md`

---

## Tier 6: New Features (Phase 3 from SPEC.md)

Features that were spec'd but not yet built.

### 20. Per-Site Toggle in Popup

"This site: Enabled/Disabled" dropdown in the popup that adds the current tab's URL to enabled/disabled sites. Spec'd in SPEC.md lines 448-449 but not implemented.

### 21. Keyboard Shortcuts

Toggle feed visibility, switch tabs. Could use `browser.commands` API for global shortcuts. Spec'd in SPEC.md line 570.

### 22. Extension Icon Badge

Show counts or status indicators on the toolbar icon via `browser.action.setBadgeText`. Spec'd in SPEC.md line 571.

### 23. Item Animations

Smooth entrance animations when new trades/games arrive (e.g., highlight flash, slide in). Spec'd in SPEC.md line 569. Currently items just replace the array with no transition.

### 24. Auto-Scroll

Automatically scroll the feed to show new items as they arrive. Spec'd in SPEC.md line 466.

### 25. Yahoo Fantasy Tab

New feed category, new data type, new component. Requires backend Yahoo CDC integration first. The type system only supports `'finance' | 'sports'` currently.

---

## Accessibility (Cross-Cutting Concern)

Zero ARIA attributes across the entire extension. This should be addressed incrementally as each component is touched:

- No `aria-label`, `aria-pressed`, `role`, or `tabindex` on any elements
- Collapse button uses Unicode arrows — screen readers announce raw characters
- Team logos use `alt=""` — should use team names
- No keyboard navigation support for the feed bar
- Color contrast concerns: `text-zinc-500` on `bg-zinc-900` (~3.1:1 ratio, below WCAG AA 4.5:1 minimum)
- No focus management in Shadow DOM content script

---

## Browser Compatibility Notes

### Safari Auth

`browser.identity.launchWebAuthFlow` has limited Safari support. If `browser.identity` is unavailable, the entire auth flow will throw. No runtime detection or fallback mechanism exists.

### MV3 Keepalive Efficiency

The `chrome.alarms` keepalive (`sse.ts` lines 183-195) is only necessary for MV3 service workers. In MV2 (Firefox), the background page is persistent. No `import.meta.env.MANIFEST_VERSION` guard exists — the alarm fires unnecessarily on Firefox.

### Duplicate Alarm Listeners

If `setupKeepAlive` is called multiple times, `onAlarm.addListener` would stack handlers. The alarm itself is safe (overwrites), but the listener is not guarded.

---

## Recommended Priority Order

| Priority | Items | Reasoning |
|----------|-------|-----------|
| **Now** | #1, #2, #4, #5 | Fix bugs/robustness issues before they confuse users |
| **Next** | #6, #7, #9, #10 | Quick wins for performance and UX polish |
| **Soon** | #13, #14, #15 | Clean up code before adding features |
| **Then** | #17, #18 | Set up testing and env vars for sustainable development |
| **Later** | #11, #3, #8, #16, #19 | Lower-priority improvements |
| **Features** | #20, #21, #22, #23, #24, #25 | New functionality after foundation is solid |

---

## Implementation Plan: Tier 1 (#1, #2, #4, #5)

### Files Modified

| File | Items |
|------|-------|
| `entrypoints/scrollbar.content/index.tsx` | #1, #2 |
| `entrypoints/scrollbar.content/App.tsx` | #2, #4, #5 |
| `entrypoints/scrollbar.content/FeedBar.tsx` | #4, #5 |
| `entrypoints/scrollbar.content/FeedTabs.tsx` | #5 |

### Execution Order

Implemented in dependency order: #2 first (ctx plumbing), #1 second (uses ctx), #5 third (independent), #4 last (simplest).

### #2 — ContentScriptContext Usage

**Goal**: Pass `ctx` from the content script entry to the React app so listeners and watchers are cleaned up when the extension context is invalidated (update/reinstall).

**Changes to `index.tsx`**:
- Pass `ctx` as a prop: `<App ctx={ctx} />`

**Changes to `App.tsx`**:
- Accept `ctx: ContentScriptContext` prop
- Message listener: add `ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(handleMessage))` for cleanup when context is invalidated without React unmounting
- Storage watchers: add `ctx.onInvalidated(() => unwatchers.forEach(u => u()))` for the same reason
- Initial GET_STATE: guard `.then()` callback with `if (!ctx.isValid) return`
- Push mode useEffect: guard body style mutations with `ctx.isValid`; always reset margins in cleanup regardless

### #1 — SPA / Navigation Handling

**Goal**: Re-evaluate site filters on SPA navigations so the feed bar shows/hides dynamically as the URL changes.

**Changes to `index.tsx`**:
- Restructure `main(ctx)` to track a `ui` variable (mount state)
- Extract an `evaluate(url)` function that calls `shouldShowOnSite()` and mounts/unmounts accordingly
- Call `evaluate(location.href)` on initial load
- Use `ctx.addEventListener(window, 'wxt:locationchange', ...)` to re-evaluate on every navigation
- WXT's `wxt:locationchange` covers `pushState`, `replaceState`, `popstate`, and `hashchange`
- Using `ctx.addEventListener` ensures auto-cleanup on context invalidation (ties into #2)

### #5 — activeFeedTabs Storage Watcher

**Goal**: When a user changes active categories in the options page, already-open content scripts reflect the change immediately.

**Changes to `App.tsx`**:
- Import `activeFeedTabs` storage item
- Add `activeTabs` state, load on mount, add to storage watchers array
- Pass `activeTabs` as prop to `<FeedBar>`

**Changes to `FeedBar.tsx`**:
- Add `activeTabs: FeedCategory[]` prop
- Remove the local `useEffect` that loads `activeFeedTabs` on mount
- Remove the `activeFeedTabsStorage` import
- Add a sync `useEffect`: when `activeTabs` changes and current `activeTab` is no longer in the list, switch to the first available tab
- Pass `activeTabs` to `<FeedTabs>`

**Changes to `FeedTabs.tsx`**:
- Add `availableTabs: FeedCategory[]` prop
- Filter the hardcoded `TABS` array to only show enabled tabs

### #4 — Storage Write Debouncing for Drag Resize

**Goal**: Only persist height to storage on `mouseup`, not on every pixel of drag movement.

**Changes to `App.tsx`**:
- `onHeightChange` callback: only calls `setHeight(h)` (visual update), no storage write
- New `onHeightCommit` callback: calls `feedHeightStorage.setValue(h)` (persist on drag end)
- Pass both callbacks to `<FeedBar>`

**Changes to `FeedBar.tsx`**:
- Add `onHeightCommit: (height: number) => void` prop
- In `handleDragStart`: track `currentHeight` in closure, call `onHeightCommit(currentHeight)` in `onMouseUp`
- `onHeightChange` continues to fire on every `mousemove` for smooth visual feedback
