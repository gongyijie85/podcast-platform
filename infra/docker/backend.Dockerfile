# ----- Build stage -----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile=false

# Copy source
COPY backend ./backend
COPY shared ./shared
RUN cd backend && pnpm run build

# ----- Runtime stage -----
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate \
  && apk add --no-cache ffmpeg tini
WORKDIR /app

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3001

# Prisma client
RUN npx prisma generate || true

# Storage / temp dirs
RUN mkdir -p /app/storage /app/tmp
VOLUME ["/app/storage"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/backend/src/main.js"]
