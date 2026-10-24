# syntax=docker/dockerfile:1

# Image unique : l'API NestJS sert aussi le frontend Angular compilé.
# Construction multi-architecture (amd64, arm64 pour Oracle Cloud Ampere) :
#   docker buildx build --platform linux/amd64,linux/arm64 -t genealogie .

ARG NODE_VERSION=24.22.1

# Outils de compilation des modules natifs (better-sqlite3).
FROM node:${NODE_VERSION}-bookworm-slim AS toolchain
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY e2e/package.json e2e/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/

# Compilation du backend et du frontend.
FROM toolchain AS build
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run prisma:generate -w @genealogie/backend \
  && npm run build -w @genealogie/backend \
  && npm run build -w @genealogie/frontend

# Dépendances de production du backend uniquement.
FROM toolchain AS prod-deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund -w @genealogie/backend

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/genealogie.db \
    STATIC_DIR=/app/public \
    LOG_FORMAT=json
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY shared shared
COPY backend/package.json backend/prisma.config.ts backend/
COPY backend/prisma backend/prisma
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/frontend/dist/browser public
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
