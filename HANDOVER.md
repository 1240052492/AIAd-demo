# AdCraft AI（神笔）— 项目交接文档

> **最后更新：** 2026-07-16
> **仓库位置：** `D:\guanggaohangye`
> **版本：** 0.1.0

---

## 一、系统介绍

### 1.1 产品定位

AdCraft AI（神笔）是一套面向广告/营销行业的 **AI 创意生产与交付工作台**。核心业务闭环为：

```
客户描述/素材上传 → AI 生成广告 Brief → 优化生图提示词 → GPT-image-2 生成设计稿 → Fabric 画布精修 → 环境合成 → 导出交付
```

系统从一句话或客户素材出发，自动生成广告 Brief、优化生图提示词、调用 GPT-image-2 生成设计稿，并在 Fabric 画布上精修、合成真实环境图、导出交付文件。

### 1.2 核心特色

- **Agency Workflow 6 岗位 Prompt 引擎**：客户经理 → 策略总监 → 创意总监 → 文案 → 设计师 → 总控，自动化驱动创意流水线。
- **三段式积分资金链路**：冻结 → 扣减/退回，事务级原子操作，消除并发竞态。
- **异步任务队列**：BullMQ + Redis 驱动生图与环境合成，WebSocket 实时进度推送。
- **OCR 文字校验**：PaddleOCR Sidecar 对生成图中文字进行校验，支持本地文字重绘。
- **生产就绪**：Docker Compose 一键部署，JWT + RBAC + 限流 + 黑名单，健康检查探活。

---

## 二、技术栈

| 层 | 技术选型 |
|---|---|
| **前端** | React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui (Radix) + Fabric.js 5 + Zustand + React Query + React Router 6 |
| **后端** | Node.js + Express 4 + TypeScript (tsx 运行) + Prisma 5 (PostgreSQL 16) + BullMQ 5 (Redis 7) + JWT + zod + multer + sharp |
| **AI** | Claude（文案/Brief/工作流，经 OpenAI 兼容网关）+ GPT-image-2（生图，经中转网关） |
| **OCR** | PaddleOCR + FastAPI（Python Sidecar 容器） |
| **部署** | Docker Compose（postgres / redis / server / worker / web/nginx / ocr-sidecar） |
| **编排** | pnpm workspace monorepo + concurrently 本地开发 |

---

## 三、项目结构

```
D:\guanggaohangye\
├── apps/
│   ├── web/                          # 前端 React + Vite
│   │   └── src/
│   │       ├── pages/                # 页面（见下方前端模块）
│   │       ├── components/           # layout / home / editor / projects / admin / ui
│   │       ├── services/             # api.ts（请求封装 + token 内存管理 + mock 开关）
│   │       ├── stores/               # Zustand（auth / credit）
│   │       ├── hooks/                # useEditor / useFabricCanvas
│   │       └── types/
│   ├── server/                       # 后端 Express + Prisma + BullMQ
│   │   └── src/
│   │       ├── index.ts              # HTTP + WebSocket 服务入口（优雅关闭）
│   │       ├── app.ts                # Express 应用（中间件 + 路由装配 + 错误兜底）
│   │       ├── config/index.ts       # 环境变量 + Prisma/Redis 单例 + 队列实例
│   │       ├── routes/               # 路由层（见下方接口说明）
│   │       ├── services/             # 业务逻辑层（见下方模块功能）
│   │       ├── middleware/            # auth / rbac / rate-limit / content-review
│   │       ├── workers/              # image.worker.ts / progress.ts / credit-compensation.ts
│   │       ├── ws/                   # WebSocket 实时进度（/ws）
│   │       └── utils/                # errors / response / validation / logger / token-blacklist / file
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 数据模型定义
│   │   │   ├── migrations/           # 数据库迁移
│   │   │   ├── seed.ts               # 种子数据（角色/管理员/默认设置）
│   │   │   └── checks.sql            # 余额 CHECK 约束（需手动执行一次）
│   │   └── Dockerfile                # 多阶段构建
│   └── worker/                       # 占位包（已中性化，不抢队列）
├── ocr-sidecar/                      # OCR 文字校验 Sidecar（FastAPI + PaddleOCR）
├── skills/                           # Agency Workflow 6 岗位 Prompt
├── tests/                            # 健壮性三层测试
├── docker-compose.yml                # 一键编排
├── .env.example                      # 环境变量模板（已脱敏）
├── package.json                      # monorepo 根配置
└── pnpm-workspace.yaml
```

