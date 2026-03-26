# Scrollr Desktop 1.0.0 — Release Checklist

## Tier Reference

| Feature | Free | Uplink ($9.99/mo) | Uplink Pro ($24.99/mo) | Uplink Ultimate ($49.99/mo) |
|---|---|---|---|---|
| **Data delivery** | 60s polling | 30s polling | 10s polling | Real-time SSE |
| **Tracked symbols** | 5 | 25 | 75 | Unlimited |
| **News feeds** | 1 | 25 | 100 | Unlimited |
| **Sports leagues** | 1 | 8 | 20 | Unlimited |
| **Custom news feeds** | 0 | 1 | 3 | 10 |
| **Fantasy leagues** | 0 | 1 | 3 | 10 |
| **Custom alerts** | No | No | Yes *(post-v1)* | Yes *(post-v1)* |
| **Feed profiles** | No | No | Yes *(post-v1)* | Yes *(post-v1)* |
| **Widgets** | All | All | All | All |
| **Premium widgets** | No | No | Yes *(future)* | Yes *(future)* |
| **Webhooks** | No | No | No | Yes *(post-v1)* |
| **Data export** | No | No | No | Yes *(post-v1)* |
| **API access** | No | No | No | Yes *(post-v1)* |

**Tier pitches:**
- **Free → Uplink**: 5× symbols, 25× news feeds, 8 sports leagues, 1 fantasy league, 2× faster data. More of everything.
- **Uplink → Pro**: Higher limits again, plus new capabilities when they ship (alerts, profiles).
- **Pro → Ultimate**: Real-time SSE is the headline. Symbols, news, and sports become unlimited.

Annual pricing: Uplink $79.99/yr, Uplink Pro $199.99/yr, Uplink Ultimate $399.99/yr.
Lifetime: $399 one-time (permanent Uplink-tier access + 50% off Ultimate upgrade).
All paid tiers include a 7-day free trial.

---

## Verified Complete

> Confirmed done by codebase audit (March 2026). Kept for reference.

- [x] Stripe webhook signature verification
- [x] Tauri capability scoping (main vs ticker window split)
- [x] Tighten Tauri HTTP scope (ticker locked to API + auth only; main keeps `https://*/*` for Uptime Kuma widget)
- [x] Dependency audit in CI (`npm audit` + `cargo audit` in release workflow, `continue-on-error`)
- [x] Database migrations (golang-migrate for Go APIs, sqlx::migrate for Rust services; run on startup)
- [x] Tier rename: `uplink_unlimited` → `uplink_ultimate`, added `uplink_pro` (Logto roles, Stripe products, Go + TS types, DB values)
- [x] Upgrade/downgrade flows (immediate proration for upgrades, Subscription Schedules for downgrades, preview modals, frontend fully wired)
- [x] Account page billing info (price, cadence, renewal date, pending downgrade notice, Change Plan link)
- [x] Handle deleted Stripe customers in `getOrCreateStripeCustomer`
- [x] Webhook event idempotency (`stripe_webhook_events` table, dedup before processing, 7-day TTL cleanup)
- [x] Legal doc sync (pricing matches current tiers, quarterly billing references fully removed)
- [x] Pricing page rewrite (tier names, limits, "Coming Soon" labels, removed feed retention + referral program)
- [x] Auto-updater (state machine UI: check → download with progress → restart; minisign updater signing; same-version patch detection)
- [x] Toast notification system (Sonner, dark theme, 30+ toast calls across 7 files covering all key user actions)
- [x] Auth token refresh (silent refresh with 60s buffer, mutex for concurrent safety, SSE reconnect on 401, session-expired banner)
- [x] `X-User-Tier` header forwarding (core proxy sets it at `proxy.go:162` — channels don't read it yet, that's Track 4)
- [x] SSE delivery for Uplink Ultimate (Rust client → Hub → Sequin CDC pipeline)
- [x] Error boundaries (`RouteError` on all 6 routes + `QueryErrorBanner` for widget data)
- [x] Empty states (`DashboardEmptyState` + `EmptyChannelState` covering all channels and dashboard cards)
- [x] Wire `subscriptionTier` prop into all config panels (plumbed through ChannelConfigPanel — unused until enforcement)

---

## Track 1 — Code Signing & Distribution

> Start day 1. External wait times (Apple review ~24-48h, certificate issuance varies). Hard gate on shipping — Gatekeeper and SmartScreen block unsigned binaries.

