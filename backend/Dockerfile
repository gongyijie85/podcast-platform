# syntax=docker/dockerfile:1.6

# ---- Stage 1: deps (cached layer for node_modules) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
# Copy only the manifest files first to leverage Docker layer cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared/ shared/
RUN pnpm install --frozen-lockfile --filter backend... --include-workspace-root

# ---- Stage 2: build ----
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
FROM node:20-alpine AS runtime
RUN apk add --no-cache ffmpeg dumb-init \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# Copy the compiled backend
COPY --from=builder --chown=node:node /repo/backend/dist /app/dist
COPY --from=builder --chown=node:node /repo/backend/package.json /app/
COPY --from=builder --chown=node:node /repo/backend/prisma /app/prisma
COPY --from=builder --chown=node:node /repo/node_modules /app/node_modules
COPY --from=builder --chown=node:node /repo/shared /app/shared

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/backend/src/main.js"]
