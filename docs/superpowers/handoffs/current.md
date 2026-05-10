# Current Session Handoff

## Repo State
- Branch: `main`
- Worktree: clean
- Last commit: `4d94862 feat(desktop): live-preview Display panels for Sports, RSS, Fantasy (v1.0.11) (#154)`
- Version: **1.0.11** (`desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`)

## Active Task
None. PR #154 merged. Branch `refactor/desktop-display-previews` deleted.

## What Just Shipped (v1.0.11)

Live-preview Display panels for the remaining three channels —
**Sports**, **RSS**, **Fantasy** — bringing them in line with the
v1.0.10 Finance reference. Every `/channel/{type}/display` page
now shows a side-by-side Feed card + Ticker chip that update in
real time as the user toggles the visibility prefs below.

### New panels (live and ready to consume)
- **`SportsDisplayPanel`** (`desktop/src/channels/sports/DisplayPanel.tsx`) — reuses production `<GameItem mode="compact">` and `<GameChip>` so previews are byte-identical to what users see in production. Sample game prefers a live game from the user's dashboard, then any game, then a hardcoded NBA in-progress sample.
- **`RssDisplayPanel`** (`desktop/src/channels/rss/DisplayPanel.tsx`) — hand-rolled compact article row for the Feed preview (production `RssArticle` is too coupled to its grid container); reuses `<RssChip>` for the Ticker. Sample article falls back to a TechCrunch-style stub.
- **`FantasyDisplayPanel`** (`desktop/src/channels/fantasy/DisplayPanel.tsx`) — the most complex of the four. 14 venue toggles in 4 groups (Score & status / Standings / Roster / Player stats), plus followed-players picker and feed-layout segments. Sample league is engineered to light up every player-stats segment at once (top scorer, worst starter, top bench, two injuries) so users can verify each toggle does something the moment they flip it.

### `routes/channel.$type.$tab.tsx` cleanup
- Inline `SportsDisplay`, `RssDisplay`, `FantasyDisplay` removed. The route now only switches on `type` and renders the per-channel panel components. ~250 lines of inline form code now live in the channel folders where they belong.

### Bonus fix shipped with Sports
- **`GameChip` now honors `showTimer`** (default true, fully backward compatible). The persisted `showTimer.ticker` venue boolean had no visual effect prior to this — `ScrollrTicker` only read `showLogos`. Building the Sports preview surfaced the gap; closing it was a five-line change. `ScrollrTicker.tsx:286-307` now passes `showTimer` through.

### Known asymmetry NOT addressed in this PR (future follow-up)
- **Fantasy Feed-side venue plumbing.** All 14 fantasy venue toggles' `.ticker` boolean is honored by `FantasyStatChip` via `shouldShowOnTicker`. The `.feed` boolean is **not** honored by the Feed-side sub-views (`MatchupHero`, `OverviewView`, `StandingsView`, `RosterView`). The Display panel renders `<MatchupHero>` statically as the Feed preview and the helper text spells this out: "Display items currently affect the Ticker only." Propagating `shouldShowOnFeed` into the Fantasy Feed sub-views is the natural next refactor — likely a one-pass touch through MatchupHero, OverviewView's score panes, RosterView's per-player stat columns, and StandingsView's record/streak/rank columns.

### Animation vocabulary (still established, apply consistently)
- `active:scale-[0.97]` for nav items / large surfaces
- `active:scale-95` for standard buttons
- `active:scale-90` for small icon buttons (≤28px)
- `type:"spring", stiffness: 380-500, damping: 22-32` for icon swaps
- `layoutId` for elements that move between positions
- `0.18-0.25s ease-[0.22,0.61,0.36,1]` for content fades
- 40-50ms stagger delays for entrance reveals
- CSS easing tokens in `style.css`: `--ease-snap`, `--ease-pop`, `--ease-out-soft`

### Lessons learned this session (do NOT re-learn)
1. **Display previews must reflect production behavior, not aspirational behavior.** Initial draft stripped `timer/status_short/status_long` to "approximate" `showTimer = false` on the Ticker — that would have shown users a feature that didn't actually exist. The honest fix was to wire `showTimer` through `GameChip` + `ScrollrTicker` and let the production code do what the preview implied.
2. **Reuse production chip/card components in previews when possible.** `SportsDisplayPanel` reuses `GameItem` and `GameChip`; `FantasyDisplayPanel` reuses `MatchupHero` and `FantasyStatChip`. RSS hand-rolls a Feed row only because `RssArticle` is locked to its grid container's responsive layout. Reusing keeps the preview faithful to whatever changes ship to the production component later.
3. **Engineer hardcoded sample data to light up every toggle simultaneously.** Fantasy's "Sunday Funday" sample league has 4 starters with declining points, 1 bench player with points, 2 injured players (one OUT, one DTD) — chosen specifically so `topScorer` / `topThreeScorers` / `worstStarter` / `benchOpportunity` / `injuryCount` / `injuryDetail` ALL produce non-null output simultaneously. Otherwise the preview misleads users about what their toggles will do.
4. **The `_typecheck/build/test` triple is fast enough to run after every channel.** ~6 seconds total. Don't batch — catching a Sports-side regression in the Sports commit is much cheaper than untangling it in the Fantasy commit.
5. **Inherited unused-import detritus**: desktop has `noUnusedLocals: false`, so `tsc` won't catch unused imports left behind during refactors. Manually grep for the symbols you removed and prune their imports.
6. **The `Cargo.lock` may auto-regenerate during `npm run build`** since the build chains into `cargo`. If you bump versions in `Cargo.toml`, run a build before committing so the lock change rides with the version commit instead of trailing it.