### 3.1 前端页面模块

| 页面 | 路径 | 功能 |
|---|---|---|
| Home | `pages/Home/` | 首页/工作台入口 |
| Login / Register | `pages/Login/` `pages/Register/` | 登录/注册 |
| Projects | `pages/Projects/` | 项目列表与管理 |
| Editor | `pages/Editor/` | Fabric 画布编辑器（核心） |
| Workflows | `pages/Workflows/` | AI 工作流执行 |
| Prompts | `pages/Prompts/` | 提示词管理 |
| Dashboard | `pages/Dashboard/` | 数据看板 |
| Membership | `pages/Membership/` | 会员/积分超市 |
| Account | `pages/Account/` | 个人中心 |
| Utility | `pages/Utility/` | 工具页 |
| Admin | `pages/Admin/` | 后台管理（见下方） |

**后台管理子页面：**

| 页面 | 功能 |
|---|---|
| Overview | 数据总览 |
| UserRoles | 用户管理与角色分配 |
| CreditRules | 积分规则配置 |
| CreditLedger | 积分流水台账 |
| TaskQueue | 生成任务队列监控与重试 |
| Providers | AI Provider 配置 |
| Templates | 模板 CRUD |
| Workflow | 工作流模板管理 |
| RechargeMgmt | 充值订单管理 |
| MembershipMgmt | 会员套餐管理 |
| RoleConfig | 角色权限配置 |
| PermissionsEditor | 权限编辑器 |
| ForbiddenWords | 违禁词管理 |
| SystemLayout | 系统设置 |

---

## 四、已实现功能

### 4.1 认证与用户管理

- 注册（`/api/auth/register`）：手机号/邮箱唯一性校验、bcrypt 加密、事务创建用户 + 角色 + 积分账户 + 注册赠送流水。
- 登录（`/api/auth/login`）：JWT 签发（payload 含 userId + roles + jti），账号禁用/封禁拦截；下发 HttpOnly + Secure + SameSite=Strict 的 refresh Cookie。
- 刷新（`/api/auth/refresh`）：用 refresh Cookie 换发短时 access token，返回 `{ accessToken, expiresIn }`。
- 退出（`/api/auth/logout`）：refresh + access 的 jti 同时入黑名单，清除 Cookie。
- RBAC：基于角色的路由守卫（`requireAuth` / `requireAdmin` / `requirePermission`）；Token 黑名单校验（jti，Redis 存储，降级内存）。

### 4.2 积分与资金

- 余额查询（含冻结余额）、流水分页查询。
- **三段式资金操作**：冻结（freeze）→ 任务完成扣减（consume）/ 失败退回（refund），条件 `updateMany(where: balance>=amount)` 原子化。
- 失败补偿队列 / 死信队列（`credit-compensation.ts`，Redis `credit:dlq` 兜底），`processCreditDlq()` 可重放。
- 管理员手工调账（条件更新原子化 + zod 校验）。
- 角色倍率扣积分（`role-config.service`，服务端生效）。
- 充值订单管理（`RechargeOrder` 模型，未接支付网关）。
- 会员套餐管理（`MembershipPlan` / `UserMembership`）。

### 4.3 项目管理

- 项目 CRUD + 分页列表（按业务类型/状态筛选）。
- 素材上传（multer memoryStorage，单文件 ≤20MB，类型白名单 jpg/png/webp/svg/pdf）。
- 画布版本保存（`/versions`，canvasJson 限长 ≤1MB）。
- 项目导出（png/svg/pdf）。
- 资产列表分页查询，资产绑定 `generationJobId` 精确回查。

### 4.4 AI 能力

