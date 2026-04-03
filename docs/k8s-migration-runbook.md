# Kubernetes Migration Runbook

Step-by-step guide for migrating MyScrollr from Coolify to DigitalOcean Kubernetes.

## Prerequisites

| Resource | Status | Details |
|----------|--------|---------|
| DO K8s Cluster | Provisioned | `scrollr-cluster`, 2x 2vCPU/4GB nodes |
| DO Managed PostgreSQL | Provisioned | `scrollr-db`, 2vCPU/4GB |
| DO Managed Valkey | Provisioned | `scrollr-cache`, 2GB |
| DO Container Registry | Provisioned | `registry.digitalocean.com/scrollr` |
| Coolify Droplet | Provisioned | `174.138.80.220` for Logto + Sequin |
| Cloudflare DNS | Active | Managing `myscrollr.com` |
| kubectl | Installed | `doctl kubernetes cluster kubeconfig save scrollr-cluster` |

## Phase 1: Cluster Setup

### 1.1 Install nginx-ingress controller

```bash
# DO has a 1-click nginx ingress. Or install manually:
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/do/deploy.yaml

# Wait for the Load Balancer to get an external IP:
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
# Note the EXTERNAL-IP — you'll need it for DNS.
```

### 1.2 Install cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.2/cert-manager.yaml

# Wait for it to be ready:
kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=120s
```

### 1.3 Apply namespace and config

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/cert-manager.yaml
kubectl apply -f k8s/configmap-core.yaml
kubectl apply -f k8s/configmap-channels.yaml
```

### 1.4 Create secrets

```bash
# Copy the template and fill in real values:
cp k8s/secrets.yaml.template k8s/secrets.yaml

# Encode each value:
echo -n "postgresql://doadmin:PASSWORD@host:25060/defaultdb?sslmode=require" | base64

# Fill in all fields in secrets.yaml, then:
kubectl apply -f k8s/secrets.yaml

# IMPORTANT: Do NOT commit secrets.yaml to git.
```

## Phase 2: Build & Push Images

### 2.1 Authenticate with DO Registry

```bash
doctl registry login
```

### 2.2 Build all images locally (first time)

```bash
# Core API
docker build -f api/Dockerfile -t registry.digitalocean.com/scrollr/core-api:latest api/
docker push registry.digitalocean.com/scrollr/core-api:latest

# Website (build from monorepo root)
docker build -f myscrollr.com/Dockerfile \
  --build-arg VITE_API_URL=https://api.myscrollr.com \
  --build-arg VITE_LOGTO_ENDPOINT=https://auth.myscrollr.com \
  --build-arg VITE_LOGTO_APP_ID=YOUR_APP_ID \
  --build-arg VITE_LOGTO_RESOURCE=https://api.myscrollr.com \
  --build-arg VITE_STRIPE_PUBLISHABLE_KEY=YOUR_PK \
  -t registry.digitalocean.com/scrollr/website:latest .
docker push registry.digitalocean.com/scrollr/website:latest

# Finance API
docker build -f channels/finance/api/Dockerfile \
  -t registry.digitalocean.com/scrollr/finance-api:latest channels/finance/api/
docker push registry.digitalocean.com/scrollr/finance-api:latest

# Finance Service
docker build -f channels/finance/service/Dockerfile \
  -t registry.digitalocean.com/scrollr/finance-service:latest channels/finance/service/
docker push registry.digitalocean.com/scrollr/finance-service:latest

# Sports API
docker build -f channels/sports/api/Dockerfile \
  -t registry.digitalocean.com/scrollr/sports-api:latest channels/sports/api/
docker push registry.digitalocean.com/scrollr/sports-api:latest

# Sports Service
docker build -f channels/sports/service/Dockerfile \
  -t registry.digitalocean.com/scrollr/sports-service:latest channels/sports/service/
docker push registry.digitalocean.com/scrollr/sports-service:latest

# RSS API
docker build -f channels/rss/api/Dockerfile \
  -t registry.digitalocean.com/scrollr/rss-api:latest channels/rss/api/
docker push registry.digitalocean.com/scrollr/rss-api:latest

# RSS Service
docker build -f channels/rss/service/Dockerfile \
  -t registry.digitalocean.com/scrollr/rss-service:latest channels/rss/service/
docker push registry.digitalocean.com/scrollr/rss-service:latest

# Fantasy API
docker build -f channels/fantasy/api/Dockerfile \
  -t registry.digitalocean.com/scrollr/fantasy-api:latest channels/fantasy/api/
docker push registry.digitalocean.com/scrollr/fantasy-api:latest
```

### 2.3 Grant cluster access to registry

```bash
doctl kubernetes cluster registry add scrollr-cluster
```

## Phase 3: Deploy Services

### 3.1 Apply all deployments + services

```bash
# Apply in dependency order: infrastructure services first, then API gateway
kubectl apply -f k8s/finance-service.yaml
kubectl apply -f k8s/sports-service.yaml
kubectl apply -f k8s/rss-service.yaml
kubectl apply -f k8s/finance-api.yaml
kubectl apply -f k8s/sports-api.yaml
kubectl apply -f k8s/rss-api.yaml
kubectl apply -f k8s/fantasy-api.yaml
kubectl apply -f k8s/core-api.yaml
kubectl apply -f k8s/website.yaml
```

### 3.2 Verify pods are running