- [ ] Apple Developer Program enrollment ($99/yr) + Developer ID Application certificate
- [ ] Configure macOS notarization in CI (`notarytool submit` + `stapler staple`)
- [ ] Windows Authenticode code signing certificate (EV or OV)
- [ ] Configure Windows signing in CI (`signtool sign`)
- [ ] Test auto-updater end-to-end (install old version → push update → verify download + install + restart)

---

## Track 2 — Billing

> Free trial is a compliance risk — pricing page promises "7-day free trial" but checkout charges immediately. Stripe Customer Portal is the only way users can update payment methods or view invoices.

- [ ] Implement 7-day free trial (add `subscription_data.trial_period_days: 7` to `billing.go:HandleCreateCheckoutSession`)
- [ ] Integrate Stripe Customer Portal (new endpoint to create portal session; link from website billing UI + desktop app)
- [ ] Handle Customer Portal browser handoff from desktop app (open portal URL in default browser via Tauri `shell:open`)
- [ ] Failed payment dunning: add "Update payment method" CTA in `past_due` UI state + user notification (webhook already sets `past_due` in DB)
- [ ] Test resubscribe after cancel (full lifecycle: subscribe → cancel → wait for period end → resubscribe)
- [ ] Desktop billing UI on Account page:
  - [ ] "Manage Subscription" button (opens Stripe Customer Portal in browser)
  - [ ] Current plan with tier limits summary
  - [ ] Upgrade prompt linking to website pricing page

---

## Track 3 — Website Pivot

> Full pivot from browser extension to desktop app. 18 files affected. Hero visual: "Desktop Workspace" concept (animated desktop with real app windows + ticker at bottom edge). HowItWorks: "Download → Choose Your Data → Work as Usual."

### Download Page (new route)
- [ ] Create `/download` route with OS detection (`navigator.platform` / `navigator.userAgent`)
- [ ] Download buttons: macOS (Apple Silicon), macOS (Intel), Windows (x64), Linux (AppImage)
- [ ] System requirements + unsigned binary instructions (until code signing is done)
- [ ] Link to GitHub releases as fallback

### Landing Page Rewrites
- [ ] Delete `src/components/InstallButton.tsx`
- [ ] Create `DownloadButton.tsx` component (replaces InstallButton across the site)
- [ ] Rewrite `HeroBrowserStack.tsx` → Desktop Workspace visual (animated desktop with app windows + ticker at bottom edge)
- [ ] Rewrite `HowItWorks.tsx` → "Download → Choose Your Data → Work as Usual" (new visuals for steps 1 + 3)
- [ ] Update `HeroSection.tsx` (copy: "bottom of your browser" → desktop language; swap InstallButton for DownloadButton)
- [ ] Update `FAQSection.tsx` (every answer references browser/extension — reframe all for desktop)
- [ ] Update `CallToAction.tsx` (swap button + copy; replace browser list with platform list: macOS / Windows / Linux)
- [ ] Update `ChannelsShowcase.tsx` ("every tab" → "your desktop", 3 lines)
- [ ] Update `BenefitsSection.tsx` ("specific sites" + browser-tab illustration → desktop)
- [ ] Update `TrustSection.tsx` ("Your browser, your data" → "Your device, your data")
- [ ] Update `Footer.tsx` (remove Chrome/Firefox store links; add Download link; update tagline)
- [ ] Update `routes/index.tsx` meta description
- [ ] Update `routes/architecture.tsx` (Extension tech stack card → Desktop: Tauri v2, React, Rust)
- [ ] Update `routes/uplink.tsx` (4 FAQ lines referencing "extension")
- [ ] Update `index.html` (3 meta tags: description, og:description, twitter:description)
- [ ] Update `Header.tsx` comment (1 line)
- [ ] Update `useGetToken.ts` comment (1 line)

