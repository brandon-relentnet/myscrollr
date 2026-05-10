# Current Session Handoff

## Repo State

- Repo: `/Users/doni/code/myscrollr` (single repo — monorepo for desktop + website + APIs + channels)
- Branch: `main`
- Worktree: **clean**
- HEAD: `4eecc71` — `fix(desktop/sports): stable engagement sort to stop random ticker jank (#162)`
- Desktop version: **1.0.12** (in `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`, `Cargo.lock`)
- Latest **published** desktop release: `desktop-v1.0.9`. `desktop-v1.0.10`, `v1.0.11`, **and `v1.0.12` already exist as DRAFT releases** — `desktop-release.yml` auto-runs on every push to `main` with `desktop/**` paths, builds/notarizes cross-platform installers, and stages the artifacts as a draft GitHub release with the tag. **The release publication is what's still manual** — visit the GitHub Releases page and click "Publish release" on the v1.0.12 draft. That fires `deploy.yml`'s `release: types: [published]` hook, which rebuilds the marketing site so its download button advertises the new version. The 8 PRs merged tonight each ran the desktop-release workflow successfully (run #25627118... and earlier).
- Server-side `/yahoo/start` JSON content negotiation (PR #155 / `4e6e804`) is **already deployed to production** via the K8s `deploy.yml` workflow. Verified live with a 200 + JSON `{"redirect_url"}` response when called with `Accept: application/json` + a Bearer token.

## Tonight's Shipped Stack (eight PRs, in chronological order)

1. **#155 `4e6e804`** — `fix(fantasy): content-negotiate /yahoo/start so the desktop OAuth flow works`. Server fix already deployed. Adds JSON response when `Accept: application/json` (or `?response=json`) is sent, otherwise unchanged 307 redirect.
2. **#156 `4ff0d77`** — `chore(desktop): readability pass + MCP dev tooling + Yahoo desktop counterpart`. New `text-ui-*` utilities, brightened muted text tokens, scoped 9/10px → 11px fallback, ~25 component migrations. Plus `tauri.mcp.conf.json` and the `tauri:dev:mcp` script. Plus `ConfigPanel.tsx` calling `authFetch('/yahoo/start?response=json')` then `shell::open` on the returned URL.
3. **#157 `096a773`** — `fix(desktop/fantasy): config panel scroll + home page leagues display`. ConfigPanel scroll wrapper for `fillHeight` mode + `normalizeChannelData` helper to unwrap `data.fantasy = { leagues: [...] }` on the Home page.
4. **#158 `7d21ae8`** — `fix(desktop/fantasy): rebuild Display preview to be honest and legible`. Dropped the dishonest Feed preview and the clipped Ticker rail-mode preview. Single full-width comfort-mode preview that actually reacts to toggles. Defensive `overflow-x-auto` on PreviewSurface.
5. **#159 `25c4a02`** — `chore(desktop): bump version to 1.0.12`.
6. **#160 `d1190e7`** — `feat(desktop/fantasy): split player-stats into individual ticker chips`. Top-3 starters / worst / bench leader / injury report each spawn standalone `FollowedPlayerChip`s on the rail with accent badges (`↑` `↓` `BN` `🚨`). New `desktop/src/channels/fantasy/playerStats.ts` houses shared selection helpers. Critical bug discovered + fixed during MCP verification: Yahoo player_keys are GLOBAL (a player can sit in both of the user's MLB leagues), so `findPlayerByKey` got an optional `preferLeagueKey` constraint to attribute chips to the right league.
7. **#161 `a8b8ad5`** — `fix(desktop/fantasy): trim player-stat chip bottom row for tighter rail`. When a `FollowedPlayerChip` has an `accent`, the bottom row shows `"Top scorer"` / `"Worst starter"` / `"Bench leader"` / `"Injured"` instead of the verbose `OwnerTeam · LeagueName · NFL Team Full Name`. Width drops 40-50% per chip. Legacy user-followed path (no accent) preserved unchanged.
8. **#162 `4eecc71`** — `fix(desktop/sports): stable engagement sort to stop random ticker jank`. Removed `Date.now()` from `gameEngagement()` so the sort key doesn't flip on every refetch. Continuous time-of-day priority moved to a deterministic `start_time` tie-break in `selectSportsForTicker`. **Verified before/after with MCP-driven instrumentation: 68 transform jumps → 0**. Diagnostic technique used: `MutationObserver` on the chip set + `requestAnimationFrame` loop watching the marquee `<ul>` `transform` for >300px-in-<50ms discontinuities.

## What's Live in the Dev MCP Build Right Now

The user's running `npm run tauri:dev:mcp` session has all eight PRs applied via HMR. Verified end-to-end via MCP: ticker is stable, fantasy chips render correctly per league, Yahoo OAuth completes, configure page scrolls, home shows imported leagues, display preview reacts to toggles.

## Lessons / Gotchas Carried Forward (DO NOT RE-LEARN)

1. **TanStack Router uses `createMemoryHistory`** in this app (see `desktop/src/router.ts`). The webview URL bar is decorative — `window.location.pathname` does NOT reflect the active route. To navigate via JS in MCP debugging, walk the React fiber to find the router prop, then call `router.navigate({ to, params })`. Setting `window.location.href` reloads the page; `window.history.pushState` + `popstate` does NOT trigger router navigation.

2. **The Tauri MCP bridge is opt-in.** Run `npm run tauri:dev:mcp` (NOT `tauri:dev`). That script passes `--config src-tauri/tauri.mcp.conf.json -- --features dev-mcp-bridge`. The config sets `app.withGlobalTauri=true`. WebSocket listens on `localhost:9223`. macOS resize behaves oddly with `logical:true` — pass physical pixels (`logical: false`, then 1920x1280 for ~960x640 logical at 2x retina).

3. **`/dashboard` returns `data.fantasy = { leagues: [...] }`**, NOT a flat array. Every other channel returns a flat array. Home / dashboard consumers must unwrap via `normalizeChannelData(type, raw)` (now in `desktop/src/routes/feed.tsx`). Standalone consumers (`ScrollrTicker`, `FantasyFeedTab`, `FollowedPlayersPicker`, `FantasyDisplayPanel`) already unwrap correctly with `payload?.leagues ?? []`.

4. **Yahoo player_keys are global, not per-league.** The same MLB/NFL player can sit in BOTH of a user's leagues. `FollowedPlayerChip.findPlayerByKey()` walks leagues in array order — pass the optional `preferLeagueKey` to bias the lookup, otherwise the first match wins (which is wrong for per-league context chips). The user-followed path intentionally omits this (a followed player IS context-free).

5. **`/yahoo/start` is `Auth: true` on the gateway.** Browser navigation can't carry a Bearer header, so `shell::open()` of the URL fails with 401. The desktop client must `authFetch('/yahoo/start?response=json')` first to get the consent URL as JSON, then `shell::open` THAT URL externally. The server still 307-redirects for HTML / wildcard `Accept` headers (logged-in browser cookies path). If you ever revisit this, both halves must stay in lockstep.

6. **`gameEngagement` MUST NOT depend on `Date.now()`.** PR #162 fixed exactly this. If you add a new factor to engagement, classify by state, not by clock thresholds. Continuous time priority belongs in the secondary `start_time` tie-break inside `selectSportsForTicker`. There's a regression test `is stable across simulated time drift` that asserts this — do not relax it.

7. **DO NOT undo:**
   - The `text-ui-*` utility migration in PR #156 (multiple PRs depend on the new tokens)
   - The `comfort` mode of FantasyStatChip in DisplayPanel preview (PR #158) — non-comfort overflows the 340px surface
   - The `accent` prop on FollowedPlayerChip (PR #160) — ScrollrTicker.tsx fantasy bucket builder relies on it
   - The `preferLeagueKey` parameter on `findPlayerByKey` (PR #160) — without it, per-league chips show wrong owner/score context
   - The `normalizeChannelData` helper in `feed.tsx` (PR #157) — Home page Fantasy display depends on it
   - The state-only `gameEngagement` (PR #162) — sports ticker stability depends on it; tests guard the invariant

8. **MCP-driven diagnosis is the workflow when the user reports visual / runtime weirdness.** Don't guess. Inject a `MutationObserver` + a frame-by-frame transform sampler, watch silently for 60-120s without disturbing the system, then read the events back. Eight tonight's PRs were all verified or diagnosed this way. Probe pattern lives in commit `4eecc71`'s message body.

## Verification Status

- All eight PRs squash-merged green via `gh pr merge --squash --delete-branch`.
- `npm test` (desktop) — 250 tests pass (was 249 before #162; +3 new stability tests, -2 collapsed time-bucket tests in `view.test.ts`).
- `npm run build` (desktop) — typecheck + vite build clean. Pre-existing `style-*.js` 580kb chunk-size warning is unchanged (backlog item).
- `go test ./...` (channels/fantasy/api) — pass on PR #155 CI.
- Live MCP-driven visual regression checks performed on PRs #156, #157, #158, #160, #161, #162.

## Risks / Follow-Ups

- **Bundle size**: `style-*.js` chunk ~580kb minified. Lower-priority follow-up. See backlog.
- **Fantasy `.feed` venue plumbing**: still no-op. `MatchupHero`, `OverviewView`, `StandingsView`, `RosterView` ignore the `.feed` boolean. PR #158's helper text says "Display items currently affect the Ticker only" — that's the honest state. Backlog item.
- **`tauri.mcp.conf.json` permissions**: dev-only by virtue of being applied via `npm run tauri:dev:mcp`. Production builds (`npm run tauri:build`) don't pull in the MCP bridge plugin (gated by `feature = "dev-mcp-bridge"` + `debug_assertions` + `not(target_os = "windows")` in `lib.rs:61`). Safe.
- **Stale F1 race data observed during instrumentation**: F1 races at `state: "pre"` with `start_time` 28 days in the past keep showing up in the dashboard. `gameEngagement` returns 60 for them so they sort with all other pre-games — minor noise but not a regression. Backlog candidate if it bothers anyone.
- **Open PR #104 — "Feature/favorite team selection"** by Enanimate, 5 weeks old, no description, mergeStateStatus=UNKNOWN, +521/-164 across 13 files. Almost certainly conflicts with this session's work. Triage before merging.

## Operational Notes

- The user is running `npm run tauri:dev:mcp` in the background. WebSocket on `localhost:9223`. Connect with `mcp_Tauri_driver_session({action: "start", port: 9223})`.
- The user has 2 fantasy leagues imported: `Stanton Again A Fuck League` (MLB, mostly pre-game), `Scrollr League` (MLB, live data). Roster of ~30 players each.
- The user's GitHub auth in this CLI is fine; `gh pr merge --squash --delete-branch` works without prompts.
- The `desktop-release.yml` workflow has not been touched this session.

## Next Best Action

Two things outstanding: (1) **Publish the v1.0.12 draft release on GitHub** to put the new build in users' hands and refresh the website download link. (2) **Multi-monitor support** is the next feature the user wants — see backlog and the brainstorming session in progress.

**Resume prompt for the next fresh chat:**

```
You're picking up `/Users/doni/code/myscrollr` on `main`. Worktree is clean.
Read `docs/superpowers/handoffs/current.md` first for full context.

What's already shipped tonight (8 PRs, all squash-merged on main, HEAD = 4eecc71):
  - #155 4e6e804  fix(fantasy): /yahoo/start JSON content negotiation (server, deployed to prod)
  - #156 4ff0d77  chore(desktop): readability pass + MCP dev tooling + Yahoo desktop counterpart
  - #157 096a773  fix(desktop/fantasy): config panel scroll + home page leagues display
  - #158 7d21ae8  fix(desktop/fantasy): rebuild Display preview to be honest and legible
  - #159 25c4a02  chore(desktop): bump version to 1.0.12
  - #160 d1190e7  feat(desktop/fantasy): split player-stats into individual ticker chips
  - #161 a8b8ad5  fix(desktop/fantasy): trim player-stat chip bottom row for tighter rail
  - #162 4eecc71  fix(desktop/sports): stable engagement sort to stop random ticker jank

Desktop is at version 1.0.12 in package.json / tauri.conf.json / Cargo.toml / Cargo.lock.
`desktop-release.yml` auto-runs on every push to main with `desktop/**` paths
and HAS already built and staged a DRAFT GitHub release `desktop-v1.0.12` with
the cross-platform installers (notarized macOS DMG, Windows MSI, Linux AppImage).
The release publication is the remaining manual step — visit GitHub Releases
and click "Publish release" on the v1.0.12 draft. That fires deploy.yml's
`release: types: [published]` hook to rebuild the marketing site so its
download button advertises the new version.

Foundations available (DO NOT undo):
  - Text utilities: text-ui-title / -body / -muted / -meta / -chip / -section
    in desktop/src/style.css. Use these for new desktop UI; do NOT use
    `text-[Npx]` arbitrary classes — there's a scoped fallback at #desktop-shell /
    #app-shell that bumps 9/10px to 11px, but new code should use the utilities.
  - normalizeChannelData(type, raw) in desktop/src/routes/feed.tsx unwraps the
    `data.fantasy = { leagues: [...] }` dashboard payload. Apply at every Home /
    ChannelSection consumer of `dashboard.data[type]`. Standalone consumers
    already unwrap correctly with `payload?.leagues ?? []`.
  - desktop/src/channels/fantasy/playerStats.ts: findTopN, findTopScorer,
    findWorstStarter, findTopBench, findInjuredPlayers, isStrictBench,
    isInjured, shortStatus, formatPts. Both FantasyStatChip and ScrollrTicker
    consume these.
  - FollowedPlayerChip accepts optional accent="top"|"worst"|"bench"|"injury"
    and optional preferLeagueKey. ScrollrTicker's fantasy bucket builder passes
    both for per-league player-stat chips. Yahoo player_keys are GLOBAL, so
    leagueKey is required when picking a player in a per-league context;
    omit it for the user-followed (context-free) path.
  - /yahoo/start content-negotiates: Accept: application/json (or ?response=json)
    returns 200 {"redirect_url"}. Otherwise 307 redirect (browser cookie path).
    Desktop already uses the JSON path via authFetch in ConfigPanel.tsx.
  - gameEngagement is state-only (live=80/100, pre=60, final=30). Do NOT add
    Date.now()-dependent logic — there's a regression test asserting stability
    under simulated time drift. Time-of-day priority lives in the start_time
    tie-break inside selectSportsForTicker.

Lessons (DO NOT re-learn):
  - TanStack Router uses memory history. Webview URL bar is decorative.
    Navigate via window.__router.navigate({to, params}) after walking the
    React fiber to find it (one-time setup at session start).
  - Tauri MCP dev session: `npm run tauri:dev:mcp` (NOT `tauri:dev`). Resize
    macOS windows in PHYSICAL pixels with `logical: false` — logical resize
    is unreliable on macOS at 2x retina.
  - When the user reports visual / runtime weirdness, instrument first.
    Pattern: MutationObserver + requestAnimationFrame transform sampler,
    watch silently 60-120s, read events back. See PR #162 commit body for
    the full probe code.
  - Yahoo player_keys are global. Use preferLeagueKey when looking up a
    player in a per-league context.
  - `/dashboard` Fantasy payload is wrapped: `{leagues: [...]}`. Other
    channels are flat arrays.
  - `/yahoo/start` is Auth: true on the gateway — browser nav can't carry
    Bearer header. Use the JSON path from authFetch.

Environment:
  - Single repo at /Users/doni/code/myscrollr (monorepo).
  - User's dev MCP session is running in the background. Connect via
    mcp_Tauri_driver_session(action: "start", port: 9223).
  - User has 2 imported Yahoo leagues (Stanton Again A Fuck League, Scrollr League).
  - GitHub `gh` CLI auth is configured. Squash-merge with --delete-branch.
  - There is one open stranger PR #104 ("Feature/favorite team selection")
    from Enanimate, 5 weeks old, almost certainly conflicts with this work.
    Triage before touching.

First concrete action:
  Ask the user what they want next. The natural next step is tagging
  `desktop-v1.0.12` and pushing it to cut the release. Other candidates
  from the backlog: Fantasy `.feed` venue plumbing, bundle-size code-splitting,
  PR #104 triage. Backlog: docs/superpowers/handoffs/backlog.md.
```
