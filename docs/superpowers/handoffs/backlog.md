## Backlog

### In Progress
- (none)

### Pending
- [ ] Optional: switch to API-key notarization (`APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_ID`) instead of Apple-ID + app-specific password. Cleaner credential rotation; no immediate user-facing benefit. Tauri's bundler supports both auth modes.
- [ ] Optional: split notarize into its own retryable job after the main build. With `continue-on-error: true` + an explicit retry step, a runner-network flake costs ~5 min and one click instead of ~25 min and a full re-build. Defer until the timeout cap proves insufficient.

### Done
- [x] Diagnosed run #25578604859 — **not** an Apple notary issue. macos-14 runner lost network connectivity (`NSURLErrorDomain -1009`, `_NSURLErrorNWPathKey=unsatisfied (No network route)`) while polling notarytool for submission `43b5a62e-…`. Codesigning fully succeeded before the network drop.
- [x] Added `timeout-minutes: 25` to the desktop-release build job. Bounds notarize-poll hangs to ~25 min vs. the 51-min run that killed PR throughput.
- [x] Reverted the `notarize` workflow_dispatch toggle (run #25605423069 confirmed the toggle broke notarization on push: `Team ID must be at least 3 characters`). Tauri's bundler gates notarize on env-var *presence*, not value, and GitHub Actions' `env:` map sets vars even when values are `''`. Apple secrets are now unconditionally passed; macOS builds are signed AND notarized on every push.
