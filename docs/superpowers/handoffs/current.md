# Current Session Handoff

## Repo State
- Branch: `main`
- Worktree: clean after this commit
- Latest CI fix: `fix(ci): restore always-on Apple notarization, keep 25-min timeout guard`

## What Happened (and What Got Reverted)

The notarize-toggle work in PR #151 was **wrong**. The diagnosis was right
(macos-14 runner lost network mid-poll on run #25578604859, hung 51 min)
but the fix broke notarization on push events.

### Why the toggle didn't work

Tauri's bundler decides whether to notarize by checking environment
variable *presence*, not value:

```rust
// crates/tauri-bundler/src/bundle/macos/sign.rs::notarize_auth
match (var_os("APPLE_ID"), var_os("APPLE_PASSWORD"), var_os("APPLE_TEAM_ID")) {
    (Some(apple_id), Some(password), Some(team_id)) => Ok(...),
    ...
}
```

`var_os()` returns `Some("")` for empty env vars — only `None` for unset.
GitHub Actions' `env:` map sets variables even when the value is `''`,
so the toggle's

```yaml
APPLE_TEAM_ID: ${{ inputs.notarize && secrets.APPLE_TEAM_ID || '' }}
```

passed an empty string on push events. Tauri saw "credentials present",
attempted to notarize, and `notarytool` rejected it with
`Team ID must be at least 3 characters` (run #25605423069, 8m50s fail).

To actually skip notarize while keeping signing, the env vars would need
to be **omitted entirely** from the action invocation — which requires
two parallel build steps with `if:` guards or a conditional shell step
that writes to `$GITHUB_ENV`. Not worth the complexity for a flake we
can guard with a job-level timeout.

### What actually shipped

1. **Removed** the `notarize` workflow_dispatch input and the conditional
   ternaries on `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`. All Apple
   secrets are unconditionally passed to `tauri-action`. Every build on
   `main` is now signed AND notarized — same behavior as runs predating
   the toggle (e.g. successful run #25440501573 on 2026-05-06, 10m19s).
2. **Kept** `timeout-minutes: 25` on the build job. This caps the
   notarize-poll hang documented in run #25578604859 to ~25 min instead
   of consuming the GitHub default 6h. Healthy notarized builds finish
   in ~10 min, so 25 leaves 2.5x headroom.

### The macos-14 network-drop flake is still possible

`timeout-minutes: 25` doesn't prevent the flake — it bounds the cost.
If the runner loses network mid-poll again, the job dies at 25 min and
you re-run. ~10 min healthy retry vs. 50+ min stuck. Acceptable cost
for a bug that's GitHub's, not ours.

### Why I (the agent) got this wrong the first time

Phase 1 of systematic-debugging says "gather evidence at component
boundaries before fixing." I had the evidence — the run #25578604859
log clearly showed codesigning succeeded and the failure was a network
poll, not a credential issue — but I designed a toggle to "skip
notarize when convenient" without verifying Tauri's actual gating
contract. The toggle was a solution looking for a problem. The real
ask all along was: "make sure notarize works and doesn't hang
forever." Two narrow changes, both delivered now: timeout cap +
unconditional creds.

## Next Best Action
1. The push-triggered `Desktop Release` build that follows this commit
   should complete in ~10 min on all three runners with notarized macOS
   artifacts. Watch it; if macOS finishes green, this is fully fixed.
2. If the network-drop flake recurs, the build now fails at 25 min and
   a re-run is cheap.

## Reference
- Failed runs:
  - #25578604859 — runner network drop, 58m fail (the original problem)
  - #25605423069 — `Team ID must be at least 3 characters`, 8m50s fail (caused by my broken toggle)
- Tauri bundler notarize gating: https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/macos/sign.rs (notarize_auth)
- Tauri bundler call site: https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/macos/app.rs#L135
