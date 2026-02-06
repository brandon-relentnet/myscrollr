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

- [ ] **3.1 Shared Worker (`myscrollr.com/src/workers/sse-worker.ts`)**
  - [ ] Create worker file.
  - [ ] Implement `EventSource` connection to `/events`.
  - [ ] Implement robust reconnection logic (exponential backoff).
  - [ ] Handle `BroadcastChannel` to communicate with tabs.

- [ ] **3.2 React Hook (`useRealtime.ts`)**
  - [ ] Create hook to instantiate/connect to the worker.
  - [ ] **Strategy:** "Hybrid Sync" - Fetch initial state via REST, then apply updates from Stream.
  - [ ] maintain `latestTrades` and `latestGames` state.
  - [ ] expose `status` (connected/disconnected/reconnecting).

- [ ] **3.3 Dashboard Integration (`dashboard.tsx`)**
  - [ ] Replace polling/static data in `FinanceConfig` and `SportsConfig` with `useRealtime` data.
  - [ ] Add visual indicator for "Live Stream" status (Green/Red dot).

---

## 🧩 Phase 4: Extension Integration

Ensuring the browser extension also receives these updates.

- [ ] **4.1 Background Script Integration**
  - [ ] Adapt the SSE logic for the Extension's Background Service Worker (Manifest V3).
  - [ ] Ensure `manifest.json` allows connection to `api.myscrollr.relentnet.dev`.

- [ ] **4.2 Extension State Sync**
  - [ ] Use Chrome Storage or Message Passing to send updates from Background -> Popup.

---

## ✅ Final Verification

- [ ] **End-to-End Test:**
  1.  Update a record in Postgres manually (or wait for ingestion).
  2.  Verify Sequin sends Webhook.
  3.  Verify API logs reception.
  4.  Verify Dashboard updates without refresh.
  5.  Verify Extension popup updates.

---

### 📝 Changelog
- **1.3 SSE Endpoint:** Added "Heartbeat" requirement. Proxies (like Cloudflare/Traefik) often silently drop idle connections after 60s. Sending a comment line (`: ping`) every 15s keeps the pipe open.
- **1.4 Sequin Webhook:** Specified `Sequin-Signature` header for the HMAC check to ensure we match Sequin's security standard.
- **3.2 React Hook:** Added "Hybrid Sync" strategy. Pure streaming can miss events that happened *while* connecting. Best practice is to Fetch Snapshot -> Connect Stream -> Apply future updates.
- **4.1 Extension:** Clarified that this will use the "Background Service Worker" (standard for MV3 extensions) rather than a Shared Worker, though the logic is identical.