- **广告 Brief 生成**（`/api/ai/brief`）：输入行业/客户描述/约束 → 结构化 Brief + 缺失问题 + 制作备注 + 风险提示 + 生图提示词。
- **提示词优化**（`/api/ai/prompt`）：基于 Brief 生成多版生图提示词。
- **工作流执行**（`/api/ai/workflows/run`）：Agency Workflow 6 步引擎驱动。
- **生图任务**（`/api/image-jobs`）：提交 → 异步队列 → 轮询状态，结果含生成图资产。
- **环境合成**（`/api/composition-jobs`）：将生成设计稿合成到真实环境图（本地 sharp）。
- **矢量导出**（`/api/vector-assets`）：SVG 矢量图导出。
- 限流：AI 与生图接口 60s/60 次；登录 15min/10 次。

### 4.5 异步任务系统

- **生图队列**（image-generation）：Worker 消费 → 调外部生图网关（无网关时走 mock）→ 下载图片 → 落盘 → 写 Asset → 扣减积分。
- **环境合成队列**（composition）：Worker 消费 → 本地 sharp 合成 → 写 Asset → 扣减积分。
- 进度推送：各阶段经 `jobProgressEmitter` 发射，前端经 WebSocket `/ws?jobId=` 实时接收。
- 上游瞬时网络错误重试（指数退避）。
- 失败路径 `prisma.update` 有界重试后上抛，由 BullMQ failed handler 统一处理。

### 4.6 模板系统

- 公开模板浏览（无需登录）。
- 模板详情、管理员 CRUD。
- 工作流模板管理（`WorkflowTemplate` 模型）。

### 4.7 后台管理

- 数据总览（`/api/dashboard`，实时聚合统计）。
- 用户管理（状态冻结/封禁、积分调账、角色分配）。
- 积分规则配置、角色权限配置。
- 系统设置（站点名/维护模式/上传上限等，基于 Prisma `SystemSetting` 表）。
- AI Provider 配置（启停/优先级，敏感 key 隐藏）。
- 生成任务队列监控、单任务重试。
- 充值订单管理、会员套餐管理。
- 违禁词管理（`ForbiddenWord` 模型）。

### 4.8 OCR 文字校验

- PaddleOCR Sidecar（FastAPI，端口 4188）对生成图中文字进行 OCR 校验。
- 支持本地文字重绘（`TEXT_RENDER_FONT_FAMILY` 配置字体）。
- 可配置置信度阈值（`OCR_MIN_CONFIDENCE`）。

### 4.9 基础设施

- Docker Compose 一键编排（postgres / redis / server / worker / web / ocr-sidecar）。
- 统一错误处理中间件（生产环境隐藏敏感信息）。
- `/storage` 静态目录关闭目录索引。
- 生产加固：trust proxy、gzip、健康检查探活 DB+Redis、限流（Redis 跨副本共享）、JWT 黑名单、容器化、CI 骨架、结构化日志、优雅关闭、CORS 多 origin、DB 连接池。
- 前端 token 仅存内存（防 XSS），refresh 走 HttpOnly Cookie。

---

## 五、启动方式

### 5.1 前置依赖

- **Node.js >= 18**（推荐 22.x，本机 managed: 22.22.2）
- **pnpm**（monorepo 包管理器）
- **Docker**（用于 PostgreSQL + Redis + OCR Sidecar）

### 5.2 环境变量配置

```bash
cp .env.example .env
```

**必须配置的关键变量：**

| 变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://ad_ai:ad_ai_password@127.0.0.1:5432/ad_ai` |
| `REDIS_URL` | Redis 连接串 | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | access token 签名密钥（生产 ≥32 字节，默认值会 exit 1） | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | refresh token 独立密钥（生产建议单独配置） | `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | access token 有效期（生产建议 2h） | `2h` |
| `CORS_ORIGINS` | 允许的前端域名（生产必须设置真实域名，localhost 会 exit 1） | `https://app.example.com` |
| `OPENAI_IMAGE_BASE_URL` | 生图网关地址（缺则走 mock） | `https://xxx/v1` |
| `ANTHROPIC_API_KEY` | 文本 AI 网关令牌 | — |
| `OPENAI_IMAGE_API_KEY` | 生图网关令牌 | — |

### 5.3 本地开发启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动 PostgreSQL + Redis
docker compose up -d postgres redis

# 3. 初始化数据库
pnpm --filter server db:generate          # 生成 Prisma Client
pnpm --filter server migrate:deploy       # 应用迁移（生产也用此命令）
pnpm --filter server db:seed              # 种子数据（角色/管理员/默认设置）

