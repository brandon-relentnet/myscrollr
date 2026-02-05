# Automated Review Pipeline

Design for the automated integration review system that validates submissions before they reach the marketplace. The goal is to auto-publish safe Unverified submissions in under 2 minutes with no human involvement, and reduce human review time for Verified+ submissions to under 5 minutes.

See [registry/README.md — Security: Submission-Time Checks](./README.md#security-submission-time-checks) for the checks this pipeline implements, and [health/README.md — Runtime Integrity Monitoring](../health/README.md#security-runtime-integrity-monitoring) for post-publish continuous monitoring.

---

## Pipeline Overview

```
Developer submits/updates integration
    |
    v
+-----------------------------------------+
|  Stage 1: Manifest validation            |  < 1 second, synchronous
|  (instant pass/fail)                     |
+-------------------+---------------------+
                    | pass
                    v
+-----------------------------------------+
|  Stage 2: Endpoint probing               |  5-15 seconds, async
|  (health, bundle fetch, TLS check)       |
+-------------------+---------------------+
                    | pass
                    v
+-----------------------------------------+
|  Stage 3: Static analysis                |  10-30 seconds, async
|  (AST scan, pattern matching)            |
+-------------------+---------------------+
                    | pass
                    v
+-----------------------------------------+
|  Stage 4: Dynamic analysis               |  1-3 minutes, async
|  (headless browser sandbox)              |
+-------------------+---------------------+
                    | pass
                    v
+-----------------------------------------+
|  Stage 5: Reputation scoring             |  < 1 second
|  (developer history, signals)            |
+-------------------+---------------------+
                    |
                    v
              +-----------+
              | Score > T? |---- yes ----> Auto-publish (Unverified tier)
              +-----+-----+
                    | no, or Verified+ tier requested
                    v
+-----------------------------------------+
|  Stage 6: Human review                   |
|  (pre-built report, not raw code)        |
+-----------------------------------------+
```

Stages 2-4 run asynchronously. The developer gets a submission ID and sees progress in the portal UI. Most Unverified submissions complete the full pipeline in under 2 minutes with no human involvement.

Any stage failure stops the pipeline and returns specific, actionable errors to the developer in the portal.

---

## Stage 1: Manifest Validation (< 1 second)

Fully synchronous, runs before anything is persisted. Catches the majority of bad submissions immediately.

**Checks:**

- JSON Schema validation against `schemas/manifest.schema.json`
- HTTPS required on all URLs (`base_url`, icon, screenshots)
- `scopes` is a subset of valid Logto scopes
- `scopes` permitted for the requested verification tier
- `scope_justifications` present for every requested scope
- `allowed_domains` present and non-empty
- `base_url` not on a known-bad domain blocklist
- Bundle size declared in manifest under the cap (500 KB)
- Required fields present for the integration type (e.g., widget must declare `GET /manifest` and `GET /bundle`)

**Fail behavior**: Synchronous 400 response with specific validation errors. Developer fixes and resubmits. No async work is triggered.

---

## Stage 2: Endpoint Probing (5-15 seconds)

Verify the developer's service is real, reachable, and properly configured.

| Check | Pass criteria |
|-------|--------------|
| `GET /health` | 200 response within 5 seconds |
| `GET /bundle` (widgets) | 200, valid JS, correct `Content-Type`, size under cap |
| `GET /data` (data sources) | 200, valid JSON conforming to declared schema |
| `GET /manifest` (widgets) | 200, content matches submitted manifest |
| TLS certificate | Valid, not self-signed, not expiring within 30 days |
| DNS age | Domain registered > 7 days (catches throwaway domains) |

**Fail behavior**: Specific errors reported in portal UI ("Health endpoint returned 503", "TLS certificate expires in 12 days"). Developer fixes and retries.

---

## Stage 3: Static Analysis (10-30 seconds)

Core automated security scan. Different analysis runs depending on integration type.

### Widget Bundles — AST Analysis

Parse the JS bundle into an AST using a fast parser (esbuild's Go API, since esbuild is written in Go and can run in-process with the registry service) and scan for known-bad patterns.

#### Blocklist patterns (auto-reject)

| Pattern | Detection method | Threat |
|---------|-----------------|--------|
| `<input type="password">` | String literal scan + HTML template detection | Phishing |
| `<form action="...">` | HTML template detection | Phishing (even though `allow-forms` is blocked in sandbox, flags intent) |
| `document.cookie` | AST identifier access | Cookie theft |
| `navigator.credentials` | AST identifier access | Credential API abuse |
| `window.top.location` | AST member expression | Parent frame redirect |
| `window.parent.location` | AST member expression | Parent frame redirect |
| `document.domain =` | AST assignment expression | Sandbox escape attempt |
| `eval()` | AST call expression | Dynamic code execution |
| `new Function()` | AST new expression | Dynamic code execution |
| `document.createElement('script')` | AST call + string literal | Dynamic script injection |

#### Network audit (reject with specific error)

- Extract all URLs from `fetch()`, `XMLHttpRequest`, `new WebSocket()`, and `import()` calls
- Compare against the manifest's `allowed_domains`
- Undeclared domains trigger rejection: "Bundle makes requests to api.evil.com which is not in your allowed_domains"

#### Dependency fingerprinting

- Hash known library signatures (React, Chart.js, lodash, etc.) and subtract them from the analysis — don't flag `eval` inside a minified charting library
- Flag bundles that include known-vulnerable library versions (cross-reference with npm advisory database or Snyk)

### Data Source Integrations — Schema Validation

- Fetch `GET /data` and `GET /schema`, validate responses conform to `schemas/data-source/`
- Check response times (flag if consistently > 2 seconds)
- Verify response payload doesn't contain HTML or JS (data sources should return JSON, not executable content)

### Implementation

```
registry/
├── src/
│   ├── analysis/
│   │   ├── scanner.go          # Orchestrates all static checks
│   │   ├── ast.go              # JS AST parsing (via esbuild Go API)
│   │   ├── patterns.go         # Blocklist pattern definitions
│   │   ├── network.go          # URL extraction and allowlist comparison
│   │   └── dependencies.go     # Library fingerprinting and vuln check
│   └── ...
```

Using esbuild's Go API for AST parsing keeps the scanner in-process with the registry — no sidecar or subprocess needed. esbuild parses a 500 KB bundle in ~5ms.

---

## Stage 4: Dynamic Analysis (1-3 minutes)

Static analysis misses obfuscated code, dynamically generated DOM, and runtime-only behavior. A headless browser sandbox catches what AST scanning can't.

### Execution Model

1. Spin up a headless Chromium instance (via [rod](https://github.com/nicedong/rod) in Go, or Playwright in a sidecar container)
2. Load the widget bundle inside a page that mimics the MyScrollr dashboard iframe environment (same sandbox attributes, same CSP)
3. Send the standard `postMessage` handshake (theme config, widget config, a dummy auth token with no real scopes)
4. Let the widget run for 30 seconds
5. Observe and record behavior

### Detection Signals

| Signal | Detection method | Threat |
|--------|-----------------|--------|
| Password inputs rendered | DOM query: `input[type=password]` | Phishing |
| Forms rendered | DOM query: `form` | Phishing |
| Login-like UI | Keyword scan in rendered text ("sign in", "enter password", "session expired", "verify your account") | Phishing |
| Network requests to undeclared domains | Browser network interception via Chrome DevTools Protocol | Data exfiltration |
| `postMessage` to unexpected origins | Message event interception | Protocol abuse |
| Excessive DOM size | DOM node count > threshold (e.g., > 5,000 nodes) | Resource abuse |
| High CPU/memory usage | Container resource metrics | Cryptomining / resource abuse |
| Console errors / exceptions | Console API interception | Quality signal (not a security reject, but factors into reputation score) |

### Screenshot Comparison

**For version updates** (not first submission):

- Automatically screenshot the running widget after 10 seconds
- Compare to the previous version's screenshot using pixel diff with tolerance
- **Pixel diff > 80%** with no manifest version bump → flag for human review (possible bait-and-switch)
- Store all screenshots for audit trail

**For all submissions**:

- Compare rendered widget against a library of known phishing UI templates (login forms, "session expired" dialogs, payment forms)
- These templates have distinctive structural patterns (centered form, password field, submit button) detectable via basic image similarity rather than ML

### Resource Constraints

The headless browser sandbox must be resource-limited to prevent malicious widgets from consuming host resources:

```
Container limits:
  CPU:      0.5 cores
  Memory:   256 MB
  Time:     60 seconds max execution
  Network:  outbound allowed (monitored) but rate-limited to 10 req/sec
  Disk:     no write access
```

### Deployment

Deployable as a standalone Coolify service that the registry calls via internal HTTP when a submission reaches Stage 4.

```
POST /analyze
{
  "bundle_url": "https://crypto-ticker.example.com/bundle",
  "manifest": { ... },
  "previous_screenshot": "base64...",  // null for first submission
  "allowed_domains": ["api.coingecko.com"]
}

Response:
{
  "passed": true,
  "flags": [
    {
      "severity": "warning",
      "type": "undeclared_network",
      "detail": "fetch() to cdn.jsdelivr.net not in allowed_domains"
    }
  ],
  "screenshot": "base64...",
  "screenshot_diff_pct": 12.3,
  "network_requests": [...],
  "dom_node_count": 847,
  "console_errors": [],
  "execution_time_ms": 14200
}
```

---

## Stage 5: Reputation Scoring (< 1 second)

Aggregate signals into a trust score that determines whether the submission auto-publishes or queues for human review.

### Signals

| Signal | Weight | Source |
|--------|--------|--------|
| Developer account age | Medium | Logto (`created_at`) |
| Previous integrations published (clean) | Medium | `integrations` table |
| Previous suspensions | High (negative) | `integrations` table |
| User reports on other integrations | High (negative) | Report history |
| Linked GitHub account age + activity | Medium | GitHub API (if linked in portal) |
| Domain registration age | Low | WHOIS / RDAP lookup (cached from Stage 2) |
| All automated stages passed cleanly | High | Stage 1-4 results |
| Static analysis flagged warnings (non-blocking) | Medium (negative) | Stage 3 results |
| Dynamic analysis flagged warnings | Medium (negative) | Stage 4 results |

### Scoring Model

A weighted sum — simple and auditable, no ML:

```
score = base_score                           (50)
      + account_age_bonus                    (0 to 10)
      + clean_history_bonus                  (0 to 15)
      + github_linked_bonus                  (0 to 10)
      + domain_age_bonus                     (0 to 5)
      + clean_analysis_bonus                 (0 to 15)
      - static_analysis_warning_penalty      (0 to 20)
      - dynamic_analysis_warning_penalty     (0 to 15)
      - previous_suspension_penalty          (0 to 30)
      - user_report_penalty                  (0 to 30)
```

### Thresholds

| Score range | Outcome |
|-------------|---------|
| >= 60 | Auto-publish (Unverified tier only) |
| 40-59 | Queue for human review |
| < 40 | Auto-reject with explanation |

**Examples:**

- Brand-new developer, no GitHub, 2-day-old domain, clean scan: **~50** → human review
- Returning developer, clean history, linked GitHub, clean scan: **~85** → auto-publish
- Developer with 1 previous suspension, clean scan: **~35** → auto-reject
- New developer, linked GitHub with 2yr history, clean scan: **~70** → auto-publish

Verified and Featured tier requests always go to human review regardless of score — the score just prioritizes the review queue (higher scores reviewed first, since they're more likely to pass quickly).

---

## Stage 6: Human Review

The goal of Stages 1-5 is to make this step fast. The reviewer never reads raw source code. They see a pre-built report in the portal's admin UI.

### Report Format

```
+--------------------------------------------------------------+
|  Review: crypto-ticker v1.2.0 by @jane_dev                   |
|  Tier requested: Verified                                     |
|  Trust score: 72/100                                          |
|                                                               |
|  Stage 1: Manifest           ✅ passed                       |
|  Stage 2: Endpoints          ✅ passed (health: 120ms)       |
|  Stage 3: Static analysis    ✅ passed, 0 warnings           |
|  Stage 4: Dynamic analysis   ⚠️  1 flag                      |
|     └─ fetch() to cdn.jsdelivr.net (not in allowed_domains)   |
|  Stage 5: Reputation         ✅ clean history, GitHub linked  |
|                                                               |
|  Screenshot:  [current]  [previous]  [diff: 12%]             |
|                                                               |
|  Scopes requested:                                            |
|    dashboard:write — "Adds a price ticker widget"             |
|    profile:read — "Personalizes ticker with your currency"    |
|                                                               |
|  Network requests observed:                                   |
|    ✅ api.coingecko.com (in allowed_domains)                  |
|    ⚠️  cdn.jsdelivr.net (NOT in allowed_domains)              |
|                                                               |
|  Developer: @jane_dev                                         |
|    Account age: 8 months                                      |
|    Other integrations: 2 (both clean)                         |
|    GitHub: github.com/jane_dev (3 years, 47 repos)            |
|                                                               |
|  [Approve]  [Reject: reason]  [Request changes]              |
+--------------------------------------------------------------+
```

### Reviewer workflow

1. **Look at flags** (the warning items) — in this example, is the `cdn.jsdelivr.net` call legitimate? (Yes, it's a public CDN. Developer should add it to `allowed_domains`.)
2. **Glance at screenshots** — does the widget look like what the listing claims?
3. **Check scope justifications** — do they make sense for this integration type?
4. **Decision**: approve, reject with reason, or request changes

**Time per review:**

| Submission state | Reviewer time |
|-----------------|---------------|
| Clean (0 flags) | ~30 seconds |
| Minor flags (1-2 warnings) | 2-3 minutes |
| Significant flags | 5-10 minutes |
| Suspicious (low trust score) | 10-15 minutes (may involve manual bundle inspection) |

---

## Expected Review Volumes

| Scale tier | Submissions/week | Auto-published | Human review queue | Human time/week |
|------------|-------------------|----------------|-------------------|-----------------|
| Launch (10 integrations) | 2-5 | 1-3 | 1-2 | ~5 minutes |
| Growth (100 integrations) | 10-20 | 6-14 | 4-6 | ~15 minutes |
| Scale (1,000 integrations) | 30-60 | 20-40 | 10-20 | ~45 minutes |

At every scale tier, human review time stays under 1 hour/week — manageable by a single person without dedicated staffing.

---

## Database Schema for Review Pipeline

```sql
-- Review pipeline runs
CREATE TABLE integration_reviews_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id),
    version VARCHAR(20) NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'passed', 'failed', 'review', 'approved', 'rejected')),

    -- Stage results (JSONB for flexibility)
    stage_1_manifest JSONB,         -- {passed: bool, errors: [...]}
    stage_2_endpoints JSONB,        -- {passed: bool, health_ms: int, tls: {...}, ...}
    stage_3_static JSONB,           -- {passed: bool, warnings: [...], blocked: [...]}
    stage_4_dynamic JSONB,          -- {passed: bool, flags: [...], screenshot: url, ...}
    stage_5_reputation JSONB,       -- {score: int, signals: {...}}

    -- Human review (null if auto-published)
    reviewer_id UUID REFERENCES users(id),
    reviewer_decision VARCHAR(20),
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ,

    -- Bundle snapshot
    bundle_hash VARCHAR(64),        -- SHA-256 at time of review
    bundle_size_bytes INTEGER
);
```

---

## Deployment Architecture

```
                          +------------------+
Developer submission ---> |  Go API /        |
                          |  Registry        |
                          |  (Stages 1,2,3,5)|
                          +--------+---------+
                                   |
                          Stage 4  |  internal HTTP
                                   v
                          +------------------+
                          |  Sandbox Service  |  (Coolify service)
                          |  Headless Chrome  |
                          |  rod / Playwright |
                          +------------------+
```

- **Stages 1, 2, 3, 5** run inside the Go API / registry service — no additional infrastructure
- **Stage 4** (dynamic analysis) is the only part requiring a separate service, due to the headless browser dependency. Deployed as a Coolify container with resource limits.
- **Stage 6** is a UI in the developer portal (`portal/`), reading from `integration_reviews_pipeline`

### Resource Requirements

| Component | CPU | Memory | Notes |
|-----------|-----|--------|-------|
| Registry (Stages 1,2,3,5) | Negligible | Negligible | Runs within existing Go API |
| Sandbox service (Stage 4) | 1 core | 512 MB | Headless Chrome + monitoring. Scales to 0 when idle. |

Stage 4 is the only component with meaningful resource cost, and it only runs during submissions — not continuously. At Tier 1-2 scale (< 20 submissions/week), a single sandbox container handles the load easily.
