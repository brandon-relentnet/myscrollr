# Current Session Handoff

## Repo State

- Repo: `/Users/doni/code/myscrollr` (single repo — monorepo for desktop + website + APIs + channels)
- Branch: `main`
- Worktree: clean (one untracked `desktop/screenshots/` dir, pre-existing, not from this session)
- HEAD: `7a90cc1` — `docs(spec): ticker monitor picker — single-monitor selection design`
- 2 commits ahead of `origin/main`. Push at your discretion (handoff + spec are local-only right now).
- Desktop version: **1.0.12** in package.json / tauri.conf.json / Cargo.toml / Cargo.lock

## Active Task

**Implement the ticker monitor picker.** Spec at `docs/superpowers/specs/2026-05-10-ticker-monitor-picker-design.md` (committed `7a90cc1`). Spec self-review passed; user reviewed the spec at the end of the previous session and the implementation is the next concrete step.

This is the **single-monitor** version — pick which monitor the ticker shows on, persist across launches. NOT the eventual one-ticker-per-monitor design (Approach A) — that's an explicit non-goal in this scope and a backlog item. The schema we're landing here (`tickerMonitorId: string | null`) is designed to extend cleanly to `tickerMonitorIds: string[]` later if/when one-per-monitor becomes worth the bigger investment.

## Release Status

- `desktop-release.yml` auto-runs on every push to `main` with `desktop/**` paths. **Crucial:** I previously thought tagging was the trigger; it's not. Every PR merge with a `desktop/**` path fires the workflow.
- `desktop-v1.0.12` cross-platform installers (macOS DMG notarized, Windows MSI, Linux AppImage) exist as a **draft GitHub release** since PR #159 (`25c4a02`) merged. So do v1.0.10 and v1.0.11 drafts.
- The remaining manual step is to visit GitHub Releases → click "Publish release" on the v1.0.12 draft. That fires `deploy.yml`'s `release: types: [published]` hook to rebuild the marketing site so its download button advertises the new version.
- The spec implementation will run the same workflow on its merge — no special action needed for that.

## Server Deployments (also stable)

