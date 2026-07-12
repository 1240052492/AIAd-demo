# syntax=docker/dockerfile:1
# ============================================================
# AdCraft Web — 构建 Vite SPA，用 nginx:alpine 托管静态资源
#
# 镜像说明：本机 Docker Hub 被墙，故使用 DaoCloud 镜像
#   docker.m.daocloud.io/library/node:20-alpine
#   docker.m.daocloud.io/library/nginx:alpine
# 若可直连 Docker Hub，可改回 node:20-alpine / nginx:alpine。
#
# 构建上下文为仓库根目录（同 server），以便复用根 lockfile 与工作区配置。
# ============================================================

# ---------------- Builder ----------------
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json

# 仅安装 web 的依赖（避免拉取 server/skills）
RUN corepack enable && pnpm install --filter @adcraft/web

COPY apps/web apps/web
RUN pnpm --filter web build

# ---------------- Runtime ----------------
FROM docker.m.daocloud.io/library/nginx:alpine AS runtime

# 用自定义配置覆盖默认站点（SPA fallback / gzip / /api、/ws 代理）
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Vite 生产构建产物
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