### Plan deviations carried forward (do NOT undo)
- **Fantasy Feed preview intentionally does not change with toggles** — see "Known asymmetry" above. The helper copy is the contract.
- Source page Feed view uses `noContentPadding={true}` (flush rendering); Configure/Display keep the padded narrow column.
- Home uses `noContentPadding` + its own `space-y-5` wrapper.
- Settings + Catalog use breadcrumb dropdowns (`menuItems` on PageLayout) — NOT in-page tab bands.
- Channel removal still uses `ConfirmDialog`; widgets use `useUndoableAction` toast. Asymmetric on purpose (channel deletion is server-side).
- `Channel.ticker_enabled` is still dual-tracked client+server. Deferred derivation to a follow-up — don't cut over without reasoning about other clients.
- Sidebar has no Home or Catalog nav items (TopBar brand mark + `+ Add source` button cover those).

### Spec
`docs/superpowers/specs/2026-05-09-desktop-ia-refactor-design.md` — the full IA refactor design doc. 289 lines. Mental model (Library/Source/Ticker), unified page chassis, canonical-home-per-verb table, file-level impact, implementation phases.

## Risks / Open Questions
- Bundle size warning persists (`style-*.js` ~580kb). Pre-existing, unchanged by this PR. Code-splitting follow-up if needed.
- Fantasy Feed-side venue plumbing (described in "Known asymmetry") is the most natural next refactor, but it's not blocking anything user-facing today — `MatchupHero` shows a perfectly reasonable layout even when none of the venue toggles fire.
- Fantasy sample data is verbose (~120 lines of literal `LeagueResponse`). If we ever change `LeagueResponse` shape (new required field), the sample will need updating. Acceptable cost — better than fragile fixture file imports.

## Next Best Action

The Display-panel rollout is complete across all four channels. Two reasonable next directions:

**(A) Propagate `shouldShowOnFeed` into Fantasy Feed sub-views** — closes the asymmetry called out above. `MatchupHero` is the easiest target (hides win-probability bar / projected points / status pill based on the `.feed` boolean). `OverviewView` and `StandingsView` follow the same pattern. Estimated 1 session of focused work.

**(B) Bundle-size code-splitting pass** — the 580kb `style-*.js` chunk is the biggest unaddressed footnote from v1.0.10. Would need to identify which routes/components dominate it (likely Fantasy roster table + lucide icons), then `manualChunks` them. Lower urgency since the desktop ships native binaries, not over-the-wire.

```
You're picking up the Scrollr desktop on `main` after v1.0.11 shipped (PR #154). Read `docs/superpowers/handoffs/current.md` first — it has the operational state, the foundation primitives (TopBar, PageLayout, OverflowMenu, DisplayItemsGrid, PageContext, useNavHistory), the new live-preview Display panels for all four channels, and the lessons you must NOT re-learn.

**Repo**: `/Users/doni/code/myscrollr`. Desktop at `desktop/`. Branch `main`, clean. Version 1.0.11.

**Two natural next directions** — pick whichever you have appetite for:

**(A) Fantasy Feed-side venue plumbing.** The 14 venue toggles' `.ticker` boolean is honored by `FantasyStatChip`. The `.feed` boolean is currently a no-op — `MatchupHero`, `OverviewView`, `StandingsView`, `RosterView` ignore it. The v1.0.11 Fantasy Display panel calls this out in helper copy ("Display items currently affect the Ticker only") but it's an obvious gap. Touch each Feed sub-view with `shouldShowOnFeed(dp.{key})` reads, hide the corresponding visual when false. Spec lives in `docs/superpowers/specs/2026-05-09-desktop-ia-refactor-design.md`. Existing pattern in `FantasyStatChip` shows the venue-gate idiom.

**(B) Bundle-size code-splitting.** The 580kb `style-*.js` chunk has been a footnote since v1.0.10. Identify the dominant contributors (likely Fantasy roster table + lucide-icons), then split via `manualChunks` in `desktop/vite.config.ts`. The desktop ships as native binaries so this is comfort, not necessity, but it would shave perceived startup time.

**Workflow**: implement, typecheck (`cd desktop && npx tsc --noEmit`), build (`npm run build`), test (`npx vitest run`). Commit each unit of work separately. Bump to 1.0.12 in `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` when shipping. Create a feature branch (`refactor/...` or `fix/...`); never commit directly to main. PR via `gh pr create` with a HEREDOC body, then `gh pr merge --squash --delete-branch`.

**Foundations available** (don't recreate):
- `<DisplayItemsGrid>`, `<PageLayout>`, `<TopBar>`, `<OverflowMenu>`
- `Section`, `ToggleRow`, `SegmentedRow`, `ResetButton` from `desktop/src/components/settings/SettingsControls`
- `enumToBools` / `boolsToEnum` / `shouldShowOnFeed` / `shouldShowOnTicker` from `desktop/src/preferences.ts`
- `useShell` for prefs access; `useShellData` for channel data
- Per-channel DisplayPanel components in `desktop/src/channels/{finance,sports,rss,fantasy}/DisplayPanel.tsx`

**No blocking issues. Pick (A) or (B) and dive in.**
```
