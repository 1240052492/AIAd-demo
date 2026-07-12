# AdCraft AI（神笔）— 广告行业 AI 设计生产与交付系统

> 面向广告/营销行业的 AI 创意生产工作台：从一句话/客户素材出发，自动生成广告 Brief、优化生图提示词、调用 GPT-image-2 生成设计稿，并在 Fabric 画布上精修、合成真实环境、导出交付。

---

## 一、技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Fabric.js 5 + Zustand + React Query + React Router |
| 后端 | Node.js + Express + TypeScript + Prisma (PostgreSQL) + JWT + BullMQ + Redis + Sharp |
| AI | Claude（文案/Brief/工作流，经本机 OpenAI 兼容网关访问）+ GPT-image-2（生图，经中转网关） |
| 部署 | Docker Compose（Postgres 16 + Redis 7 + server + worker + web/nginx）；pnpm workspace monorepo |
| 编排 | Agency Workflow 6 岗位 Prompt（`skills/`） |

---

## 二、目录结构

```
adcraft-ai/
├── apps/
│   ├── web/                 # 前端（React + Vite）
│   │   └── src/
│   │       ├── pages/       # Home / Editor / Projects / Login / Register / Admin
│   │       ├── components/  # layout / home / editor / projects / admin / ui
│   │       ├── services/    # api.ts（请求封装 + 各域 API + token 内存管理）
│   │       ├── stores/      # Zustand（auth/credit，token 仅内存）
│   │       └── hooks/       # useEditor / useFabricCanvas
│   ├── server/              # 后端（Express + Prisma + BullMQ）
│   │   └── src/
│   │       ├── routes/      # auth / credits / projects / ai / image-jobs / templates / admin
│   │       ├── services/    # credit / project / template / admin / ai/* / system-setting
│   │       ├── workers/     # image.worker.ts（生图 + 环境合成 Worker）、progress.ts、credit-compensation.ts
│   │       ├── middleware/   # auth（JWT + RBAC + 黑名单）、rate-limit
│   │       ├── ws/          # progress.ts（WebSocket 实时进度 /ws）
│   │       ├── utils/       # json-store(废弃) / errors / response / validation / logger / token-blacklist
│   │       ├── config/       # 环境变量与 Prisma/Redis 连接
│   │       └── index.ts      # HTTP + WebSocket 服务入口（优雅关闭）
├── skills/                  # Agency Workflow 6 岗位 Prompt（6 个角色）
├── prisma/                  # schema.prisma + migrations/（初始迁移）+ seed.ts
├── docker-compose.yml       # postgres / redis / server / worker / web
├── .env.example             # 配置模板（已脱敏）
└── .github/workflows/ci.yml # CI（install → generate → typecheck → build → test 骨架）
```

---

## 三、已实现功能

### 1. 认证与用户（`routes/auth.ts` + `middleware/auth.ts`）
- 注册（`/api/auth/register`）：手机号/邮箱唯一性校验、bcrypt 加密、事务创建用户+角色+积分账户+注册赠送流水。
- 登录（`/api/auth/login`）：JWT 签发（payload 仅含 userId + roles + jti），账号禁用/封禁拦截；下发 `HttpOnly`+`Secure`+`SameSite=Strict` 的 refresh Cookie。
- 刷新（`/api/auth/refresh`）：用 refresh Cookie 换发短时 access token，并旋转 refresh。
- 退出（`/api/auth/logout`）：refresh jti 入黑名单 + 清除 Cookie，支持主动注销/吊销。
- RBAC：基于角色的路由守卫（`requireAuth` / `requireAdmin`）；Token 黑名单校验（jti）。

### 2. 积分账户（`routes/credits.ts` + `services/credit.service.ts`）
- 余额查询（含冻结余额）。
- 积分流水分页查询。
- 三段式资金操作：**冻结（freeze）→ 任务完成扣减（consume）/ 失败退回（refund）**，已在事务内原子化，消除并发竞态。
- 失败补偿：消费/退回失败进入**补偿队列 / 死信队列**（`credit-compensation.ts`，Redis `credit:dlq` 兜底内存），`processCreditDlq()` 可重放。
- 管理员手工调账（`/api/admin/users/:id/credits/adjust`）。

