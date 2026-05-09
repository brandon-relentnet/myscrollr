## Backlog

### In Progress
- (none)

### Pending
- [ ] Verify the DMG notarize+staple step end-to-end against the next push-triggered Desktop Release run. Download the DMG, run `spctl --assess --type install` and `xcrun stapler validate`. Expected: both pass. If `continue-on-error: true` masked a silent failure, the spctl check is the only thing that catches it — no soft assertion on the GitHub Actions side.
- [ ] Optional: switch to API-key notarization (`APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_ID`) instead of Apple-ID + app-specific password. Cleaner credential rotation. Tauri's bundler and `xcrun notarytool` both support this auth mode.
- [ ] Optional: split notarize into its own retryable job after the main build. With `continue-on-error: true` + an explicit retry step, a runner-network flake costs ~5 min and one click instead of ~25 min and a full re-build. Defer until the timeout cap proves insufficient.

### Done
- [x] Diagnosed run #25578604859 — **not** an Apple notary issue. macos-14 runner lost network connectivity (`NSURLErrorDomain -1009`, `_NSURLErrorNWPathKey=unsatisfied (No network route)`) while polling notarytool for submission `43b5a62e-…`. Codesigning fully succeeded before the network drop.
- [x] Added `timeout-minutes: 25` to the desktop-release build job. Bounds notarize-poll hangs to ~25 min vs. the 51-min run that killed PR throughput.
- [x] Reverted the broken `notarize` workflow_dispatch toggle (run #25605423069: `Team ID must be at least 3 characters`). Tauri's bundler gates notarize on env-var *presence*, not value, and GitHub Actions' `env:` map sets vars even when values are `''`.
- [x] Verified `Scrollr.app` is fully notarized on the live `desktop-v1.0.9` release: `spctl --assess --type exec` → `accepted, source=Notarized Developer ID`; `xcrun stapler validate` → `The validate action worked!`; `codesign -dvv` shows `Notarization Ticket=stapled` and `TeamIdentifier=4S6F56VHMZ`.
- [x] Added a `Notarize and staple DMG` step to close the unnotarized-DMG-container gap. After tauri-action finishes, submits the DMG to notarytool, staples the ticket, and re-uploads to the draft release with `--clobber`. `continue-on-error: true` so a runner-network flake doesn't block the pipeline.
