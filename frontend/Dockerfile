# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first (layer cache: rebuilds only when these change)
COPY package.json package-lock.json* ./

RUN npm ci --prefer-offline

# Copy source + config files
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json* ./
COPY src/ src/
COPY public/ public/ 2>/dev/null || true

RUN npm run build

# ── Stage 2: serve via nginx ──────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Custom nginx config (API proxy + SPA routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled frontend assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