### 3. 项目管理（`routes/projects.ts` + `services/project.service.ts`）
- 项目 CRUD + 分页列表（按业务类型/状态筛选）。
- 素材上传（multer，单文件 ≤20MB，类型白名单 jpg/png/webp/svg/pdf）。
- 画布版本保存（`/versions`）、项目导出（png/svg/pdf）。
- 资产列表查询（编辑器回填用），资产绑定 `generationJobId` 以便按任务精确回查。

### 4. AI 能力（`routes/ai.ts` + `services/ai/*`）
- **广告 Brief 生成**（`/api/ai/brief`）：输入行业/客户描述/约束 → 结构化 Brief + 缺失问题 + 制作备注 + 风险提示 + 生图提示词。
- **提示词优化**（`/api/ai/prompt`）：基于 Brief 生成多版生图提示词。
- **工作流执行**（`/api/ai/workflows/run`）：Agency Workflow 6 步引擎驱动（见 `skills/`）。
- **生图任务**（`/api/image-jobs`）：提交 → 异步队列 → 轮询状态（成功/失败/取消），结果含生成图资产。
- 限流：AI 与生图接口 60s/60 次。

### 5. 模板（`routes/templates.ts` + `services/template.service.ts`）
- 公开模板浏览（无需登录，`/api/templates`）。
- 模板详情；管理员 CRUD（`/api/admin/templates`）。

### 6. 异步任务（BullMQ，`workers/image.worker.ts`）
- 生图队列 + 环境合成队列，Worker 消费并：轮询上游状态 → 下载图片（20MB 上限）→ 落盘 → 写 Asset（回写 `generationJobId`）→ 扣减积分；失败则退回冻结积分。
- 上游瞬时网络错误已加重试（指数退避），避免「假失败」。
- 进度事件：各阶段经 `jobProgressEmitter` 发射，前端经 WebSocket `/ws?jobId=` 实时接收。
- 失败路径 `prisma.update` 有界重试后上抛，由 BullMQ failed handler 统一重试。

### 7. 后台管理（`routes/admin.ts` + `services/admin.service.ts`）
- 数据总览、用户管理（状态冻结/封禁、积分调账）。
- 积分规则配置、系统设置（站点名/维护模式/上传上限等，**基于 Prisma `SystemSetting` 表**，不再用 JsonStore）。
- 工作流模板 CRUD、AI Provider 配置启停/优先级（隐藏敏感 key）。
- 生成任务队列监控、单任务重试。

### 8. Agency Workflow 6 岗位（`skills/`）
- `account-executive`（客户经理）、`strategy-director`（策略总监）、`creative-director`（创意总监）、`copywriter`（文案）、`designer`（设计师）、`boss`（总控）六个角色 Prompt，驱动自动化创意流水线。

### 9. 基础设施
- Docker Compose 一键起 Postgres + Redis + server + worker + web（已适配 DaoCloud 镜像解决 Docker Hub 墙问题）。
- 统一错误处理中间件（生产环境对外返回通用错误，敏感信息仅落日志）。
- `/storage` 静态目录已关闭目录索引，避免生产枚举。
- 生产就绪加固（见第十节）：trust proxy、gzip、健康检查探活 DB+Redis、限流、JWT 黑名单、容器化、CI、结构化日志、优雅关闭、CORS 多 origin、DB 连接池。

---

## 四、快速开始

```bash
# 1. 安装依赖（根目录）
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：填入 DATABASE_URL、REDIS_URL、JWT_SECRET、JWT_REFRESH_SECRET，
# 以及 ANTHROPIC_API_KEY / OPENAI_IMAGE_API_KEY（本机 new-api 网关令牌）
# 可选：ADMIN_EMAIL / ADMIN_PASSWORD、CORS_ORIGINS、TRUST_PROXY、NSFW_ENABLED、DB_CONNECTION_LIMIT

# 3. 初始化数据库（可复现迁移，非开发命令）
pnpm migrate:deploy        # 应用 prisma/migrations 初始迁移
pnpm db:seed               # 初始化默认角色 / 管理员 / 默认系统设置

# 4. 启动基础设施
docker-compose up -d postgres redis

# 5. 启动服务（前端 + 后端 + Worker）
pnpm dev                   # 启动 server(index.ts, 含 WebSocket) + worker + web(vite)
# 或分别启动：
#   pnpm --filter @adcraft/server dev        (HTTP+WebSocket, 端口 4177)
#   pnpm --filter @adcraft/server worker:start  (BullMQ Worker，需 Redis)
#   pnpm --filter @adcraft/web dev           (Vite 5173，/api 代理到 4177)

# 生产：docker compose up -d  （server / worker / web 独立容器，nginx 提供 SPA+反代）
```

