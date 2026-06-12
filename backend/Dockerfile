# syntax=docker/dockerfile:1.6

# ---- Stage 1: deps (full install, layer-cached) ----
FROM node:20-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared/ shared/
RUN pnpm install --frozen-lockfile --filter backend... --include-workspace-root

# ---- Stage 2: build (TS -> JS + prisma generate) ----
FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/backend/node_modules /repo/backend/node_modules
COPY . .
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

# ---- Stage 3: runtime ----
# Use bookworm-slim instead of Alpine to get libssl for Prisma engine.
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# Move to a non-root user early, but Docker's COPY --chown handles this.
# First, create the app directory with correct ownership.
RUN mkdir -p /app && chown node:node /app

# Copy the entire workspace (pnpm symlinks included).
# Relative symlinks cross directories correctly on Linux in COPY.
COPY --from=builder --chown=node:node /repo /app

# Switch to non-root user
USER node
WORKDIR /app/backend

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/backend/src/main.js"]
