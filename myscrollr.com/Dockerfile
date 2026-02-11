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
ENV VITE_API_URL=${VITE_API_URL}

# Build (vite build + tsc)
WORKDIR /app/myscrollr.com
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets to nginx
COPY --from=builder /app/myscrollr.com/dist /usr/share/nginx/html

# SPA fallback: route all paths to index.html for client-side routing
RUN printf 'server {\n\
    listen 3000;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets aggressively\n\
    location /assets/ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
