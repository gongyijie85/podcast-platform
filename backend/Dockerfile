# syntax=docker/dockerfile:1.6

# ---- Stage 1: deps (full install, layer-cached) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared/ shared/
RUN pnpm install --frozen-lockfile --filter backend... --include-workspace-root

# ---- Stage 2: build (TS -> JS + prisma generate) ----
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/backend/node_modules /repo/backend/node_modules
COPY . .
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

# ---- Stage 3: runtime ----
# We copy the ENTIRE /repo tree from builder (including pnpm symlinks).
# On Linux, pnpm symlinks are RELATIVE, so they survive a COPY into a
# different root directory. The app runs from /app/backend/ and all
# node_modules resolutions are intact.
FROM node:20-alpine AS runtime
RUN apk add --no-cache ffmpeg dumb-init
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

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/backend/src/main.js"]
