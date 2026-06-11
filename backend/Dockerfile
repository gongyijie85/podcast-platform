# syntax=docker/dockerfile:1.6

# ---- Stage 1: deps (full workspace install, used for compile-time) ----
# Installs ALL deps (dev + prod) for the workspace so the builder can
# compile TypeScript + generate Prisma client. Produces a pnpm virtual
# store under `/repo/node_modules` with symlinks — this is FINE inside
# the build stages because we never run the compiled app from here.
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared/ shared/
# Symlink-friendly install. Layer cache hits on manifest-only changes.
RUN pnpm install --frozen-lockfile --filter backend... --include-workspace-root

# ---- Stage 2: build (TS -> JS, Prisma generate) ----
# Generate Prisma Client INSIDE this stage so the generated `.prisma/client`
# directory exists on disk in the builder image. We then carry the
# generated files into the prod-deps stage below.
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++ \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/backend/node_modules /repo/backend/node_modules
COPY . .
# Generate Prisma client (writes to backend/node_modules/.prisma/client).
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

# ---- Stage 3: prod-deps (self-contained, hoisted, no symlinks) ----
# `pnpm deploy` produces a fully self-contained layout at
# `/deploy/backend/` with all transitive deps inlined under `node_modules/`
# (no `.pnpm/` virtual store, no symlinks). This is what a single-process
# container (Render) needs to run `node /app/dist/backend/src/main.js`.
# CRITICAL: we overlay the previously generated Prisma client onto the
# deployed node_modules so @prisma/client can find its engine at runtime.
FROM node:20-alpine AS prod-deps
RUN corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY shared/ shared/
RUN pnpm install --frozen-lockfile --filter backend... --include-workspace-root \
    && pnpm --filter backend --prod deploy /deploy/backend
# Overlay the generated Prisma client (from builder) onto the deployed
# node_modules so @prisma/client runtime finds the engine. `pnpm deploy`
# only ships production dependencies, so it does not include the
# pre-generated Prisma client that `prisma generate` produced earlier.
#
# The prisma generate log explicitly says it wrote to
#   `./../node_modules/.pnpm/@prisma+client@x.y.z_prisma@x.y.z/node_modules/@prisma/client`
# and the generated engine artifacts land in the `.prisma/client/`
# subdirectory of the .pnpm store, not at the workspace root.
# We copy the entire `node_modules/` from the .pnpm package directory
# of @prisma+client (which includes the generated .prisma/ folder)
# and overlay it on the deployed layout.
COPY --from=builder "/repo/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma" /deploy/backend/node_modules/.prisma

# ---- Stage 4: runtime ----
FROM node:20-alpine AS runtime
RUN apk add --no-cache ffmpeg dumb-init \
    && corepack enable \
    && corepack prepare pnpm@9.9.0 --activate
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# 1) compiled JS (from builder)
COPY --from=builder --chown=node:node /repo/backend/dist /app/dist
# 2) backend package.json (for runtime metadata)
COPY --from=builder --chown=node:node /repo/backend/package.json /app/
# 3) Prisma schema (so @prisma/client can locate the engine at runtime)
COPY --from=builder --chown=node:node /repo/backend/prisma /app/prisma
# 4) **self-contained production node_modules** (no symlinks) — this is
#    what makes `require('reflect-metadata')` resolve in the container.
COPY --from=prod-deps --chown=node:node /deploy/backend/node_modules /app/node_modules
# 5) workspace shared/ (so @shared/* can resolve at runtime)
COPY --from=builder --chown=node:node /repo/shared /app/shared

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/backend/src/main.js"]