# 4. 执行 CHECK 约束（仅需一次，防止负余额）
#    手动在数据库执行 apps/server/prisma/checks.sql

# 5. 启动服务（三进程同时）
pnpm dev    # = concurrently 起 server(:4177) + worker + web(:5173)
```

**分别启动：**

```bash
pnpm --filter server dev          # 后端 API + WebSocket（端口 4177）
pnpm --filter server worker       # BullMQ Worker（独立进程！）
pnpm --filter web dev             # 前端 Vite（端口 5173，代理 /api → 4177）
```

> **关键提醒：** Worker 是独立进程，`pnpm dev` 会同时拉起。如果单独重启后端，必须手动拉起 Worker，否则生图/合成任务会停在 `queued` 状态。

### 5.4 生产部署

```bash
# 一键 Docker 部署
docker compose up -d

# 或手动构建
pnpm -r build                    # 编译前后端
pnpm --filter server start       # node dist/index.js（API 服务）
pnpm --filter server worker:prod # node dist/workers/image.worker.js（Worker）
# 前端由 nginx 托管 dist/，反代 /api 和 /ws 到 server
```

### 5.5 端口清单

| 服务 | 端口 | 说明 |
|---|---|---|
| 前端 Vite (dev) | 5173 | 开发服务器，代理 /api、/storage → 4177 |
| 后端 API + WebSocket | 4177 | Express HTTP + WS |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存/队列 |
| OCR Sidecar | 4188 | PaddleOCR 服务（仅 127.0.0.1） |
| Web (nginx, prod) | 80 | 前端 SPA + 反代 |

### 5.6 测试账号

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 管理员 | admin@example.com | Admin@123456 |

---

## 六、接口说明

### 6.1 统一响应格式

```json
{
  "code": 0,           // 0 = 成功，非 0 = 错误
  "message": "ok",
  "data": { ... }
}
```

### 6.2 认证接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | 否 | 注册（手机号/邮箱 + 密码） |
| POST | `/api/auth/login` | 否 | 登录（返回 accessToken，下发 refresh Cookie） |
| POST | `/api/auth/refresh` | Cookie | 用 refresh Cookie 换发 accessToken，返回 `{ accessToken, expiresIn }` |
| POST | `/api/auth/logout` | 是 | 注销（access + refresh jti 入黑名单，清 Cookie） |
| GET | `/api/auth/me` | 是 | 获取当前用户信息 |

### 6.3 积分接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/credits/balance` | 是 | 余额查询（含冻结余额） |
| GET | `/api/credits/transactions` | 是 | 积分流水分页查询 |

### 6.4 项目接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/projects` | 是 | 项目列表（分页，可按业务类型/状态筛选） |
| POST | `/api/projects` | 是 | 创建项目 |
| GET | `/api/projects/:id` | 是 | 项目详情（含归属校验） |
| PATCH | `/api/projects/:id` | 是 | 更新项目（status 枚举校验） |
| DELETE | `/api/projects/:id` | 是 | 删除项目 |
| POST | `/api/projects/:id/assets` | 是 | 上传素材（multipart, ≤20MB） |
| GET | `/api/projects/:id/assets` | 是 | 素材列表（分页） |
| POST | `/api/projects/:id/versions` | 是 | 保存画布版本（canvasJson ≤1MB） |
| POST | `/api/projects/:id/export` | 是 | 导出（png/svg/pdf） |

### 6.5 AI 接口

| 方法 | 路径 | 认证 | 限流 | 说明 |
|---|---|---|---|---|
| POST | `/api/ai/brief` | 是 | 60s/60次 | 生成广告 Brief |
| POST | `/api/ai/prompt` | 是 | 60s/60次 | 优化生图提示词 |
| POST | `/api/ai/workflows/run` | 是 | 60s/60次 | 执行 Agency Workflow |

### 6.6 生图与合成接口

| 方法 | 路径 | 认证 | 限流 | 说明 |
|---|---|---|---|---|
| POST | `/api/image-jobs` | 是 | 60s/60次 | 提交生图任务（校验 projectId 归属 + 冻结积分） |
| GET | `/api/image-jobs/:id` | 是 | — | 查询任务状态 |
| POST | `/api/composition-jobs` | 是 | 60s/60次 | 提交环境合成任务（本地 sharp） |
| POST | `/api/vector-assets` | 是 | 60s/60次 | SVG 矢量导出 |