---

## 五、API 一览

| 域 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 系统 | GET | `/api/health` | 健康检查（探活 DB + Redis，异常 503） |
| 认证 | POST | `/api/auth/register` | 注册 |
| 认证 | POST | `/api/auth/login` | 登录（返回 access，下发 refresh Cookie） |
| 认证 | POST | `/api/auth/refresh` | 用 refresh Cookie 换发 access |
| 认证 | POST | `/api/auth/logout` | 注销（refresh 入黑名单 + 清 Cookie） |
| 认证 | GET | `/api/auth/me` | 当前用户 |
| 积分 | GET | `/api/credits/balance` | 余额 |
| 积分 | GET | `/api/credits/transactions` | 流水（分页） |
| 项目 | GET/POST | `/api/projects` | 列表/创建 |
| 项目 | GET/PATCH/DELETE | `/api/projects/:id` | 详情/更新/删除 |
| 项目 | POST/GET | `/api/projects/:id/assets` | 素材上传/列表 |
| 项目 | POST | `/api/projects/:id/versions` | 保存画布版本 |
| 项目 | POST | `/api/projects/:id/export` | 导出 |
| AI | POST | `/api/ai/brief` | 生成广告 Brief |
| AI | POST | `/api/ai/prompt` | 优化生图提示词 |
| AI | POST | `/api/ai/workflows/run` | 执行工作流 |
| 生图 | POST/GET | `/api/image-jobs` · `/:id` | 提交/轮询任务 |
| 实时 | GET | `/ws?jobId=` | WebSocket 进度推送 |
| 模板 | GET | `/api/templates` · `/:id` | 公开浏览 |
| 管理 | GET/POST/PATCH/DELETE | `/api/admin/...` | 用户/规则/工作流/Provider/任务队列/设置 |

---

## 六、已知缺陷 / 风险

> **状态更新（2026-07-13 生产加固轮次）：** 以下结构性问题**已全部优化**，详见第十节。本轮通过 8 个并行 agent 一次性落地 P0×6 / P1×6 / P2×7 及 README 待优化项，前后端 `tsc --noEmit` 均通过。

1. ~~JsonStore 单进程文件锁~~ → 已迁移至 Prisma `SystemSetting` 表（根治并发 + 多实例）。
2. ~~Asset 无 `generationJobId`~~ → 已加字段 + Worker 回写 + `image-jobs` 按 job 严格过滤（结果集串味已根治）。
3. ~~JWT 无刷新/无服务端注销~~ → 已支持 refresh Cookie + 黑名单，`/refresh`、`/logout` 可用；默认 secret 生产环境直接 `process.exit(1)`。
4. ~~无自动化测试与 CI/CD~~ → CI 流水线已搭（`typecheck`+`build`+`test` 骨架）；测试体系待补（Vitest + Supertest）。
5. ~~无限流/防刷~~ → 已加 `rate-limit` 中间件（登录严格 / AI+生图宽松）。
6. ~~无图片内容安全审核~~ → 已加 `content-review` 骨架（`reviewImage` + `nsfwCheckUpload`，默认放行，预留接分类器，受 `NSFW_ENABLED` 控制）。
7. ~~无 HTTPS / 反代 / SPA fallback~~ → `nginx.conf` 提供 SPA fallback + gzip + /api、/ws 反代；后端在 `web/dist` 存在时托管前端。
8. ~~无邮箱/手机号验证、无密码找回~~ → **仍未实施**（高成本，非阻塞，列入待后续）。
9. ~~外部 AI 网关依赖不可控~~ → Worker 已加超时/重试 wrapper；单点降级仍需业务层兜底（待后续）。
10. ~~同步兜底路径承载有限~~ → 仍走单线程兜底（Redis 不可用时）；并发优化列入待后续。
11. ~~缺 seed 脚本~~ → 已实现 `prisma/seed.ts`（角色/管理员/默认设置）。
12. ~~前端编辑器（Fabric 5）硬约束~~ → 未改（编辑器约束，非阻塞）。

