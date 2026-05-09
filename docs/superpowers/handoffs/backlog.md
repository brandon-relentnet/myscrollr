## Backlog

### In Progress
- [ ] Notarize toggle for desktop-release workflow — uncommitted changes in `.github/workflows/desktop-release.yml`. Adds `notarize` boolean input (default false) gating `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`. Codesigning stays always-on. Needs commit + push, then a `workflow_dispatch` smoke run with `notarize=false` to confirm macOS builds finish in ~10 min.

### Pending
- [ ] Cut a public macOS release with `notarize=true` once a stable build is ready (verifies the toggle's "on" path end-to-end).
- [ ] Optional: split notarize into its own retryable job so future flakes cost ~5 min instead of ~50. Tracked as longer-term follow-up.

### Done
- [x] Diagnosed run #25578604859 failure — Apple notarization timed out at 51m due to `NSURLErrorDomain -1009` (network drop on macos-14 runner mid-poll). Submission UUID `43b5a62e-ea70-4c70-b67b-97ad02303a11` was created; codesign + bundling all succeeded.