### 6.7 实时进度

| 协议 | 路径 | 说明 |
|---|---|---|
| WebSocket | `/ws?jobId=<id>` | 订阅指定任务的进度事件 |

### 6.8 会员接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/membership/plans` | 否 | 积分超市套餐列表 |
| GET | `/api/membership/mine` | 是 | 当前用户会员信息 |
| GET | `/api/membership/benefits` | 是 | 当前用户有效权益 |
| POST | `/api/membership/purchase` | 是 | 购买（未接支付网关，返回 403） |

### 6.9 模板接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/templates` | 否 | 公开模板列表 |
| GET | `/api/templates/:id` | 否 | 模板详情 |

### 6.10 后台管理接口

| 方法 | 路径前缀 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/dashboard` | Admin | 数据总览（实时聚合） |
| * | `/api/admin/users` | Admin | 用户管理（列表/冻结/封禁/调账/角色） |
| * | `/api/admin/credit-rules` | Admin | 积分规则配置 |
| * | `/api/admin/role-configs` | Admin | 角色权限配置（服务端生效） |
| * | `/api/admin/templates` | Admin | 模板 CRUD |
| * | `/api/admin/workflows` | Admin | 工作流模板 CRUD |
| * | `/api/admin/providers` | Admin | AI Provider 配置 |
| * | `/api/admin/tasks` | Admin | 任务队列监控与重试 |
| * | `/api/admin/settings` | Admin | 系统设置 |
| * | `/api/admin/recharge` | Admin | 充值订单管理 |
| * | `/api/admin/membership` | Admin | 会员套餐管理 |
| * | `/api/admin/forbidden-words` | Admin | 违禁词管理 |

### 6.11 系统接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 否 | 健康检查（探活 DB + Redis，异常返回 503） |
| GET | `/api/capabilities` | 否 | 前端能力探测（布尔值，不返回密钥） |

---

## 七、模块功能详解

### 7.1 后端服务层（`apps/server/src/services/`）

| 服务文件 | 职责 |
|---|---|
| `credit.service.ts` | 积分三段式操作（freeze/consume/refund），条件 updateMany 原子化，InsufficientBalanceError |
| `credit-rule.service.ts` | 读取 system_settings 中的计费规则，按 jobType 返回积分消耗 |
| `project.service.ts` | 项目/素材/版本/导出 CRUD，归属校验防 IDOR |
| `admin.service.ts` | 管理员调账（条件更新 + zod 校验）、系统设置、模板管理 |
| `template.service.ts` | 模板浏览与管理 |
| `system-setting.service.ts` | SystemSetting 表读写（替代旧 JsonStore），upsert 显式写 updatedAt |
| `membership.service.ts` | 会员套餐与用户会员管理 |
| `recharge.service.ts` | 充值订单管理 |
| `role-config.service.ts` | 角色权限配置（Prisma 原生 upsert） |
| `capability.service.ts` | 前端能力探测（返回布尔值，不泄露密钥） |
| `provider-config.service.ts` | AI Provider 配置管理 |
| `forbidden-word.service.ts` | 违禁词管理 |

### 7.2 后端中间件层（`apps/server/src/middleware/`）

| 中间件 | 职责 |
|---|---|
| `auth.ts` | JWT 校验 + req.user 注入；`requireAuth` / `requireAdmin` / `requirePermission` |
| `rbac.ts` | 基于角色的访问控制 |
| `rate-limit.ts` | Redis 固定窗口限流（INCR + PEXPIRE，跨副本共享；Redis 挂了降级内存） |
| `content-review.ts` | 图片内容审核骨架（默认放行，预留接分类器，受 NSFW_ENABLED 控制） |

### 7.3 后端 Worker 层（`apps/server/src/workers/`）

| 文件 | 职责 |
|---|---|
| `image.worker.ts` | BullMQ Worker（独立进程），消费 image-generation + composition 队列 |
| `progress.ts` | `jobProgressEmitter`，经 WebSocket 广播任务进度 |
| `credit-compensation.ts` | 积分补偿队列 / 死信队列（3 次退避重试 → Redis `credit:dlq`） |

### 7.4 后端路由层（`apps/server/src/routes/`）

| 路由文件 | 路径前缀 | 职责 |
|---|---|---|
| `auth.ts` | `/api/auth` | 注册/登录/刷新/退出/me |
| `projects.ts` | `/api/projects` | 项目 CRUD + 素材 + 版本 + 导出 |
| `ai.ts` | `/api/ai` | Brief/prompt/workflow |
| `image-jobs.ts` | `/api/image-jobs` | 生图任务提交与查询 |
| `composition-jobs.ts` | `/api/composition-jobs` | 环境合成任务 |
| `vector-assets.ts` | `/api/vector-assets` | SVG 矢量导出 |
| `credits.ts` | `/api/credits` | 余额与流水 |
| `membership.ts` | `/api/membership` | 会员套餐与权益 |
| `dashboard.ts` | `/api/dashboard` | 数据总览（Admin） |
| `templates.ts` | `/api/templates` | 公开模板 |
| `admin.ts` | `/api/admin` | 后台管理全部接口 |

### 7.5 前端核心 Hook

| Hook | 职责 |
|---|---|
| `useFabricCanvas` | Fabric.js 5 画布管理（默认导入 `import fabricDefault from 'fabric'`，fallback `window.fabric`） |
| `useEditor` | 编辑器状态与操作 |

---

## 八、数据模型

### 8.1 核心实体关系

```
User ──1:1── CreditAccount（balance, frozenBalance）
  │              └──1:N── CreditTransaction（freeze/consume/refund/admin_adjust）
  ├──N:N── Role（admin/user/guest）
  ├──1:N── Project
  │          ├──1:N── ProjectVersion（canvasJson）
  │          ├──1:N── Asset（generationJobId 回写）
  │          └──1:N── GenerationJob
  ├──1:N── GenerationJob（queued→processing→succeeded/failed）
  ├──1:N── RechargeOrder（pending→paid/failed）
  └──1:N── UserMembership ──N:1── MembershipPlan