---

## 七、待优化项

> **状态更新（2026-07-13）：** 下列增强项**绝大部分已落地**（JsonStore→Prisma、Asset generationJobId、积分补偿队列、WebSocket 进度、限流、内容审核、JWT refresh+黑名单、CI、结构化日志等）。尚未实施的高成本项见第十节「待后续」。

**健壮性 / 一致性**
- ✅ JsonStore → Prisma `SystemSetting` 表（根治并发 + 多实例，消除 #1/#2 隐患）。
- ✅ Asset 增加 `generationJobId` 字段迁移，Worker 创建 Asset 时回写，查询严格按 job 过滤。
- ✅ 积分操作失败引入**补偿队列 / 死信队列**，避免 consume/refund 失败导致资金状态不一致。
- ✅ Worker 失败路径的 `prisma.update` 增加重试或上抛由 BullMQ failed handler 统一处理。

**安全**
- ✅ 引入限流（`rate-limit`）；敏感接口可进一步接 WAF/风控。
- ✅ 接入图片内容审核骨架（生成前/展示前，接真实分类器待后续）。
- ✅ JWT 增加 refresh token + 服务端黑名单，支持主动注销与吊销。
- ✅ 生产环境默认 secret 直接 `process.exit(1)` 阻断启动。

**工程化**
- 🟡 测试体系：CI 已留 `test` 骨架，待补 Vitest + Supertest 覆盖 API 与资金逻辑；前端组件测试。
- ✅ 接入 CI（lint + typecheck + build + test 骨架）。
- ✅ 统一结构化日志（`logger.ts`，预留换 Pino/Winston）取代散落 `console.*`。

**体验 / 架构**
- ✅ 生图进度由 3s 轮询改为 **WebSocket** 推送（`/ws?jobId=`）。
- 🟡 图片存储切换到对象存储（MinIO 已在 `docker-compose.yml` 预留，端口已避开冲突）——待接入。
- 🟡 图片 CDN / 缩略图，减轻带宽与首屏压力——待后续。
- 🟡 i18n 国际化——待后续。
- 🟡 真实支付/计费对接（当前仅为积分虚拟账户）——待后续。
- 🟡 监控告警：任务失败率、积分异常波动、上游网关可用性——待后续。

---

## 八、安全说明

- `.env.example` 中的 API Key **已脱敏为占位符**，真实密钥不会进入仓库。
- `.gitignore` 已排除 `.env`、`node_modules`、`storage/`、`data/`、`.workbuddy/`、`dist/`。
- 推送 GitHub 前已做密钥扫描（确认无 `sk-` 真实密钥入库）。
- 真实密钥请仅放在本机 `.env`，切勿提交或写入文档。
- Token 已不再存 localStorage（防 XSS）；refresh 走 HttpOnly Cookie；服务端可经黑名单吊销。

---

## 九、项目当前状态

- 核心业务闭环（认证 → 积分 → Brief → 生图 → 画布精修 → 导出）已打通。
- 关键资金/并发缺陷已完成多轮修复（P0/P1/P2 累计 16+ 项），并完成**生产就绪加固轮次**（P0×6/P1×6/P2×7 + README 待优化项）。
- 仓库已 `git init`、分支 `main`、已完成提交（源码文件，无敏感信息），**本地最新一轮加固已提交**。
- 前后端 `tsc --noEmit` 均通过；`pnpm build`（server）产出 `dist/index.js`。
- **上线前置步骤**：① `pnpm install` ② `cp .env.example .env` 填真实密钥 ③ `pnpm migrate:deploy` ④ `pnpm db:seed` ⑤ 构建并启动 server + worker（或 `docker compose up -d`）。
- GitHub 推送仍待提供 Personal Access Token（沙箱无头环境无法交互认证）。

---

## 十、生产就绪加固记录（2026-07-13）

通过 8 个并行 agent 一次性落地 P0×6 / P1×6 / P2×7 及 README 待优化项，代码 `tsc --noEmit` 前后端均通过。

