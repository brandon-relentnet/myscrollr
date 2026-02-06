# Yahoo Sync Implementation Plan

## Architecture Overview

```
Ingestion (Rust) → Postgres → Sequin → Go API (Webhook Handler) → Redis (Pub/Sub) → Go API (SSE Endpoint) → SharedWorker → React UI
```

## Completed

- [x] Yahoo OAuth flow (popup → callback → user registered)
- [x] User data stored in `yahoo_users` table with `logto_sub`
- [x] Simplified Rust service to polling loop (removed Redis pub/sub)
- [x] Token refresh handles `token_missing` and `token_expired`
- [x] Callback URL validated (rejects Coolify template strings)
- [x] Sequin configured for `yahoo_leagues`, `yahoo_standings`, `yahoo_matchups`
- [x] Frontend handles CDC events, accumulates league/standings/matchup data
- [x] `/users/me/yahoo-status` returns `connected` + `synced` states
- [x] Dashboard shows 3 states: Not Connected → Connected/Syncing → League Cards
- [x] `yahoo-auth-complete` postMessage triggers status check (no page reload)
- [x] Removed Vercel analytics (not on Vercel)
- [x] Fixed render loop causing 429s on yahoo-status endpoint
- [x] Missing matchups handled gracefully (optional fields)
- [x] Inaccessible leagues ("must be logged in") fail fast without retrying

## Current Issue: Slow Sync

The Rust service syncs leagues sequentially. Each user has ~20 leagues, and each
league requires separate API calls for standings + matchups per team. A full sync
takes 3-5 minutes per user.

## Phase 5: Optimize Sync Speed (Current Sprint)

### 5.1 Parallelize league syncing within a user
- [ ] Use `tokio::spawn` or `futures::stream::FuturesUnordered` to sync multiple leagues concurrently
- [ ] Limit concurrency to avoid Yahoo API rate limits (e.g. 5-10 concurrent)

### 5.2 Skip unchanged leagues
- [ ] Store `updated_at` per league and skip if recently synced
- [ ] Only re-sync leagues whose season is active

### 5.3 Frontend: Load existing data on page load (don't wait for SSE)
- [ ] Add Go API endpoint: `GET /users/me/yahoo-leagues` that queries DB directly
- [ ] Dashboard fetches on mount, SSE updates are additive

## Future Phases

### Phase 6: Per-user SSE filtering
- Go webhook handler should tag events with `guid`
- Frontend filters SSE events by logged-in user's GUID
- Prevents leaking other users' fantasy data

### Phase 7: Production hardening
- Set `SYNC_INTERVAL_SECS=900` (15 min) in production
- Add `SEQUIN_WEBHOOK_SECRET` for webhook auth
- Rate-limit `/users/me/yahoo-status` endpoint