SystemSetting（key-value，JSON value）
RoleConfig（roleCode, rate, permissions）
ForbiddenWord（word, category, matchType, action）
Template / WorkflowTemplate / AiProviderConfig
```

### 8.2 关键模型字段

| 模型 | 关键字段 | 说明 |
|---|---|---|
| `User` | id, phone, email, passwordHash, status, roles[] | status: active/disabled/banned |
| `CreditAccount` | userId(unique), balance, frozenBalance | 无原生 CHECK，靠应用层 + checks.sql 兜底 |
| `CreditTransaction` | type, amount, balanceAfter, relatedType, relatedId | type: register_bonus/admin_adjust/freeze/consume/refund/recharge |
| `Project` | userId, title, businessType, status, briefJson, currentVersionId | status: draft/generating/editing/completed/exported |
| `GenerationJob` | userId, projectId, provider, model, jobType, status, creditsFrozen, creditsConsumed | jobType: brief/prompt/image_generation/composition/export |
| `Asset` | userId, projectId, generationJobId, type, storageKey, url | type: upload_environment/generated_design/composited_preview/export_* |
| `SystemSetting` | key(unique), value(String), updatedAt | 注意 @map("updated_at") 防漂移 |
| `MembershipPlan` | code, price(分), points, durationDays, rate, permissions | code: monthly/yearly/enterprise/points |
| `RoleConfig` | roleCode(unique), rate, permissions | rate: 消费倍率（代理默认 0.7） |

### 8.3 性能索引

| 表 | 索引 | 优化效果 |
|---|---|---|
| projects | `@@index([userId, updatedAt(sort: Desc)])` | 列表查询 9.8ms → 0.05ms |
| credit_transactions | `@@index([userId, createdAt(sort: Desc)])` | 流水查询 7.3ms → 0.06ms |
| assets | `@@index([generationJobId])` | 按 job 过滤消除全表扫描 |
| generation_jobs | `@@index([status])`, `@@index([userId])` | 队列监控与用户查询 |

---

## 九、未实现功能 / 待办事项

### 9.1 高优先级待办

| 项 | 说明 | 影响 |
|---|---|---|
| 邮箱/手机号验证 | 未实现验证码注册与密码找回 | 安全性 |
| 真实支付/计费对接 | 当前为积分虚拟账户，`/api/membership/purchase` 返回 403 | 商业化 |
| 测试体系补全 | CI 已留 test 骨架，Vitest + Supertest 未预装 | 工程化 |
| 执行 checks.sql | 目标库需手动执行一次，建立 balance/frozenBalance >= 0 CHECK | 数据完整性 |

### 9.2 中优先级待办

| 项 | 说明 |
|---|---|
| 对象存储接入 | MinIO 已在 docker-compose 预留（注释状态），当前用本地磁盘 |
| 图片 CDN / 缩略图 | 减轻带宽与首屏压力 |
| 监控告警 | 任务失败率、积分异常波动、上游网关可用性 |
| NSFW 内容审核 | 骨架已搭（`content-review.ts`），需接真实分类器 |
| i18n 国际化 | 前端多语言支持 |

### 9.3 低优先级 / 非阻塞

| 项 | 说明 |
|---|---|
| sync-fallback 高并发优化 | Redis 不可用时仍走单线程兜底 |
| GitHub 推送 | 需提供 Personal Access Token（沙箱无头环境无法交互认证） |
| 前端组件测试 | 未实施 |

---

## 十、已知坑与注意事项

### 10.1 关键陷阱

| # | 坑 | 说明与解决方案 |
|---|---|---|
| 1 | **Worker 独立进程** | `pnpm dev` 会同时拉起，但单独重启后端后必须手动 `pnpm --filter server worker` 拉起 Worker，否则生图/合成任务卡在 `queued`。**生产用 `worker:prod`（`node dist/workers/image.worker.js`），切勿用 `worker:start`（`tsx src/...`，运行时镜像无 src 会失败）。** |
| 2 | **system_settings 列漂移** | 该表曾因 schema 未加 `@map("updated_at")` 而多出驼峰 `updatedAt` 列（NOT NULL 无默认值），与正确映射列 `updated_at` 并存 → 写入报 P2011 500。已修复：删除孤儿列 + schema 加 `@default(now()) @map("updated_at")` + 新增迁移 `20260714000000_systemsetting_updatedat_default`。**生产用 `prisma migrate deploy` 执行。** |
| 3 | **fabric 导入方式** | 本项目 fabric 为 v5.5.2（CJS/UMD），必须用 `import fabricDefault from 'fabric'` 默认导入并 fallback `window.fabric`，不要用 `import * as fabricNamespace`（会导致编辑器白屏）。 |
| 4 | **JWT refresh 返回格式** | `/api/auth/refresh` 返回 `{ accessToken, expiresIn }`（不是 `token`），前端按 `data.accessToken` 读取。 |
| 5 | **管理员判定** | `user.role==='admin'` **或** `user.roles[].role.code==='admin'`（前端 Admin 已兼容数组判定）。 |
| 6 | **Vite host 配置** | vite.config 已加 `host: true` 修复 IPv6-only 问题（原只听 [::1]，curl 127.0.0.1 收 000）。 |
| 7 | **端口残留** | 上次 vite 没杀干净 → 5173 被占 → vite 跳 5174。用 `netstat -ano | grep :5173` 找 PID 并 taskkill。 |
| 8 | **AI 生图网关依赖** | 无外部网关（`OPENAI_IMAGE_BASE_URL` 超时）时走前端 mock 分支（`runMode==='mock'`）；composition 全程本地不依赖网关。 |

### 10.2 数据库迁移注意事项

- 新增迁移用 `migrate diff` 生成 SQL 再手写迁移文件（非交互 `migrate dev` 不可用）。
- 生产用 `prisma migrate deploy`，**切勿用 `db push`** 覆盖（会丢 @map 导致漂移）。
- `prisma/checks.sql` 必须在目标库手动执行一次（建 balance/frozenBalance >= 0 CHECK 兜底）。
- `$executeRawUnsafe` 的 DDL 在本环境连接池下会回滚不落库，**用 `prisma db execute` 才会提交**。

### 10.3 代码改动后必做

- 改动后端后跑 `cd apps/server && ./node_modules/.bin/tsc --noEmit` 校验类型。
- 改动后更新 `.workbuddy/memory/MEMORY.md` 和当日工作日志。

---

## 十一、测试体系

### 11.1 三层测试架构

| 层 | 位置 | 运行命令 | 说明 |
|---|---|---|---|
| 单元测试 | `apps/server/tests/unit/` | `bash apps/server/tests/unit/run.sh` | 无 DB 依赖，20 断言全绿（credit-concurrency / validation / rate-limit / upload-buffer） |
| 黑盒测试 | `tests/api/` | `BASE_URL=http://localhost:4177 bash tests/api/robustness.sh` | curl 覆盖正常/边界/错误/安全 |
| 集成测试 | `tests/integration/` | `vitest`（需先安装） | Supertest，需 infra 门控 |

