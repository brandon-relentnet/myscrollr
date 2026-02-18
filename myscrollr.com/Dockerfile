# Build context: monorepo root (one level above myscrollr.com/)
# This allows access to both myscrollr.com/ and integrations/

# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy frontend package files first for better layer caching
COPY myscrollr.com/package.json myscrollr.com/package-lock.json* ./myscrollr.com/

# Install dependencies
WORKDIR /app/myscrollr.com
RUN npm ci

# Copy integration web components (only what the frontend build needs)
WORKDIR /app
COPY integrations/finance/web/ ./integrations/finance/web/
COPY integrations/sports/web/ ./integrations/sports/web/
COPY integrations/rss/web/ ./integrations/rss/web/
COPY integrations/fantasy/web/ ./integrations/fantasy/web/

# Create node_modules symlink for TypeScript resolution of integration files
RUN ln -s ../myscrollr.com/node_modules ./integrations/node_modules

# Copy the rest of the frontend source
COPY myscrollr.com/ ./myscrollr.com/

# Accept build-time env vars
ARG VITE_API_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID
ARG VITE_LOGTO_RESOURCE
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_LOGTO_ENDPOINT=${VITE_LOGTO_ENDPOINT}
ENV VITE_LOGTO_APP_ID=${VITE_LOGTO_APP_ID}
ENV VITE_LOGTO_RESOURCE=${VITE_LOGTO_RESOURCE}
ENV VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}

# Build (vite build + tsc)
WORKDIR /app/myscrollr.com
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets to nginx
COPY --from=builder /app/myscrollr.com/dist /usr/share/nginx/html

# SPA fallback: route all paths to index.html for client-side routing
# Includes security headers, gzip compression, and proper caching
RUN printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # ── Security headers (server-level) ─────────────────────────\n\
    # NOTE: nginx add_header in a child location block overrides\n\
    # ALL parent add_header directives. To work around this, we\n\
    # use an include file for shared security headers.\n\
\n\
    # ── Gzip compression ────────────────────────────────────────\n\
    gzip on;\n\
    gzip_vary on;\n\
    gzip_proxied any;\n\
    gzip_comp_level 6;\n\
    gzip_min_length 256;\n\
    gzip_types\n\
        text/plain\n\
        text/css\n\
        text/javascript\n\
        application/javascript\n\
        application/json\n\
        application/xml\n\
        image/svg+xml\n\
        font/woff2;\n\
\n\
    # ── HTML: no-cache so users always get latest deploy ────────\n\
    location / {\n\
        include /etc/nginx/security-headers.conf;\n\
        add_header Cache-Control "no-cache";\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # ── Hashed static assets: cache forever ─────────────────────\n\
    location /assets/ {\n\
        include /etc/nginx/security-headers.conf;\n\
        expires 1y;\n\
        add_header Cache-Control "public, max-age=31536000, immutable";\n\
    }\n\
\n\
    # ── Fonts: long cache ───────────────────────────────────────\n\
    location ~* \\.woff2?$ {\n\
        include /etc/nginx/security-headers.conf;\n\
        expires 1y;\n\
        add_header Cache-Control "public, max-age=31536000, immutable";\n\
        add_header Access-Control-Allow-Origin "*";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf && \
printf 'add_header X-Frame-Options "SAMEORIGIN" always;\n\
add_header X-Content-Type-Options "nosniff" always;\n\
add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n\
add_header Content-Security-Policy "default-src '"'"'self'"'"'; script-src '"'"'self'"'"' '"'"'unsafe-inline'"'"' https://js.stripe.com; style-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; img-src '"'"'self'"'"' data: https:; font-src '"'"'self'"'"'; connect-src '"'"'self'"'"' https://api.myscrollr.relentnet.dev https://auth.myscrollr.relentnet.dev https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; base-uri '"'"'self'"'"'; form-action '"'"'self'"'"';" always;\n\
' > /etc/nginx/security-headers.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
