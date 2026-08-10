# Build production Worker bundle + runtime image for ECS / Docker Compose
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build:production

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
COPY schema.mysql.sql ./
COPY migrations ./migrations
EXPOSE 8787 8790
# Default: API. Override command for mysql-bridge.
CMD ["node", "scripts/http-server.mjs"]