### 11.2 端到端测试脚本

| 脚本 | 说明 |
|---|---|
| `_e2e_final.mjs` | 真实数据 E2E（登录 → 建项目 → 上传 → 合成 → 查状态） |
| `_shots.mjs` | UI 截图脚本 |
| `credit_test.mjs` | 积分并发测试 |
| `smoke_admin.mjs` | 后台冒烟测试 |

### 11.3 已修复的健壮性缺陷（共 14 项）

| ID | 级别 | 缺陷 | 修复 |
|---|---|---|---|
| F1 | P0 | 积分超额冻结/负余额(TOCTOU) | 条件 updateMany 原子化 + checks.sql |
| F2 | P0 | 项目 IDOR（asset/version/export 无归属校验） | 增 userId 归属校验 |
| F3 | P0 | 上传必 500（multer dest 不填 buffer） | memoryStorage + buffer/大小校验 |
| F4 | P1 | 资金走异步队列白嫖 | Worker 先同步 consume/refund |
| F5 | P1 | adjustCredits 校验未挂载 | zod schema + 条件更新原子调账 |
| F6 | P1 | 并发注册 500 | 捕获 P2002 → 400 |
| F7 | P1 | 余额错误靠中文 includes | InsufficientBalanceError + instanceof |
| F8-F14 | P2 | 限流头/序列化/枚举/canvasJson/登出/CORS/brief 限长 | 逐项修复 |