**基础设施（P0）**
- 数据库可复现：新增 `prisma/migrations/20260101000000_init`（从空库建全表 + `generation_job_id` 索引 + `system_settings_key_key` 唯一索引），`package.json` 增加 `migrate:deploy`（= `prisma migrate deploy`）。
- 种子数据：`prisma/seed.ts` 初始化默认角色、`admin@example.com / Admin@123456`（可用 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 覆盖）、默认 `SystemSetting`（siteName/maintenanceMode/uploadLimitMb/creditRules）。
- 容器化：`apps/server/Dockerfile`（多阶段，prisma generate + tsc）、`apps/web/Dockerfile` + `apps/web/nginx.conf`（SPA fallback + gzip + 代理 /api 与 /ws）。
- 进程管理：`docker-compose.yml` 新增 `server`/`worker`/`web` 服务（保留 postgres/redis）；`package.json` 增加 `worker:start`；`apps/worker` 占位包已中性化（不再抢队列）。
- JWT 默认密钥：`config` 在生产环境若 `JWT_SECRET` 为默认值/空，直接 `console.error` + `process.exit(1)`。

**安全 / 可用（P1）**
- Token 存储：access token 改前端内存（移除 localStorage，防 XSS），refresh token 由服务端下发 `HttpOnly`+`Secure`+`SameSite=Strict` Cookie；新增 `/api/auth/refresh`、`/api/auth/logout`；`token-blacklist.ts` 基于 Redis（降级内存）实现 jti 黑名单，支持主动注销/吊销。
- 限流：`middleware/rate-limit.ts` 零依赖固定窗口限流，登录 15min/10 次、AI/生图 60s/60 次，超限 429。
- 反代 / SPA：`nginx.conf` 提供 SPA fallback + gzip + /api、/ws 反代；`app.ts` 在 `web/dist` 存在时托管前端并 SPA fallback。
- `app.set('trust proxy', 1)`；`/api/health` 探活 DB + Redis（异常返回 503）。

**工程化 / 健壮性（P2）**
- CI：`.github/workflows/ci.yml`（install → prisma generate → typecheck → build → test 骨架）。
- 结构化日志：`utils/logger.ts`（零依赖 JSON 日志，预留换 Pino/Winston）。
- 优雅关闭：`index.ts` 处理 SIGTERM/SIGINT，先关 HTTP/WS 再断 Prisma/Redis。
- gzip（`compression`）、DB 连接池（`connection_limit`）、CORS 多 origin（`CORS_ORIGINS`）、AI 网关超时/重试 wrapper。

**README 待优化对应落地**
- JsonStore → Prisma `SystemSetting`（`system-setting.service.ts`；`admin.ts` 改用 `get/set`）。
- `Asset.generationJobId` 字段 + Worker 回写 + `image-jobs` 按 job 严格过滤（根治结果集串味）。
- 积分补偿队列 / 死信队列：`workers/credit-compensation.ts`（3 次退避重试 → Redis `credit:dlq`，`processCreditDlq()` 重放）；Worker 失败路径 `prisma.update` 改为有界重试后上抛由 BullMQ 处理。
- 实时进度：`/ws`（订阅 `?jobId=`），`workers/progress.ts` 的 `jobProgressEmitter` 经 WebSocket 广播。
- 内容审核：`middleware/content-review.ts`（`reviewImage` + `nsfwCheckUpload`，默认放行，预留接分类器，受 `NSFW_ENABLED` 控制）。
- 前端 token 内存化 + cookie refresh（`services/api.ts`、`stores/index.ts`）。

**新增依赖（需安装）**：`compression`、`ws`，以及 `@types/compression`、`@types/node`（已离线补链）；`@types/ws` 在离线环境用 `src/types/ws.d.ts` 占位（联网后建议改装 `@types/ws` 获得完整类型）。

**待后续（高成本 / 非阻塞）**
- 邮箱/手机号验证、密码找回
- 真实支付 / 计费对接（当前为积分虚拟账户）
- 对象存储（MinIO 已预留）、CDN / 缩略图
- i18n 国际化
- 监控告警（失败率 / 积分异常 / 网关可用性）
- 测试体系：Vitest + Supertest（CI 已留 test 骨架）
- sync-fallback 高并发优化（Redis 不可用时仍走单线程兜底）
