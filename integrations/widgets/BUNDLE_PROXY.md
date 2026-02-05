# Widget Bundle Proxying & Caching

Infrastructure analysis for proxying third-party widget bundles through MyScrollr instead of loading them directly from developer servers. This is the primary defense against bait-and-switch attacks (developer changes served code after passing review).

See [widgets/README.md — Bundle integrity](./README.md#bundle-integrity--preventing-bait-and-switch) for the security rationale and [MARKETPLACE.md — Widget Rendering](../MARKETPLACE.md#widget-rendering--sandboxed-iframes) for the broader widget architecture.

---

## What Gets Proxied

A "widget bundle" is a JS file (sometimes with CSS inlined or a small set of assets) served by the developer's `GET /bundle` endpoint. Realistic sizes:

| Widget type | Bundle size (gzipped) | Example |
|-------------|----------------------|---------|
| Simple ticker/counter | 15-50 KB | Crypto price ticker, score display |
| Chart-based widget | 100-300 KB | Includes a charting lib (lightweight-charts, Chart.js) |
| Complex interactive widget | 300-500 KB | Full mini-app with framework + dependencies |

Anything over 500 KB gzipped is unusual for an embedded widget — the manifest validation in `registry/` should enforce a configurable size cap.

---

## Load at Three Scale Tiers

### Tier 1: Launch (10 integrations, 500 DAU)

```
Storage:  10 bundles x 200 KB avg = 2 MB
          (+ 10 previous versions retained = 4 MB total)

Requests: 500 users x 2 widgets avg x 1 dashboard load/day = 1,000 req/day
          ~0.7 req/min peak (assuming 80% of traffic in 8 hours)

Bandwidth: 1,000 x 200 KB = 200 MB/day egress

Cache hit rate: ~95%+ (bundles change infrequently)
Actual origin fetches: ~50/day (cache misses + revalidation)
```

**Verdict**: Trivial. Filesystem on the existing Coolify server handles this without thinking about it.

### Tier 2: Growth (100 integrations, 5,000 DAU)

```
Storage:  100 bundles x 200 KB avg = 20 MB
          (+ version history = ~60 MB)

Requests: 5,000 users x 3 widgets avg x 2 loads/day = 30,000 req/day
          ~4 req/sec peak

Bandwidth: 30,000 x 200 KB = 6 GB/day
          With browser caching (Cache-Control headers): ~1.5 GB/day actual

Cache hit rate: 98%+ (popular widgets cached, long-tail has occasional misses)
Origin fetches: ~200/day
```

**Verdict**: Still comfortable on a single server. Browser `Cache-Control` headers do most of the heavy lifting.

### Tier 3: Scale (1,000 integrations, 50,000 DAU)

```
Storage:  1,000 bundles x 200 KB avg = 200 MB
          (+ version history = ~600 MB)

Requests: 50,000 users x 3 widgets x 2 loads/day = 300,000 req/day
          ~35 req/sec peak

Bandwidth: 300,000 x 200 KB = 60 GB/day raw
          With browser caching: ~15 GB/day actual
          With CDN edge caching: ~2 GB/day origin egress

Origin fetches: ~1,000/day (CDN handles the rest)
```

**Verdict**: Needs a CDN edge layer. The origin server barely notices — the CDN absorbs 95%+ of bundle requests.

---

## Architecture Options

### Option A: Filesystem Cache on Coolify (Tier 1-2)

The simplest path — bundles are files on disk served by the Go API or a static file server.

```
User request
    |
    v
Go API --> /var/cache/bundles/{integration_id}/{version}/bundle.js
    |
    |  Cache miss?
    v
Fetch from developer GET /bundle --> hash check --> store on disk
```

**How it works:**

1. On submission/version update: `registry/` fetches the bundle, hashes it (SHA-256), stores at a known filesystem path
2. Go API serves bundles at `/widgets/{id}/bundle.js` with `Cache-Control: public, max-age=86400, immutable` (versioned URLs mean cache busting is handled by URL change)
3. `health/` re-fetches from the developer origin periodically to verify the hash still matches
4. Browser caches aggressively — repeat visits don't hit the server

**Pros:**
- Zero additional infrastructure
- Uses disk space on the existing Coolify server
- Minimal application code (static file handler + fetch-and-store)

**Cons:**
- Single server = single point of failure for bundle serving
- No geographic distribution (all users hit one origin)
- Disk I/O under high concurrency (unlikely to matter at Tier 1-2)

**Cost**: None beyond existing Coolify server.

### Option B: Object Storage + CDN Edge (Tier 2-3)

When filesystem on a single server isn't enough or you want geographic distribution.

```
User request
    |
    v
CDN edge (BunnyCDN / Cloudflare) --cache hit--> response
    |
    |  cache miss
    v
Origin: Go API --> MinIO/S3 bucket
    |
    |  Not in bucket?
    v
Fetch from developer GET /bundle --> hash check --> store in bucket
```

**How it works:**

1. Bundles stored in MinIO (self-hosted S3, deployable as a Coolify one-click service) or an external S3 bucket
2. CDN sits in front with edge caching — BunnyCDN is ~$0.01/GB, Cloudflare free tier works for this volume
3. Versioned URLs (`/widgets/{id}/v{version}/bundle.js`) make cache invalidation trivial — new version = new URL = CDN fetches from origin once
4. Origin server barely gets hit — CDN edge serves 95%+ of requests

**Pros:**
- Geographic distribution (lower latency for users worldwide)
- Origin server load drops to near-zero for bundle serving
- MinIO is free and self-hosted on Coolify

**Cons:**
- Additional infrastructure to manage (MinIO + CDN config)
- CDN adds a dependency outside Coolify's control

**Cost at Tier 3 scale:**

```
MinIO:          Free (self-hosted on Coolify, 600 MB storage)
BunnyCDN:       15 GB/day x 30 days x $0.01/GB = ~$4.50/month
Cloudflare:     Free tier likely sufficient (no bandwidth billing)
```

### Option C: Redis Bundle Cache (not recommended)

Redis is already in the stack but it's the wrong tool for this:

- Stores everything in RAM — 100 bundles x 200 KB = 20 MB of RAM for static files that rarely change
- No `Cache-Control` header support (Go API still needs to serve the response)
- Doesn't scale to Tier 3 without significant memory cost
- Filesystem is simpler and faster for this use case

---

## Implementation Surface

What the proxy adds to the codebase:

| Concern | Implementation | Complexity |
|---------|---------------|------------|
| Fetch bundle on submission | HTTP GET + SHA-256 hash + write to disk/S3 | Low — already planned for hash pinning |
| Serve bundle to users | Static file handler with `Cache-Control` headers | Low — Fiber has `c.SendFile()` |
| Versioned URLs | `/widgets/{id}/v{version}/bundle.js` — new version = new URL | Low |
| Cache invalidation | Not needed — versioned URLs mean old caches expire naturally | None |
| Size limit enforcement | Check `Content-Length` on fetch, reject if > 500 KB (configurable) | Low |
| Hash re-verification | `health/` already re-fetches periodically — compare to stored hash | Already planned |
| CDN integration (Tier 3) | Put a CDN in front of the bundle endpoint, configure origin pull | Config only — no code change |

The bundle proxy is mostly a side effect of hash pinning — you're already fetching and hashing the bundle at submission time. Storing it and serving it adds a static file handler and some `Cache-Control` headers. The CDN layer (Tier 3) is infrastructure config, not application code.

### Expected files

```
widgets/
├── src/
│   ├── proxy.go            # Bundle fetch, hash, store, serve
│   └── cache.go            # Cache-Control header logic, cache eviction
```

Or within the Go API if widgets doesn't become a standalone service:

```
api/
├── widget_proxy.go         # Bundle proxy endpoint
```

---

## Recommendation

**Start with Option A** (filesystem cache). It handles Tier 1-2 with zero additional infrastructure and the code is minimal — a fetch-hash-store function in `registry/` and a static file handler in the Go API.

When traffic grows to Tier 3, add a CDN in front of the same endpoint. The application code doesn't change — the CDN is a transparent caching layer configured at the infrastructure level in Coolify.

### The real bottleneck isn't infrastructure

The actual cost of proxying isn't compute or bandwidth — it's the **review pipeline latency**. Every version update requires:

1. Fetching the new bundle from the developer
2. Computing the SHA-256 hash
3. Running static analysis (phishing patterns, sandbox escapes, undeclared network calls)
4. For Verified+ tier: queuing for manual review

That pipeline delay is what developers will notice, not the infrastructure load. Optimizing the automated analysis to complete in seconds (not minutes) matters more than CDN configuration at any scale tier.