---

## 十二、项目文档索引

| 文档 | 位置 | 说明 |
|---|---|---|
| 项目记忆（权威） | `.workbuddy/memory/MEMORY.md` | 必读，含 READ FIRST 强制约定 |
| 架构与模块 | `.workbuddy/memory/PROJECT.md` | 技术栈/模块职责/数据模型/资金链路 |
| 运行手册 | `.workbuddy/memory/RUNBOOK.md` | 构建/启动/测试/部署/已知坑 |
| 审计修复 | `.workbuddy/memory/AUDIT-FIXES.md` | 健壮性审计发现与修复状态 |
| 测试 Playbook | `.workbuddy/memory/TESTING-PLAYBOOK.md` | 改动必补测试映射规则 |
| 健壮性审计 | `ROBUSTNESS-AUDIT.md` | 完整复现/修复步骤 |
| 性能报告 | `PERFORMANCE_REPORT_2026-07-13.md` | 性能优化结论 |
| 交付测试报告 | `TEST_REPORT_2026-07-14.md` | 含 7 张截图 |
| README | `README.md` | 项目总览与快速开始 |

---

## 十三、Agency Workflow 6 岗位

| 角色 | 职责 |
|---|---|
| 客户经理（account-executive） | 需求收集与客户沟通 |
| 策略总监（strategy-director） | 策略方向与创意定位 |
| 创意总监（creative-director） | 创意指导与审核 |
| 文案（copywriter） | 广告文案撰写 |
| 设计师（designer） | 视觉设计与生图 |
| 总控（boss） | 全流程把控与决策 |

6 个角色的 Prompt 定义在 `skills/` 目录，驱动 `/api/ai/workflows/run` 接口的自动化创意流水线。

---

> **交接人注意：** 接手本项目前，请先阅读 `.workbuddy/memory/MEMORY.md`（含 READ FIRST 强制约定），再按需阅读 PROJECT.md / RUNBOOK.md / AUDIT-FIXES.md。项目记忆为权威来源，与代码冲突时以代码为准并回来订正记忆。
