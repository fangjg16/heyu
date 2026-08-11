# Build production Worker bundle + runtime image for ECS / Docker Compose
# Build context must be the repo root (see deploy/ecs/docker-compose.yml).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY api-worker/package.json api-worker/package-lock.json ./
RUN npm ci
COPY api-worker/tsconfig.json ./
COPY api-worker/src ./src
COPY api-worker/scripts ./scripts
RUN npm run build:production

FROM node:22-bookworm-slim
WORKDIR /app
# workerd/miniflare outbound HTTPS needs system CA bundle (slim image omits it)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
# Chapter Markdown templates for seed:kn-chapter-templates
ENV KN_DOCS_ROOT=/docs/knowledge-network
COPY api-worker/package.json api-worker/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY api-worker/scripts ./scripts
COPY api-worker/schema.mysql.sql ./
COPY api-worker/migrations ./migrations
COPY docs/knowledge-network /docs/knowledge-network
EXPOSE 8787 8790
# Default: API. Override command for mysql-bridge.
CMD ["node", "scripts/http-server.mjs"]
