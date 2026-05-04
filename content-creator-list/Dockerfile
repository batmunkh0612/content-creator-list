# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js (App Router) frontend served via
# `next start` (standalone output). Used by docker-compose's `web` service.

# ===== deps =================================================================
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ===== build ================================================================
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ===== runtime ==============================================================
# `next.config.ts` sets `output: "standalone"` so .next/standalone contains
# server.js + the minimal node_modules subset required to serve the app.
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user. Node base image already provides `node` (uid 1000).
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