- `/yahoo/start` JSON content negotiation (PR #155 / `4e6e804`) is live in production. Verified live with a 200 + JSON `{"redirect_url"}` response when called with `Accept: application/json` + Bearer.

## Eight PRs Shipped Earlier This Session (chronological)

1. **#155 `4e6e804`** — `fix(fantasy): /yahoo/start JSON content negotiation` (server, deployed to prod)
2. **#156 `4ff0d77`** — readability pass + MCP dev tooling + Yahoo desktop counterpart
3. **#157 `096a773`** — config panel scroll + home page leagues display
4. **#158 `7d21ae8`** — rebuild Display preview to be honest and legible
5. **#159 `25c4a02`** — bump version to 1.0.12
6. **#160 `d1190e7`** — split player-stats into individual ticker chips
7. **#161 `a8b8ad5`** — trim player-stat chip bottom row for tighter rail
8. **#162 `4eecc71`** — stable engagement sort to stop random ticker jank

Plus this session's spec commit `7a90cc1` and the previous handoff commit `3f076ac`.

## Lessons / Gotchas Carried Forward (DO NOT RE-LEARN)

1. **`desktop-release.yml` triggers on push to main with `desktop/**` paths.** NOT on tag. Every PR merge auto-builds and stages a draft release. Publishing the draft is the only manual step.

2. **TanStack Router uses memory history.** Webview URL bar is decorative. To navigate via JS in MCP debugging, walk the React fiber to find the router prop, then call `router.navigate({ to, params })`. `window.history.pushState` + `popstate` does NOT trigger router navigation.

3. **MCP bridge is opt-in.** Run `npm run tauri:dev:mcp` (NOT `tauri:dev`). That script passes `--config src-tauri/tauri.mcp.conf.json -- --features dev-mcp-bridge`. WebSocket on `localhost:9223`. macOS resize: pass physical pixels (`logical: false`, e.g. 1920x1280 for ~960x640 logical at 2x retina).

4. **`/dashboard` returns `data.fantasy = { leagues: [...] }`**, NOT a flat array. Every other channel returns a flat array. Home / dashboard consumers must unwrap via `normalizeChannelData(type, raw)` (now in `desktop/src/routes/feed.tsx`).

5. **Yahoo player_keys are global, not per-league.** The same MLB/NFL player can sit in BOTH of a user's leagues. `FollowedPlayerChip.findPlayerByKey()` accepts an optional `preferLeagueKey` to bias the lookup. Pass it for per-league chips; omit for the user-followed (context-free) path.

6. **`gameEngagement` MUST NOT depend on `Date.now()`.** Time-dependent sort keys cause marquee jank on every dashboard refetch. State-only buckets (live=80/100, pre=60, final=30) plus `start_time` tie-break in `selectSportsForTicker`. Regression test `is stable across simulated time drift` guards this.

7. **DO NOT undo:**
   - `text-ui-*` utility migration (PR #156)
   - `comfort` mode of FantasyStatChip in DisplayPanel preview (PR #158)
   - `accent` prop on FollowedPlayerChip (PR #160)
   - `preferLeagueKey` parameter on `findPlayerByKey` (PR #160)
   - `normalizeChannelData` helper in `feed.tsx` (PR #157)
   - state-only `gameEngagement` (PR #162)

8. **MCP-driven diagnosis is the right workflow for visual / runtime weirdness.** Inject a `MutationObserver` + frame-by-frame transform sampler. Watch silently 60-120s. Read events back. PR #162 commit body has the probe code.

9. **TanStack Query monitor list refresh:** the spec specifies `staleTime: 5_000` AND `refetchOnMount: "always"` for `monitorsQueryOptions`. The "always" is the part that makes the dropdown re-enumerate on each open — `staleTime` alone won't.

## Open Items

- **Open PR #104** ("Feature/favorite team selection" by Enanimate) — 5 weeks old, no description, +521/-164 across 13 files, `mergeStateStatus: UNKNOWN`. Almost certainly conflicts. Triage before touching.
- The two local-only commits (`3f076ac`, `7a90cc1`) on `main` are not yet pushed to `origin`. Decision: push when ready.

## Operational Notes

- The user is running `npm run tauri:dev:mcp` in the background. Connect with `mcp_Tauri_driver_session({action: "start", port: 9223})`.
- The user has 2 fantasy leagues imported. Don't follow players in their picker for testing without unfollowing afterwards (precedent from this session: I followed CJ Abrams for verification, unfollowed before exiting).
- GitHub `gh` CLI auth works without prompts. Squash-merge with `--delete-branch`.
- The user's operator note for the next session: "give me a prompt to start this change in a fresh chat" — the resume prompt below is engineered to drop a fresh agent straight into implementation, no re-discovery.

## Next Best Action

Implement the ticker monitor picker per the spec. Use `superpowers:writing-plans` to break the spec into ordered, testable tasks first; then `superpowers:subagent-driven-development` (or just sequential execution; the work is small enough for a single-track approach) to implement.

```
You're picking up `/Users/doni/code/myscrollr` on `main`. Worktree is clean.

**Read first**:
  - docs/superpowers/handoffs/current.md  (full session context)
  - docs/superpowers/specs/2026-05-10-ticker-monitor-picker-design.md  (the spec to implement)

**State**:
  - HEAD = 7a90cc1, 2 commits ahead of origin/main (handoff + spec, push when ready)
  - Desktop is at v1.0.12; cross-platform installers already staged as a draft GitHub release
  - 8 PRs shipped earlier this session (#155-#162), all merged on main, all auto-built via desktop-release.yml

**Active task**: Implement the ticker monitor picker exactly as specified in the design doc.
This is the SINGLE-monitor version — pick which monitor the ticker shows on, persist
across launches. NOT one-ticker-per-monitor (that's the deferred Approach A backlog item).

**Workflow**:
  1. Invoke superpowers:writing-plans on the spec doc to produce an ordered implementation plan
     at docs/superpowers/plans/2026-05-10-ticker-monitor-picker-plan.md.
  2. Get user approval of the plan.
  3. Implement task-by-task using superpowers:subagent-driven-development OR sequentially —
     the work is ~80-120 LOC across 7 files, small enough for a single-track session.
  4. Use superpowers:test-driven-development for each task — write failing tests first
     (Rust unit tests for the fingerprint matching ladder are explicit in the spec).
  5. Open a PR per the spec's risk matrix; verify live via the MCP-driven dev session
     (the user is running `npm run tauri:dev:mcp` already, port 9223).

**Foundations available** (consume, do NOT re-implement):
  - Existing position_ticker command at desktop/src-tauri/src/commands/window.rs:14 already
    handles edge-snapping AND has cross-platform compositor adapters (Hyprland/Sway/KDE/KWin
    + GTK fallback for macOS/Windows/X11/GNOME). The new move_ticker_to_monitor command should
    delegate to it after positioning the window on the chosen monitor — don't duplicate the
    edge-snap logic.
  - Existing ticker initial sizing in lib.rs::setup at line ~111 calls window.current_monitor()
    + set_size to fill width. Leave it; the JS side fires move_ticker_to_monitor on prefs load
    via the same one-trip dance App.tsx:325 already uses for position_ticker.
  - LazyStore prefs schema in desktop/src/preferences.ts. WindowPrefs interface already exists;
    add tickerMonitorId: string | null. Migration is field-by-field tolerant (missing field
    reads as null → "follow primary"); no migrator change needed beyond the default.
  - GeneralSettings.tsx is the right component for the new dropdown — same component as the
    existing "Always on top" / "Position" controls.
  - existing query infrastructure in desktop/src/api/queries.ts (TanStack Query + invoke pattern).

**Lessons (DO NOT re-learn)**:
  - desktop-release.yml triggers on push to main with desktop/** paths — NOT on tag.
    Every merge auto-builds and stages a draft release.
  - Wayland compositor adapters already accept absolute cross-monitor coordinates.
    No adapter changes expected. Verify each path during implementation; fall back
    to GTK if a specific adapter fails (matrix per spec: Hyprland ✓, Sway ✓, KDE/KWin ✓
    per upstream docs; X11/GNOME use GTK fallback which is already cross-monitor capable).
  - macOS / Windows: set_position honors absolute screen coordinates (multi-display screens
    form one virtual coordinate space). Should Just Work.
  - For TanStack Query, refetch-on-open requires BOTH staleTime AND refetchOnMount: "always".
    staleTime alone does not refetch.
  - The Tauri MCP bridge is opt-in via `npm run tauri:dev:mcp`. The user already has it running
    on port 9223. Connect with mcp_Tauri_driver_session({action: "start", port: 9223}).
  - macOS window resize via the MCP: pass physical pixels with logical: false. Logical resize
    is unreliable at 2x retina.

**DO NOT undo** (foundations from earlier in this session):
  - text-ui-* utility migration (#156)
  - comfort mode of FantasyStatChip in DisplayPanel preview (#158)
  - accent prop on FollowedPlayerChip (#160)
  - preferLeagueKey parameter on findPlayerByKey (#160)
  - normalizeChannelData helper in feed.tsx (#157)
  - state-only gameEngagement (#162)

**Environmental**:
  - User's dev MCP session is running. Live host execution via the Tauri MCP is authorized.
  - GitHub `gh` CLI is authenticated. Squash-merge with --delete-branch.
  - One stale stranger PR open (#104, "Feature/favorite team selection" from Enanimate,
    5 weeks old, almost certainly conflicts). Don't touch unless asked.

**First concrete action**:
  Begin by invoking superpowers:writing-plans with the spec file as input. Don't start
  coding before the plan is written, reviewed, and approved by the user. The spec already
  has the architecture locked in — the plan is about ordering and testability, not design
  re-litigation.
```