### Dead Code Removal
- [ ] Evaluate `useScrollrAuth.tsx` bridge auth system (extension relay via CustomEvents — likely dead code if desktop doesn't use it)
- [ ] Remove bridge auth if confirmed dead; simplify to Logto-only auth

### Legal Documents (`documents.ts`)
- [ ] Delete or replace "Browser Extension Privacy" document (#6, lines 399-456)
- [ ] Create "Desktop Application Privacy" document (local storage: `scrollr.json` with 16+ keys, log files, system info access, auto-update endpoint)
- [ ] Add "Desktop Application" section to Terms of Service (parallel to existing "Browser Extension" section)
- [ ] Update Privacy Policy body: "browser extension and web dashboard" → include desktop app data handling
- [ ] Update Cookie & Storage Policy: add "Desktop Application Storage" section
- [ ] Update Security Policy scope: add desktop application
- [ ] Update Accessibility Statement: add desktop app section
- [ ] Update Acceptable Use Policy scope: add desktop application
- [ ] **Fix Finnhub → TwelveData** (9 occurrences across Privacy Policy, Financial Disclaimer, Third-Party Attribution — material inaccuracy)
- [ ] Disclose desktop local data: auth tokens, preferences, widget configs, log files, system info access (CPU/GPU/memory/temps/network)

---

## Track 4 — Tier Enforcement

> Client-side enforcement in the desktop app config panels. The `subscriptionTier` prop already flows into every config panel — it just needs to be used. Server-side enforcement deferred to v1.1.

- [ ] Finance: enforce symbol limit (Free=5, Uplink=25, Pro=75, Ultimate=unlimited)
- [ ] RSS: enforce feed count limit (Free=1, Uplink=25, Pro=100, Ultimate=unlimited)
- [ ] RSS: enforce custom feed limit (Free=0, Uplink=1, Pro=3, Ultimate=10); block "Add Custom Feed" for Free
- [ ] Sports: enforce league count limit (Free=1, Uplink=8, Pro=20, Ultimate=unlimited)
- [ ] Fantasy: gate channel entirely for Free tier (upgrade prompt instead of Yahoo connect flow)
- [ ] Fantasy: enforce league import limit (Uplink=1, Pro=3, Ultimate=10)
- [ ] Usage indicators in all config panels ("12/25 symbols tracked")
- [ ] Shared `UpgradePrompt` component reused across all channels
- [ ] Server-side SSE access gating (restrict `/events` endpoint to `uplink_ultimate` role only — currently any authenticated user can connect, bypassing tier model)

---

## Track 5 — Ship Readiness

### Security
- [ ] Configure CSP headers in Tauri webview (restrict script-src, connect-src to known domains — currently no explicit CSP)

### Legal
- [ ] Bundle AGPL license with binary (add `LICENSE` to `tauri.conf.json` `bundle.resources`)
- [ ] Final legal review pass after Track 3 legal doc updates

### Testing & Release
- [ ] Cross-platform testing (macOS arm64, Windows x64, Linux x64 — all three CI targets)
- [ ] Performance baseline (startup time, idle memory usage, no memory leaks on long runs)
- [ ] Verify rollback plan (unpublish GitHub release + push hotfix via auto-updater if critical bug found)
- [ ] Create root README.md (none exists — only `myscrollr.com/README.md` which still says "Chrome extension")
- [ ] Prepare release notes
- [ ] Draft launch announcement

---

## v1.1 Backlog

> Deferred items. Important but not launch-blocking.

### Enforcement
- [ ] Server-side item count limits (channel APIs read `X-User-Tier` and validate counts on add — ~2-3 hours)
- [ ] Server-side polling rate enforcement (Free=60s, Uplink=30s, Pro=10s, Ultimate=SSE — separate half-day)
- [ ] ~~Server-side SSE access gating~~ *(promoted to Track 4)*

### Stability & Polish
- [ ] Crash reporting (Sentry or equivalent — desktop + Go APIs + Rust services)
- [ ] Offline detection + graceful degradation (show cached data, pause queries)
- [ ] Window state persistence (main window size/position across restarts)
- [ ] API retry with custom backoff (currently TanStack Query `retry:1` default only)
- [ ] 429 rate limit handling on frontend
- [ ] Stale data visual indicators in UI
- [ ] Loading state audit (skeleton/shimmer components — currently text-based only)
- [ ] Fix configure page flash when adding items from catalog

### Features
- [ ] First-run onboarding wizard (beyond current welcome empty state + ghost cards)
- [ ] Channel/widget discovery catalog (browsable UI)
- [ ] Full Account tab (profile, billing summary, usage stats, connected accounts)

### Support & Docs
- [ ] In-app "Report a Bug" link (pre-filled GitHub issue)
- [ ] GitHub issue templates (bug report, feature request)
- [ ] Changelog / "What's New" display after updates
- [ ] Help docs / FAQ accessible from app

### Security Hardening
- [ ] ~~CSP headers~~ *(promoted to Track 5)*
- [ ] Tighten main window HTTP scope (currently `https://*/*` — evaluate restricting to known domains)
- [ ] CORS configuration review
- [ ] Input validation audit (currently ad-hoc `if field == ""` across all APIs)
- [ ] Config JSONB schema validation (channel config accepted with no shape validation)

### Website
- [ ] Desktop screenshots or preview video on landing page
- [ ] Update sitemap.xml (stale routes: /discover, /integrations, /onboard)
