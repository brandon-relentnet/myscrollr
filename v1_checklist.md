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

## Phase 1 — Foundation

### Security
- [x] Confirm Stripe webhook signature verification is implemented
- [x] Tauri capability scoping (main vs ticker split)
- [x] Tighten Tauri HTTP scope (removed `http://*:*` from both capabilities; main window keeps `https://*/*` for Uptime Kuma widget; ticker locked to API + auth only)
- [ ] Review / add CSP headers in Tauri webview
- [ ] CORS configuration review (channel APIs have no CORS — relies on core proxy, but verify; extension auth CORS fixed: `*` → env-configurable origins with `Vary: Origin`)
- [ ] Input validation audit across all API endpoints (currently ad-hoc field checks, no schema validation)
- [x] Dependency audit (`npm audit` + `cargo audit` added to CI release workflow with `continue-on-error`)

### Distribution & Signing
> **Highest-risk items on the list.** Gatekeeper and SmartScreen block unsigned binaries. Hard gate on shipping.
- [ ] Apple Developer certificate + notarization setup
- [ ] Windows Authenticode code signing certificate
- [ ] Update CI workflow to use OS-level signing credentials (currently only has minisign for updater artifacts)

### Billing & Monetization
> Resolved: all four tiers (free / uplink / uplink_pro / uplink_ultimate) now have distinct backend roles, Stripe products, and frontend types. Upgrade/downgrade/cancel flows work end-to-end on the website.
- [x] Rename `uplink_unlimited` → `uplink_ultimate` across codebase (Logto role, `tierFromRoles()`, `planFromPriceID()`, TypeScript `SubscriptionTier` type, DB values) and display name to "Uplink Ultimate"
- [x] Add `uplink_pro` backend role to Logto and update `tierFromRoles()` / `planFromPriceID()` to distinguish all four tiers
- [x] Create Stripe products/prices for all tiers (Uplink, Pro, Ultimate, Lifetime) and 50% off lifetime coupon in Stripe sandbox
- [x] Plan upgrade with immediate prorated charge (`always_invoice` + proration preview with exact dollar amount)
- [x] Plan downgrade via Stripe Subscription Schedule (keeps current tier until period end, switches at renewal)
- [x] Confirmation modal with exact proration amount (upgrade) or scheduled date (downgrade)
- [x] Pricing page shows Current Plan / Upgrade / Downgrade / Downgrade Scheduled labels based on active subscription
- [x] Account page shows billing price, cadence, renewal date, pending downgrade notice, and Change Plan link
- [x] Handle deleted Stripe customers in `getOrCreateStripeCustomer` (Stripe returns 200 with `Deleted=true`)
- [ ] Integrate Stripe Customer Portal (update payment method, view invoice history)
- [ ] Handle Stripe Customer Portal browser handoff from desktop app (can't embed — needs browser redirect)
- [x] Add webhook event idempotency (deduplicate redelivered Stripe events — `stripe_webhook_events` table with 7-day TTL cleanup)
- [ ] Handle failed payments / dunning (grace period + user notification — `invoice.payment_failed` currently sets `past_due` but does nothing else)
- [ ] Implement 7-day free trial in Stripe checkout flow (not currently active — Stripe charges immediately; needs `subscription_data.trial_period_days` in checkout session params)
- [ ] Test full billing lifecycle: resubscribe after cancel (subscribe, upgrade, downgrade, and cancel are all verified)
- [ ] Billing UI in desktop app (browse tiers, current plan display, manage subscription link — purchases can redirect to website)

### Database & Infrastructure
- [x] Database migrations strategy (`CREATE TABLE IF NOT EXISTS` on startup won't handle schema changes in production — adopt golang-migrate, goose, or atlas)

### Legal Doc Sync
> **Pricing page and legal documents are out of sync.** Legal docs reference old pricing and quarterly billing that no longer exists.
- [x] Update legal documents to match current pricing and tier names (Terms of Service, Privacy Policy)
- [x] Remove quarterly billing references from `SubscriptionStatus` type and `planFromPriceID` (removed in tier rename PR)
- [x] Remove quarterly billing references from legal docs text

### Phase 1 Validation
- [x] Auto-updater implemented with progress UI and GitHub releases endpoint
- [ ] Test auto-updater end-to-end (install old version → push update → verify install)

---

## Phase 2 — Product

### Crash Reporting
> Moved from Phase 3 — capturing bugs during active development is more valuable than waiting until pre-launch.
- [ ] Integrate crash reporting (Sentry or equivalent) across desktop app, Go APIs, and Rust services

### Toast Notification System
- [ ] Implement toast notification system (success, error, info feedback across the app)

### Tier Enforcement — Infrastructure
> **Currently zero server-side enforcement.** Channel APIs receive `X-User-Sub` but not tier info. Client-side polling intervals are trivially bypassable. The `subscriptionTier` prop already flows into Finance, Sports, and Fantasy config panels but is unused. RSS config panel doesn't receive it at all.
- [ ] Forward tier info from core API to channel APIs (add `X-User-Tier` header to proxy) — **prerequisite for all enforcement below**
- [ ] Server-side rate limiting per tier (enforce polling intervals server-side, not just client-side)
- [x] Wire `subscriptionTier` into RSS (`NewsConfigPanel`) — was the only channel missing the prop

### Tier Enforcement — Finance
- [ ] Enforce tracked symbol limit: Free=5, Uplink=25, Pro=75, Ultimate=unlimited
- [ ] Show usage indicator in config panel (e.g. "12/25 symbols tracked")
- [ ] Block symbol additions beyond limit with upgrade prompt

### Tier Enforcement — News (RSS)
- [ ] Enforce news feed count limit: Free=1, Uplink=25, Pro=100, Ultimate=unlimited
- [ ] Enforce custom news feed limit: Free=0, Uplink=1, Pro=3, Ultimate=10
- [ ] Block "Add Custom Feed" form for Free tier
- [ ] Show usage indicator and upgrade prompt at limit

### Tier Enforcement — Sports
- [ ] Enforce sports league count limit: Free=1, Uplink=8, Pro=20, Ultimate=unlimited
- [ ] Show usage indicator and upgrade prompt at limit

### Tier Enforcement — Fantasy
- [ ] Gate Fantasy channel entirely for Free tier (0 leagues — show upgrade prompt instead of Yahoo connect flow)
- [ ] Enforce fantasy league count limit: Uplink=1, Pro=3, Ultimate=10
- [ ] Block league import beyond limit with upgrade prompt

### Tier Enforcement — Data Delivery
- [x] SSE delivery implemented for Uplink Ultimate (Rust client → Hub → Sequin CDC pipeline)
- [ ] Enforce polling intervals server-side: Free=60s, Uplink=30s, Pro=10s, Ultimate=SSE
- [ ] Enforce server-side SSE access: only `uplink_ultimate` should open `/events` (currently client-side gate only in `App.tsx`)

### Tier Enforcement — UX
- [ ] Graceful upgrade prompts when users hit a limit (nudge, not hard error)
- [ ] Consistent upgrade prompt component reused across all channels

### Pricing Page
> **No "Coming Soon" labels exist on the pricing page.** Unbuilt features are presented as included. Pricing page also needs to reflect the new tier names, limits, and structure.
- [x] Rewrite pricing page to reflect new tier names (Uplink / Uplink Pro / Uplink Ultimate), limits, and structure
- [x] Mark post-v1 features as "Coming Soon": Custom alerts, Feed profiles, Webhooks, Data export, API access
- [x] Remove feed retention from pricing page (internal concern, not a user-facing feature)
- [x] Remove referral program from pricing page (no backend support exists)
- [x] Verify lifetime deal page reflects correct tier name (Uplink Ultimate) and current pricing

### Stability & Error Handling
- [ ] Test and fix auth token expiry / silent refresh behavior
- [ ] Offline detection + graceful degradation (show last-known data, not a blank screen)
- [ ] API connection recovery / automatic retry with backoff
- [ ] Handle rate limit (429) responses gracefully on the frontend
- [ ] Stale data indicators (if data is old, make it visible)
- [ ] Window state persistence (remember size and position across restarts — currently only saves ticker position preference, not actual window geometry)

### Core UX
- [x] Error boundaries (`RouteError.tsx` across all 6 route groups)
- [x] Empty states (`DashboardEmptyState` and `EmptyChannelState` implemented)
- [ ] First-run onboarding flow (guide new users through initial setup — currently only a basic welcome state)
- [ ] Channel/widget discovery catalog (browsable UI to find and enable sources)
- [ ] Fix flashing on configure page when adding items from catalog
- [ ] Flesh out Account tab (profile info, billing summary, usage stats, connected accounts)
- [ ] Audit all loading states (no layout shift, no blank screens)

---

## Phase 3 — Pre-launch

### Bug Reporting & Support
- [ ] Add in-app "Report a Bug" link (pre-filled GitHub issue or form)
- [ ] Create GitHub issue templates (bug report, feature request)
- [ ] Changelog / "What's New" display after updates
- [ ] Basic help docs or FAQ accessible from the app

### Legal & Compliance
- [ ] Update Privacy Policy to cover desktop app (local storage, network requests, data handling)
- [ ] Update Terms of Service for desktop distribution
- [ ] Ensure AGPL license is bundled with the binary
- [ ] Review data collection disclosure (even if it's "we collect nothing")

### Website Overhaul
> **Site is deeply extension-oriented.** `InstallButton`, `HeroBrowserStack`, `HowItWorks`, `CallToAction`, and more reference Chrome/Firefox stores. The download page with OS detection is a meaningful feature build on its own.
- [ ] Remove all extension references (~15+ files: InstallButton, HeroBrowserStack, FAQs, HowItWorks, CallToAction, Footer)
- [ ] Build download page with OS detection (macOS / Windows / Linux, handle unsigned binary warnings)
- [ ] Update hero section with desktop app visuals
- [ ] Update "How It Works" section for desktop flow
- [ ] Update all FAQs for desktop context
- [ ] Update footer links (remove Chrome Web Store / Firefox Add-ons)
- [ ] Add desktop screenshots or preview video

---

## Phase 4 — Ship It

### Launch Preparation
- [ ] Cross-platform testing pass (macOS arm64, Windows x64, Linux x64)
- [ ] Performance baseline (startup time, idle memory usage, no memory leaks on long runs)
- [ ] Verify rollback plan (unpublish GitHub release + push hotfix via auto-updater if critical bug found)
- [ ] Update project README to reflect desktop as primary product
- [ ] Prepare release notes template
- [ ] Draft launch announcement
