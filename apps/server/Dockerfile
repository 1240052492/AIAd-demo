# syntax=docker/dockerfile:1
# ============================================================
# AdCraft Server — 多阶段构建
#   builder : 安装依赖 → prisma generate → tsc 编译到 dist
#   runtime : 仅保留 dist + 生产 node_modules + prisma
# 后端监听 PORT（默认 4177）。
#
# 镜像说明：本机 Docker Hub 被墙，故使用 DaoCloud 镜像
#   docker.m.daocloud.io/library/node:20-alpine
# 若你的环境可直连 Docker Hub，可改回 node:20-alpine。
#
# 构建上下文（context）必须为仓库根目录，因为 pnpm 工作区需要
# 根 package.json + pnpm-lock.yaml + pnpm-workspace.yaml。
# compose 中通过 build.context=. / build.dockerfile=apps/server/Dockerfile 指定。
# ============================================================

# ---------------- Builder ----------------
FROM docker.m.daocloud.io/library/node:20-alpine AS builder
ENV NODE_ENV=development
# libc6-compat：部分原生模块（sharp 等）在 alpine/musl 下需要
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1) 工作区元数据 + 锁文件（用于可复现安装）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# 2) server 的 package.json（pnpm 过滤图需要）
COPY apps/server/package.json apps/server/package.json

# 3) 启用 corepack 并仅安装 server 的依赖（--filter 避免拉取 web/skills）
#    未使用 --frozen-lockfile：占位包 apps/worker 是后加的、无依赖，
#    非冻结模式可在容器内安全地把其并入 lockfile，且不改动宿主机的锁文件。
RUN corepack enable && pnpm install --filter @adcraft/server

# 4) 复制源码、生成 Prisma client、tsc 编译到 dist
COPY apps/server apps/server
RUN pnpm --filter server prisma generate
RUN pnpm --filter server build

# ---------------- Runtime ----------------
FROM docker.m.daocloud.io/library/node:20-alpine AS runtime
ENV NODE_ENV=production

# sharp 依赖 libvips（@img/sharp 自带预编译，这里再装系统库兜底，避免运行时缺库）
RUN apk add --no-cache libvips

WORKDIR /app

# 工作区元数据：worker 容器需通过 `pnpm --filter server worker:start`
# 解析到 server 包，因此保留根 package.json 与 pnpm-workspace.yaml。
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/

# 生产依赖（@prisma/client / bullmq / sharp / ioredis 等，来自 --filter 安装结果）
COPY --from=builder /app/node_modules /app/node_modules

# server 包：package.json + 编译产物（dist）+ 其 node_modules（符号链接，COPY 会解析为实际内容）
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/server/node_modules /app/apps/server/node_modules

# prisma schema（供迁移 / 种子 / generate 使用）
COPY --from=builder /app/apps/server/prisma /app/apps/server/prisma

# worker 容器要用 pnpm 执行 worker:start，确保 pnpm 在运行时可用
RUN npm install -g pnpm

EXPOSE 4177

# 运行 server：入口由 Agent H 提供 apps/server/dist/index.js
# 注意：apps/server/package.json 的 "start" 指向 dist/app.js，
#       此处按 Agent H 约定使用 dist/index.js。
CMD ["node", "apps/server/dist/index.js"]
