# ----- Build stage -----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# 使用 frozen-lockfile 确保依赖版本与 lockfile 一致，防止依赖漂移
RUN pnpm install --frozen-lockfile

# Copy source
COPY backend ./backend
COPY shared ./shared
RUN cd backend && pnpm run build

# ----- Runtime stage -----
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate \
  && apk add --no-cache ffmpeg tini
WORKDIR /app

# 复制 workspace 文件，单独安装生产依赖（不含 devDependencies，减小镜像体积）
COPY pnpm-workspace.yaml package.json ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
RUN pnpm install --prod --frozen-lockfile

# 复制构建产物和 prisma schema
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/prisma ./prisma

# 复制 step3 TTS fallback 用的 fixtures（生产环境 process.cwd()=/app 时定位用）
COPY --from=builder /app/backend/src/test/fixtures ./src/test/fixtures

ENV NODE_ENV=production
EXPOSE 3001

# Prisma client（失败即中断构建，不再用 || true 掩盖错误）
RUN npx prisma generate

# Storage / temp dirs
RUN mkdir -p /app/storage /app/tmp
VOLUME ["/app/storage"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/backend/src/main.js"]