```bash
kubectl get pods -n scrollr
# All should show 1/1 Running

kubectl get svc -n scrollr
# All ClusterIP services should be listed
```

### 3.3 Check logs for startup issues

```bash
# Check each service:
kubectl logs -n scrollr deployment/core-api --tail=50
kubectl logs -n scrollr deployment/finance-api --tail=50
kubectl logs -n scrollr deployment/finance-service --tail=50
# ... repeat for all services

# Watch for:
# - Database connection failures
# - Redis connection failures
# - Migration errors
# - "listening on :PORT" messages (success)
```

### 3.4 Apply ingress

```bash
kubectl apply -f k8s/ingress.yaml

# Verify:
kubectl get ingress -n scrollr
# Should show hosts: myscrollr.com, api.myscrollr.com
```

## Phase 4: Coolify Setup (Logto + Sequin)

### 4.1 Install Coolify

```bash
ssh root@174.138.80.220
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Access Coolify at `https://coolify.myscrollr.com` (after DNS setup).

### 4.2 Deploy Logto

1. In Coolify, create a new Docker Compose service for Logto
2. Point Logto's DATABASE_URL to the DO managed PostgreSQL
3. Set Logto's endpoint to `https://auth.myscrollr.com`
4. **Migrate data**: Dump Logto tables from old database, restore to new

```bash
# On old server:
pg_dump -h old-host -U user -d logto_db --no-owner --no-acl > logto_dump.sql

# On new (or from local with access):
psql "postgresql://doadmin:PASS@private-scrollr-db-...:25060/defaultdb?sslmode=require" < logto_dump.sql
```

5. Update Logto application settings:
   - Website app: callback URL → `https://myscrollr.com/callback`
   - Desktop app: callback URL stays `http://127.0.0.1:19284/callback` (local)
   - M2M app: no URL changes needed

### 4.3 Deploy Sequin

1. In Coolify, create a Docker Compose service for Sequin
2. Point to DO managed PostgreSQL
3. Configure webhook delivery to `https://api.myscrollr.com/webhooks/sequin`
4. Set the same `SEQUIN_WEBHOOK_SECRET` as in K8s secrets

## Phase 5: DNS Cutover (Cloudflare)

### 5.1 Get the Load Balancer IP

```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

### 5.2 Create/update Cloudflare DNS records

| Type | Name | Value | Proxy | TTL |
|------|------|-------|-------|-----|
| A | `myscrollr.com` | LB IP from above | Proxied (orange) | Auto |
| A | `api` | Same LB IP | Proxied (orange) | Auto |
| A | `auth` | `174.138.80.220` | Proxied (orange) | Auto |
| A | `coolify` | `174.138.80.220` | DNS only (gray) | Auto |

### 5.3 Cloudflare SSL settings

- SSL/TLS mode: **Full (strict)**
- Always Use HTTPS: **On**
- Minimum TLS Version: **1.2**

### 5.4 Verify

```bash
# Website
curl -I https://myscrollr.com

# API health
curl https://api.myscrollr.com/health

# Auth
curl https://auth.myscrollr.com/.well-known/openid-configuration
```

## Phase 6: Post-Cutover

### 6.1 Update desktop app config

Edit `desktop/src/config.ts`:
```ts
export const API_BASE = "https://api.myscrollr.com";
export const AUTH_ENDPOINT = "https://auth.myscrollr.com";
```

Version bump + release. Users will auto-update.

### 6.2 Configure CI/CD secrets

In GitHub repo Settings > Secrets and variables > Actions, add:

| Secret | Value |
|--------|-------|
| `DIGITALOCEAN_ACCESS_TOKEN` | DO personal access token |
| `VITE_LOGTO_APP_ID` | Logto SPA app ID |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |

### 6.3 Monitor for 48 hours

```bash
# Watch pod health:
kubectl get pods -n scrollr -w

# Check for restarts:
kubectl get pods -n scrollr -o wide

# Core API health (includes all downstream checks):
watch -n 30 'curl -s https://api.myscrollr.com/health | jq .'
```

### 6.4 Decommission old Coolify (after stable period)

1. Wait 1-2 weeks with both running
2. Verify zero traffic to old Coolify services
3. Turn off old services one by one
4. Keep the Coolify server running (it hosts Logto + Sequin)

## Rollback Plan

If anything goes wrong during cutover:

1. **DNS rollback**: In Cloudflare, point `myscrollr.com` and `api` back to old Coolify IP. Propagation: 1-5 minutes with Cloudflare proxy.
2. **Old Coolify is still running** during the parallel period — it will immediately serve traffic again.
3. No data loss: both old and new point to the same managed PostgreSQL and Valkey.

## Troubleshooting

### Pod won't start — ImagePullBackOff
```bash
# Check registry access:
doctl kubernetes cluster registry add scrollr-cluster
# Re-push the image if needed
```

### Pod crashes — CrashLoopBackOff
```bash
kubectl logs -n scrollr deployment/SERVICE_NAME --previous
# Usually: wrong DATABASE_URL, missing env var, or migration failure
```

### SSE not working
```bash
# Verify ingress annotations:
kubectl describe ingress scrollr-ingress -n scrollr
# Check for proxy-buffering: off and long timeouts
```

### Sequin webhooks not reaching Core API
```bash
# Test from Coolify droplet:
ssh root@174.138.80.220
curl -X POST https://api.myscrollr.com/webhooks/sequin \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"test","record":{},"metadata":{"table_name":"test"}}'
```
