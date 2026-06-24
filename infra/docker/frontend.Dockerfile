# ----- Build stage -----
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY frontend/package.json ./frontend/
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# 使用 frozen-lockfile 确保依赖版本与 lockfile 一致，防止依赖漂移
RUN pnpm install --frozen-lockfile

COPY frontend ./frontend
COPY shared ./shared
RUN cd frontend && pnpm run build

# ----- Runtime stage -----
FROM nginx:1.27-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
