# AdCraft AI（神笔）— 广告行业 AI 设计生产与交付系统

> 面向广告/营销行业的 AI 创意生产工作台：从一句话/客户素材出发，自动生成广告 Brief、优化生图提示词、调用 GPT-image-2 生成设计稿，并在 Fabric 画布上精修、合成真实环境、导出交付。

---

## 一、技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Fabric.js 5 + Zustand + React Query + React Router |
| 后端 | Node.js + Express + TypeScript + Prisma (PostgreSQL) + JWT + BullMQ + Redis + Sharp |
| AI | Claude（文案/Brief/工作流，经本机 OpenAI 兼容网关访问）+ GPT-image-2（生图，经中转网关） |
| 部署 | Docker Compose（Postgres 16 + Redis 7）；pnpm workspace monorepo |
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
│   │       ├── services/    # api.ts（请求封装 + 各域 API）
│   │       ├── stores/      # Zustand
│   │       └── hooks/       # useEditor / useFabricCanvas
│   ├── server/              # 后端（Express + Prisma + BullMQ）
│   │   └── src/
│   │       ├── routes/      # auth / credits / projects / ai / image-jobs / templates / admin
│   │       ├── services/    # credit / project / template / admin / ai/*
│   │       ├── workers/     # image.worker.ts（生图 + 环境合成 Worker）
│   │       ├── middleware/   # auth（JWT + RBAC）
│   │       ├── utils/       # json-store / errors / response / validation
│   │       └── config/       # 环境变量与 Prisma/Redis 连接
├── skills/                  # Agency Workflow 6 岗位 Prompt（6 个角色）
├── prisma/                  # schema.prisma
├── docker-compose.yml       # Postgres + Redis（DaoCloud 镜像加速）
└── .env.example             # 配置模板（已脱敏）
```

---

## 三、已实现功能

### 1. 认证与用户（`routes/auth.ts` + `middleware/auth.ts`）
- 注册（`/api/auth/register`）：手机号/邮箱唯一性校验、bcrypt 加密、事务创建用户+角色+积分账户+注册赠送流水。
- 登录（`/api/auth/login`）：JWT 签发（payload 仅含 userId + roles），账号禁用/封禁拦截。
- 当前用户（`/api/auth/me`）、退出（客户端清 token）。
- RBAC：基于角色的路由守卫（`requireAuth` / `requireAdmin`）。

### 2. 积分账户（`routes/credits.ts` + `services/credit.service.ts`）
- 余额查询（含冻结余额）。
- 积分流水分页查询。
- 三段式资金操作：**冻结（freeze）→ 任务完成扣减（consume）/ 失败退回（refund）**，已在事务内原子化，消除并发竞态（见 Code Review 修复记录）。
- 管理员手工调账（`/api/admin/users/:id/credits/adjust`）。

### 3. 项目管理（`routes/projects.ts` + `services/project.service.ts`）
- 项目 CRUD + 分页列表（按业务类型/状态筛选）。
- 素材上传（multer，单文件 ≤20MB，类型白名单 jpg/png/webp/svg/pdf）。
- 画布版本保存（`/versions`）、项目导出（png/svg/pdf）。
- 资产列表查询（编辑器回填用）。

### 4. AI 能力（`routes/ai.ts` + `services/ai/*`）
- **广告 Brief 生成**（`/api/ai/brief`）：输入行业/客户描述/约束 → 结构化 Brief + 缺失问题 + 制作备注 + 风险提示 + 生图提示词。
- **提示词优化**（`/api/ai/prompt`）：基于 Brief 生成多版生图提示词。
- **工作流执行**（`/api/ai/workflows/run`）：Agency Workflow 6 步引擎驱动（见 `skills/`）。
- **生图任务**（`/api/image-jobs`）：提交 → 异步队列 → 轮询状态（成功/失败/取消），结果含生成图资产。

### 5. 模板（`routes/templates.ts` + `services/template.service.ts`）
- 公开模板浏览（无需登录，`/api/templates`）。
- 模板详情；管理员 CRUD（`/api/admin/templates`）。

### 6. 异步任务（BullMQ，`workers/image.worker.ts`）
- 生图队列 + 环境合成队列，Worker 消费并：轮询上游状态 → 下载图片（20MB 上限）→ 落盘 → 写 Asset → 扣减积分；失败则退回冻结积分。
- 上游瞬时网络错误已加重试（指数退避），避免「假失败」。

### 7. 后台管理（`routes/admin.ts` + `services/admin.service.ts`）
- 数据总览、用户管理（状态冻结/封禁、积分调账）。
- 积分规则配置、系统设置（站点名/维护模式/上传上限等，基于 JsonStore 原子更新）。
- 工作流模板 CRUD、AI Provider 配置启停/优先级（隐藏敏感 key）。
- 生成任务队列监控、单任务重试。

### 8. Agency Workflow 6 岗位（`skills/`）
- `account-executive`（客户经理）、`strategy-director`（策略总监）、`creative-director`（创意总监）、`copywriter`（文案）、`designer`（设计师）、`boss`（总控）六个角色 Prompt，驱动自动化创意流水线。

### 9. 基础设施
- Docker Compose 一键起 Postgres + Redis（已适配 DaoCloud 镜像解决 Docker Hub 墙问题）。
- 统一错误处理中间件（生产环境对外返回通用错误，敏感信息仅落日志）。
- `/storage` 静态目录已关闭目录索引，避免生产枚举。

---

## 四、快速开始

```bash
# 1. 安装依赖（根目录）
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：填入 DATABASE_URL、REDIS_URL、JWT_SECRET，
# 以及 ANTHROPIC_API_KEY / OPENAI_IMAGE_API_KEY（本机 new-api 网关令牌）

# 3. 初始化数据库
pnpm db:migrate          # 或 pnpm db:push
# 首次运行需确保存在默认 role（user）与管理员账号（register 依赖默认角色）

# 4. 启动基础设施
docker-compose up -d postgres redis

# 5. 启动服务（前端 + 后端 + Worker）
pnpm dev
# 或分别启动：
#   pnpm dev:server   (PORT 4177)
#   pnpm dev:worker   (启动 apps/server/src/workers/image.worker.ts，需 Redis)
#   pnpm dev:web      (Vite 5173，/api 代理到 4177)
```

---

## 五、API 一览

| 域 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 系统 | GET | `/api/health` | 健康检查 |
| 认证 | POST | `/api/auth/register` | 注册 |
| 认证 | POST | `/api/auth/login` | 登录 |
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
| 模板 | GET | `/api/templates` · `/:id` | 公开浏览 |
| 管理 | GET/POST/PATCH/DELETE | `/api/admin/...` | 用户/规则/工作流/Provider/任务队列/设置 |

---

## 六、已知缺陷 / 风险

> 以下为当前代码中**真实存在**的问题，按严重程度排列。前几轮 Code Review 已修复 P0×3 / P1×5 / P2×8（竞态、并发丢失、静默吞错、重试、结果集串味、输入与资源限流、JWT 告警、错误泄露、目录索引等），下述为**尚未根治**或**结构性**问题。

1. **JsonStore 为单进程文件锁（P2-5，架构级）**
   `utils/json-store.ts` 的互斥锁仅保证单进程内串行化。多实例部署（PM2 cluster / K8s 多 pod）时 `credit-rules` / `settings` 会退化为竞态丢失更新。根治需迁移到 Prisma 表。

2. **Asset 无 `generationJobId`（结果集兜底脆弱）**
   `image-jobs.ts` 的 `GET /:id` 成功时依赖 Worker 写入的 `responseJson.results` 过滤。若上游未回写 `responseJson`，会回退到「按 `projectId + type` 查前 20 条」，多批次生图时仍可能混入其他批次图片（#5 的原始隐患以兜底形式残留）。

3. **JWT 无刷新、无服务端注销**
   `logout` 仅客户端清 token；服务端不维护吊销列表，token 泄露无法失效。默认 secret `dev-secret-change-me` 仅告警不阻断（生产环境仍可能被误用）。

4. **无自动化测试与 CI/CD**
   全仓 0 测试覆盖，无 CI 流水线。核心资金逻辑（冻结/扣减/退回）仅靠 Code Review 保障，回归风险高。

5. **无频率限制 / 防刷**
   AI 生图按次扣积分，但接口无 rate limit。账号被盗或恶意调用可快速刷空积分或产生上游费用。

6. **无图片内容安全审核（NSFW）**
   生图与展示前未做任何内容审核，存在合规与滥用风险。

8. **无邮箱/手机号验证、无密码找回**
   注册仅校验唯一性，无验证流程；忘记密码无自助找回通道。

9. **外部 AI 网关依赖不可控**
   生图走第三方中转（`.env` 中 `apic.aksearch.site`），可用性与计费不受本项目控制；`.env` key 为占位，需用户自备 new-api 令牌。

10. **同步兜底路径承载有限**
    当 Redis/BullMQ 不可用时，`openai-image.service.ts` 的 `sync-fallback` 走「直接 fetch + 轮询」单线程实现，高并发下会成为瓶颈。

11. **缺 seed 脚本**
    `register` 依赖默认 `user` 角色存在；当前未提供初始化 seed，首次部署需手工插入角色/管理员。

12. **前端编辑器（Fabric 5）硬约束**
    `FabricCanvas` 必须传 `<canvas>` 元素（非 `<div>`），且 import 须用 `import { fabric } from 'fabric'`（见项目记忆）。大图/多图层场景下未做性能虚拟化，复杂画布可能卡顿。

---

## 七、待优化项

**健壮性 / 一致性**
- JsonStore → Prisma `SystemSetting` 表（根治并发 + 多实例，同时消除 #1/#2 隐患）。
- Asset 增加 `generationJobId` 字段迁移，Worker 创建 Asset 时回写，查询严格按 job 过滤。
- 积分操作失败引入**补偿队列 / 死信队列**，避免 consume/refund 失败导致资金状态不一致。
- Worker 失败路径的 `prisma.update` 增加重试或上抛由 BullMQ failed handler 统一处理。

**安全**
- 引入 `express-rate-limit` 限流；敏感接口加 WAF/风控。
- 接入图片内容审核（生成前/展示前）。
- JWT 增加 refresh token + 服务端黑名单，支持主动注销与吊销。
- 生产环境默认 secret 直接 `process.exit(1)` 阻断启动（而非仅告警）。

**工程化**
- 建立测试体系：Vitest + Supertest 覆盖 API 与资金逻辑；前端组件测试。
- 接入 CI（lint + typecheck + test + build）。
- 统一结构化日志（Winston / Pino）取代散落的 `console.*`。

**体验 / 架构**
- 生图进度由 3s 轮询改为 **WebSocket / SSE** 推送。
- 图片存储切换到对象存储（MinIO 已在 `docker-compose.yml` 预留，端口已避开冲突）。
- 图片 CDN / 缩略图，减轻带宽与首屏压力。
- i18n 国际化。
- 真实支付/计费对接（当前仅为积分虚拟账户）。
- 监控告警：任务失败率、积分异常波动、上游网关可用性。

---

## 八、安全说明

- `.env.example` 中的 API Key **已脱敏为占位符**，真实密钥不会进入仓库。
- `.gitignore` 已排除 `.env`、`node_modules`、`storage/`、`data/`、`.workbuddy/`。
- 推送 GitHub 前已做密钥扫描（确认无 `sk-` 真实密钥入库）。
- 真实密钥请仅放在本机 `.env`，切勿提交或写入文档。

---

## 九、项目当前状态

- 核心业务闭环（认证 → 积分 → Brief → 生图 → 画布精修 → 导出）已打通。
- 关键资金/并发缺陷已完成两轮修复（P0/P1/P2 共 16 项）。
- 仓库已 `git init`、分支 `main`、已完成首次提交（125 个源码文件，无敏感信息），待推送到 GitHub。
- 上线前务必处理：JsonStore 多实例化、JWT 吊销、限流与内容审核（见第六、七节）。
