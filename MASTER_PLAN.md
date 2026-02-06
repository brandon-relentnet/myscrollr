# Scrollr Real-Time Sync Master Plan

This document tracks the implementation of the real-time data pipeline:
**Sequin (CDC) → Webhook → Go API (Redis Pub/Sub) → SSE → Frontend/Extension.**

---

## 🏗 Phase 1: Backend Implementation (Go + Redis)

The goal is to turn the API into a real-time relay using Redis as the event bus.

- [x] **1.1 Update Redis Client (`api/redis.go`)**
  - [x] Add `Publish` method wrapper.
  - [x] Add `Subscribe` method wrapper to return a Go channel.
  - _Checkpoint:_ Verify Redis connection supports Pub/Sub (no errors on startup).

- [x] **1.2 Create Event Hub (`api/events.go`)**
  - [x] Define `Broadcast` function that takes a payload and publishes to Redis `events:broadcast`.
  - [x] Define `Listen` function that subscribes to Redis and forwards to a local Go channel for the SSE handler.

- [x] **1.3 Implement SSE Endpoint (`GET /events`)**
  - [x] Create handler in `api/handlers_stream.go` (new file).
  - [x] Set proper SSE headers (`text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).
  - [x] **Critical:** Implement a "Heartbeat" (ping) every 15s to prevent load balancer timeouts.
  - [x] Loop and write data from the Event Hub to the HTTP response.
  - [x] Handle client disconnects (context cancellation).
  - _Checkpoint:_ User can `curl -N http://localhost:8080/events` and see a connection held open with periodic pings.

- [x] **1.4 Implement Sequin Webhook (`POST /webhooks/sequin`)**
  - [x] Create handler in `api/handlers_webhook.go` (new file).
  - [x] Define `SequinPayload` struct matching `insert/update/delete` events.
  - [x] Implement Sequin Secret verification (HMAC SHA256 via `Sequin-Signature` header).
  - [x] On valid payload: Call `Broadcast`.
  - _Checkpoint:_ Send a dummy `POST` request with `curl` and see the data appear in the open `GET /events` stream.

---

## 🛠 Phase 2: Configuration & Sequin Setup

Connecting the external producer to our internal consumer.

- [ ] **2.1 Configuration**
  - [ ] Add `SEQUIN_WEBHOOK_SECRET` to `.env` (local and Coolify).
  - [ ] Add `SEQUIN_WEBHOOK_URL` to known configs (for reference).

- [ ] **2.2 Sequin Dashboard Setup (Manual Action)**
  - [ ] Create "Webhook Sink".
  - [ ] URL: `https://api.myscrollr.relentnet.dev/webhooks/sequin`.
  - [ ] Select Tables: `trades`, `games`.
  - [ ] Copy the Secret -> Update Environment.

- [ ] **2.3 Proxy Tuning (Coolify/Traefik)**
  - [ ] **Action:** Increase connection timeout for `/events` route to avoid 60s disconnects.
  - _Checkpoint:_ Connection stays open for > 2 minutes.

---

## 💻 Phase 3: Frontend Implementation (React)

Consuming the stream efficiently using a Shared Worker architecture.

- [x] **3.1 Shared Worker (`myscrollr.com/src/workers/sse-worker.ts`)**
  - [x] Create worker file.
  - [x] Implement `EventSource` connection to `/events`.
  - [x] Implement robust reconnection logic (exponential backoff).
  - [x] Handle `BroadcastChannel` to communicate with tabs.

- [x] **3.2 React Hook (`useRealtime.ts`)**
  - [x] Create hook to instantiate/connect to the worker.
  - [x] **Strategy:** "Hybrid Sync" - Fetch initial state via REST, then apply updates from Stream.
  - [x] maintain `latestTrades` and `latestGames` state.
  - [x] expose `status` (connected/disconnected/reconnecting).

- [x] **3.3 Dashboard Integration (`dashboard.tsx`)**
  - [x] Replace polling/static data in `FinanceConfig` and `SportsConfig` with `useRealtime` data.
  - [x] Add visual indicator for "Live Stream" status (Green/Red dot).

---

## 🧩 Phase 4: Extension Integration (Skipped)

*Skipped for now per user request.*

- [ ] **4.1 Background Script Integration**
  - [ ] Adapt the SSE logic for the Extension's Background Service Worker (Manifest V3).
  - [ ] Ensure `manifest.json` allows connection to `api.myscrollr.relentnet.dev`.

- [ ] **4.2 Extension State Sync**
  - [ ] Use Chrome Storage or Message Passing to send updates from Background -> Popup.

---

## ✅ Final Verification

- [x] **End-to-End Test:**
  1.  Update a record in Postgres manually (or wait for ingestion).
  2.  Verify Sequin sends Webhook.
  3.  Verify API logs reception.
  4.  Verify Dashboard updates without refresh.

---

## 🏈 Phase 4: Fantasy Integration (Option 1)

Connecting the existing Yahoo ingestion to the real-time dashboard.

- [ ] **4.1 Sequin Configuration (Manual)**
  - [ ] Add `yahoo_leagues` to the existing Sequin Webhook Sink table list.
  - [ ] *Note:* This table contains a `data` JSONB column which holds the full nested structure (`FantasyContent`).
  - _Checkpoint:_ Verify `yahoo_leagues` updates appear in the SSE stream via `curl -N .../events`.

- [x] **4.2 Frontend Types (`myscrollr.com/src/types/yahoo.ts`)**
  - [x] Create TypeScript interfaces matching the Go `FantasyContent` struct (Users, Games, Leagues, Teams, Rosters).
  - [x] Export these types for use in the dashboard.

- [x] **4.3 Real-time Hook Update (`useRealtime.ts`)**
  - [x] Add `yahooData` to the state.
  - [x] Listen for `yahoo_leagues` updates from the worker.
  - [x] Implement logic to merge the incoming `data` JSONB blob into the state.

- [x] **4.4 Dashboard Integration (`dashboard.tsx`)**
  - [x] Update `FantasyConfig` to accept `yahooData` prop.
  - [x] Replace hardcoded "Sleeper League" data with dynamic league rendering.
  - [x] Added `LeagueCard` component with standings display (rank, W-L record, points for).
  - [x] Handle "Empty State" (Prompt user to `/yahoo/start` if no data exists).

---

## 📰 Phase 5: RSS Feeds (Option 2)

Building a new microservice to ingest news and stream it.

- [ ] **5.1 Ingestion Service (`ingestion/rss_service`)**
  - [ ] Initialize new Rust crate in the workspace.
  - [ ] Dependencies: `rss`, `reqwest`, `tokio`, `sqlx`.
  - [ ] Implement `FeedManager` to poll a list of URLs (e.g., HackerNews, TechCrunch) every 5 minutes.
  - [ ] Implement database storage to upsert items.

- [ ] **5.2 Database Migration**
  - [ ] Create table `rss_items`:
    - `guid` (Primary Key)
    - `title`
    - `link`
    - `pub_date`
    - `source`
    - `created_at`

- [ ] **5.3 Backend Integration**
  - [ ] Add `rss_items` to Sequin sync.
  - [ ] (Optional) Add `GET /rss` endpoint to Go API for initial fetch (Hybrid Sync).

- [ ] **5.4 Frontend Integration**
  - [ ] Update `useRealtime.ts` to handle `rss_items` stream.
  - [ ] Update `RssConfig` in `dashboard.tsx` to render the live list.

---

### 📝 Changelog
- **1.3 SSE Endpoint:** Added "Heartbeat" requirement. Proxies (like Cloudflare/Traefik) often silently drop idle connections after 60s. Sending a comment line (`: ping`) every 15s keeps the pipe open.
- **1.4 Sequin Webhook:** Specified `Sequin-Signature` header for the HMAC check to ensure we match Sequin's security standard.
- **3.2 React Hook:** Added "Hybrid Sync" strategy. Pure streaming can miss events that happened *while* connecting. Best practice is to Fetch Snapshot -> Connect Stream -> Apply future updates.
- **4.1 Extension:** Clarified that this will use the "Background Service Worker" (standard for MV3 extensions) rather than a Shared Worker, though the logic is identical.
