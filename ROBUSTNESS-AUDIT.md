# AdCraft AI — 系统健壮性审计报告

> 审计对象：`apps/server`（Express + Prisma + BullMQ + Redis）
> 审计方式：静态代码走查 + 可执行健壮性脑力测试（DB-free 单测已实际运行复现 2 个缺陷）
> 审计日期：2026-07-13
> 配套：本仓库 `tests/` 目录下的三层健壮测试（单元 / curl / 集成）

---

## 0. 方法与范围

对后端逐路由、逐服务、逐中间件做"破坏式"走查，关注四类健壮性维度：

1. **并发一致性**（资金、计数、状态机）
2. **输入健壮性与错误路径**（非法 JSON、缺字段、越界、类型错误、超大负载）
3. **访问控制 / 越权（IDOR / RBAC）**
4. **依赖与故障处理**（DB/Redis/AI 网关不可用时的降级、重试、资源泄漏）

所有结论均给出 `文件:行号` 与可复现的触发方式。标 **[已复现]** 的缺陷已用
`tests/unit/` 下的可执行脚本在本地确定性复现（无需数据库）。

---

## 1. 结论速览

| 级别 | 缺陷 | 一句话 |
|---|---|---|
| **P0** | 积分 `freeze/consume/refund` 非并发安全 | 读-改-写非原子，可超额冻结/负余额/双花（README 声称已修复，实际未修）**[已复现]** |
| **P0** | 项目资产/版本/导出越权（IDOR） | `getAssets`/`saveVersion`/`exportProject` 不校验归属，任意登录用户可读写他人项目 **[代码确认]** |
| **P0** | 文件上传必 500 | `multer({dest})` 不填充 `req.file.buffer`，而 `uploadAsset` 读取 `file.buffer` **[已复现]** |
| **P1** | 资金补偿走异步队列覆盖"扣减"路径 | 任务标记成功后异步 `consume`，队列/Redis 失败则冻结积分永久滞留（白嫖/卡死） |
| **P1** | `adjustCredits` 校验 schema 形同虚设 | `validation.ts` 定义了 `adjustCreditsSchema` 但路由从未应用，直接 `Number(req.body.amount)` |
| **P1** | 并发注册唯一约束冲突 → 500 | 两个相同手机号并发注册：唯一约束异常未捕获，返回 500 而非 400 |
| **P1** | 余额不足判定靠字符串 `includes('不足')` | 服务文案一改，余额不足就从 400 变成 500 |
| **P2** | 限流器进程内存、未跨副本共享 | 多 server 副本时各自计数；且无 `X-RateLimit-*` 头 |
| **P2** | `/ai/prompt` 的 `JSON.stringify(brief)` 无保护 | `brief` 含循环引用 → 抛错 → 500（应为 400） |
| **P2** | 项目 `status` 未枚举校验 | `PATCH /projects/:id` 可写任意字符串 |
| **P2** | `saveVersion`/`exportProject` 无体积上限 | 超大 `canvasJson` 可直接写入 DB（JSON DoS） |
| **P2** | 退出仅拉黑 refresh jti | access token（≤15min）登出后仍可用 |
| **P2** | CORS 对无 Origin 请求放行 + credentials | 非浏览器客户端绕过 origin 白名单（可接受，需知会） |
| **P2** | `/ai/brief` 的 `constraints` 未限长 | 超大对象被拼进 LLM prompt（费用/体积攻击面） |

---

## 2. P0 详情

### F1. 积分冻结/扣减/退回非并发安全（资金一致性）⚠️ 最严重

**位置**：`apps/server/src/services/credit.service.ts`
- `freeze` L39-67
- `consume` L76-104
- `refund` L112-141

**现状**：每个方法在 `prisma.$transaction` 内先 `findUnique` 读余额，再 `update` 写余额：

```ts
const account = await tx.creditAccount.findUnique({ where: { userId } })   // 普通 SELECT
if (account.balance < amount) throw ...                                    // 应用层检查
await tx.creditAccount.update({ where: { id: account.id },
  data: { balance: { decrement: amount }, frozenBalance: { increment: amount } } })
```

**问题**：PostgreSQL 默认隔离级别为 READ COMMITTED，`findUnique` 是普通 SELECT、**不加行锁**。两个并发事务可都读到旧的（提交前）余额、都通过检查、都执行 decrement → 超额冻结 / **负余额** / 双花。该应用层检查并非原子操作。

**加剧因素**：`prisma/schema.prisma` 中 `CreditAccount.balance` / `frozenBalance` 是无符号 `Int` **且无 `CHECK (balance >= 0)` 约束**，数据库层面也无法兜底。

> README 第十节声称"已在事务内原子化，消除并发竞态"——**与代码事实不符**。事务保证的是"全有或全无"，并不等于"检查+写入原子"。

**[已复现]**：`tests/unit/credit-concurrency.test.mjs` 用内存模型 + `setImmediate` 精确复现该读-改-写交错：余额 10 时两个并发 `freeze(8)` → 余额变 **-6**、冻结 16，且两个调用都"成功"（不抛 400）。同一脚本用**条件更新**（`UPDATE ... WHERE balance >= amount`，单条语句加行锁）复现修复后行为：仅一个成功、另一个被拒、余额正确。

**修复建议**：
1. 把余额检查下移进单条条件更新：
   ```ts
   const n = await tx.creditAccount.updateMany({
     where: { id: accountId, balance: { gte: amount } },
     data: { balance: { decrement: amount }, frozenBalance: { increment: amount } },
   })
   if (n.count === 0) throw new InsufficientBalanceError(...)
   ```
   或 `tx.creditAccount.findUnique({ where: { id }, lock: { mode: 'Update' } })`（Prisma 行锁）。
2. schema 增加 `balance Int @default(0) @db.Integer` + 迁移加 `CHECK (balance >= 0)` 与 `CHECK (frozen_balance >= 0)`。
3. 引入 `InsufficientBalanceError extends AppError`（见 F7），让"不足"成为结构化错误而非字符串匹配。

---

### F2. 项目资产/版本/导出的越权访问（IDOR）⚠️

**位置**：`apps/server/src/services/project.service.ts`
- `getAssets(projectId)` L140-145：**只按 `projectId` 查，不接收/不校验 `userId`**
- `saveVersion(projectId, ...)` L148-169：仅 `findUnique({where:{id}})` 判断**存在**，不判断归属
- `exportProject(projectId, ...)` L172-224：同上，仅判断存在

**调用方**：`routes/projects.ts`
- `GET /:id/assets` L89-95：传 `req.params.id`，**未传 `req.user!.id`**
- `POST /:id/versions` L99-110：传 `req.params.id`，未传 userId
- `POST /:id/export` L113-124：同上

对比：同文件的 `detail` / `update` / `delete` / `uploadAsset` 都正确调用了 `assertOwner`（L238-243）。即**同一路由组里，部分接口做了归属校验、部分没做**——典型"一致性缺口"。

**影响**：
- 任意登录用户可**读取**他人项目全部素材（`GET /assets`）——敏感资产泄露。
- 任意登录用户可**写入**他人项目的画布版本 / 导出记录（`POST /versions`、`POST /export`）——数据篡改。
- 由于 `id` 为 cuid（不可猜测），直接利用需已知 ID；但属于"设计为无归属校验"的越权，应纵深防御。

**同源缺陷**：`routes/image-jobs.ts` `POST /`（L34-106）提交生图任务时 `projectId` 未校验归属，Worker 会把生成资产写进**任意** `projectId` 的项目（写 IDOR）。

**[已确认·代码]**：静态走查确认 `getAssets`/`saveVersion`/`exportProject` 签名与实现均不含 userId/归属判断。

**修复建议**：`getAssets/saveVersion/exportProject` 增加 `userId` 参数并 `assertOwner`；或查询用 `where: { id: projectId, userId }`。`image-jobs` 提交时校验 `projectId` 归属（或允许为空由系统建项目）。

**测试覆盖**：`tests/api/robustness.sh` 的 IDOR 用例、`tests/integration/robustness.spec.ts` 的 "broken access control" 组均断言"应 403/404"——当前会 FAIL（标 `[KNOWN-BUG]`），修复后转绿。

---

### F3. 文件上传必返回 500 ⚠️

**位置**：`routes/projects.ts` L11-19（multer 配置）+ `services/project.service.ts` `uploadAsset` L104（`FileStorage.save(file.buffer, ...)`）

```ts
const upload = multer({ dest: 'uploads/' })          // diskStorage：写入磁盘
...
const asset = await projectService.uploadAsset(req.params.id, req.user!.id, req.file, type)
// uploadAsset 内：FileStorage.save(file.buffer, file.originalname, 'assets')
```

**问题**：multer 的 `dest` 走 diskStorage，**不会填充 `req.file.buffer`**（仅 `memoryStorage` 才填充）。因此 `FileStorage.save(file.buffer, ...)` 拿到 `undefined` → `sharp(undefined)` / `fs.writeFile(absPath, undefined)` 抛 `TypeError` → 经 `asyncHandler` 落入全局错误处理 → **HTTP 500**。换言之，**每一次素材上传都会 500**，上传功能在代码层是坏的。

附带：multer 先把临时文件写到 `uploads/`（相对 cwd，非配置的 `localStorageDir`），而代码读 `buffer`、从不清理 `file.path` → 即便修好也会留下**孤儿临时文件**（磁盘泄漏）。

**[已复现]**：`tests/unit/upload-buffer-probe.mjs` 用与生产完全一致的 `multer({dest:'uploads/'})` 起一个最小 Express，POST 真实 multipart 文件，结果 `req.file.buffer` 为 `undefined`（当前配置）。同一脚本用 `multer.memoryStorage()` 复现修复后行为：`req.file.buffer` 正常。

**修复建议**：改用 `multer({ storage: multer.memoryStorage() })`，并在 `uploadAsset` 对 `file.buffer`/`file.size` 做空值与大小（≤20MB）校验。若需避免大文件占内存，可改为读取 `file.path` 并上传后 `fs.unlink` 清理。

---

## 3. P1 详情

### F4. 资金"扣减"走异步补偿队列（最终一致性风险）

**位置**：`workers/image.worker.ts` L202-219（成功路径）、L240-249（失败退回）

```ts
await prisma.generationJob.update({ ... status: 'succeeded', creditsConsumed: credits })
await enqueueCreditCompensation({ type: 'consume', ... })   // 异步、best-effort、永不抛错
```

**问题**：任务**已标记为 `succeeded`** 之后，才异步把"冻结→扣减"提交到补偿队列。`enqueueCreditCompensation` 设计为**不抛错**（本体重试 3 次失败即入 DLQ）。若此时 Redis/队列不可用、或进程在入队前崩溃：
- 用户 `succeeded` 拿到图，但冻结积分**永远不被扣减** → **白嫖出图**（资金泄漏）；
- 失败时 `refund` 同理失败 → 冻结积分**永久滞留**（用户资产被错误占用）。

换言之，把"钱"的扣减从事务内同步操作挪到了事后异步链路，引入了窗口期与丢失风险。原同步 `consume` 更安全。

**修复建议**：在 Worker 内**同一个 DB 事务**里完成"标记成功 + `creditService.consume`"；补偿队列仅作为 `consume`/`refund` 失败后的**最后兜底**与对账手段，而非主路径。给 `generationJob` 增加"已计费"状态位，防止重复/遗漏计费。

---

### F5. `adjustCredits` 的校验 schema 形同虚设

**位置**：`utils/validation.ts` L32-35（`adjustCreditsSchema` 已定义） vs `routes/admin.ts` L84-96（**从未使用**）

```ts
const amount = Number(req.body.amount)        // 直接 Number()，未经 schema
const result = await adminService.adjustCredits(req.params.id, req.user!.id, amount, req.body.reason)
```

**问题**：`adjustCreditsSchema`（`z.number().int()` + `reason` 必填且 ≤200）定义了却没挂到路由上。后果：
- `amount` 可为 `NaN`（`Number('abc')`）、小数、`Number(undefined)=NaN` → `adminService` 虽校验了 `!Number.isFinite || ===0`，但**不校验整数**，且 `NaN` 会经 `balance + NaN = NaN` 污染账户余额；
- `reason` 长度/必填未在路由层强制（服务层用 `reason || '管理员调整'` 兜底）。

**修复建议**：路由内 `const parsed = adjustCreditsSchema.safeParse(req.body); if(!parsed.success) return fail(400, ...)`，再使用 `parsed.data.amount` / `parsed.data.reason`。

---

### F6. 并发注册唯一约束冲突 → 500

**位置**：`routes/auth.ts` `register` L80-135

先 `findUnique` 查重，再 `tx.user.create`。两个相同手机号的并发请求可都通过查重，其中一个 `create` 触发 Prisma 唯一约束（P2002）→ 异常未捕获 → 全局错误处理返回 **500**，而非友好的 400「该手机号已注册」。

**修复建议**：捕获 `Prisma.PrismaClientKnownRequestError` 且 `code === 'P2002'` → 400；或注册整体用 `upsert`/唯一约束冲突重试。

---

### F7. 余额不足判定靠字符串 `includes('不足')`

**位置**：`routes/ai.ts` L61-66、L111-115、L169-175

```ts
const msg = err instanceof Error ? err.message : String(err)
if (msg.includes('不足')) return res.status(400).json(...)   // 余额不足 -> 400
return next(err)                                            // 其它 -> 500
```

**问题**：路由靠 `creditService` 抛出的**中文字符串**判断"余额不足"以返回 400。一旦服务层文案调整（如改为"积分不够"），同一错误就会从 400 变成 **500**。这是脆弱的隐式耦合。

**修复建议**：定义 `InsufficientBalanceError extends AppError(..., 400)`，服务层抛出该类型；路由用 `instanceof` 判定，与文案解耦。

---

## 4. P2 详情（健壮性增强，非阻断）

- **F8 限流进程内存**：`rate-limit.ts` 的 `hits` 是进程内 `Map`，多 server 副本不共享；建议 Redis 计数（或网关层限流），并下发 `X-RateLimit-Limit/Remaining/Reset` 头。
- **F9 `/ai/prompt` 序列化未保护**：`ai.ts` L98 `JSON.stringify(brief)` ——若 `brief` 含循环引用抛错 → 500；应在解析前做 `try/catch` 并返回 400。
- **F10 项目 status 未枚举**：`project.service.ts` `update` L81-93 允许 `status` 为任意字符串；建议用 `z.enum([...])`。
- **F11 canvasJson 无体积上限**：`saveVersion`/`exportProject` 直接写入 DB JSON；建议限制 `JSON.stringify` 长度（如 ≤1MB）。
- **F12 登出仅拉黑 refresh**：`auth.ts` `logout` 只把 refresh jti 入黑名单，access token 仍可用至过期（≤15min）——标准权衡，但属"登出后短暂可重放"窗口，需在安全说明中明示。
- **F13 CORS 无 Origin 放行**：`app.ts` L37 `if(!origin) callback(null,true)` 带 `credentials:true` 时，非浏览器/CLI 客户端绕过 origin 白名单——可接受，记录即可。
- **F14 `/ai/brief` 的 `constraints` 未限长**：`ai.ts` L154-156 直接拼进 prompt；建议对 `constraints` 做总大小限制。

---

## 5. 已具备的健壮性优点（保持）

为平衡视角，以下做得到位，测试中也作为"应通过"项验证：
- 全局错误处理统一格式 + 生产环境不泄露内部错误（`app.ts` L111-124）。
- `helmet` + `compression` + `trust proxy` + `/storage` 关闭目录索引（`app.ts`）。
- `/api/health` 同时探活 DB 与 Redis，异常返回 503（`app.ts` L67-87）。
- JWT refresh Cookie（HttpOnly/SameStrict）+ 黑名单 + 旋转（`auth.ts`）。
- 登录 / AI / 生图限流已挂载（`app.ts` L90-92）。
- AI 文本长度上限（8000）、生图 prompt 上限（4000）、`count` 钳制 1..4（`ai.ts` / `image-jobs.ts`）。
- Worker 超时 + 指数退避重试 + `markJobFailedWithRetry` + 补偿 DLQ（`image.worker.ts` / `credit-compensation.ts`）。
- 查询 `generation_jobs` 严格按 `userId` 过滤，避免跨用户串味（`image-jobs.ts` L116）。
- 资源 ID 用 cuid（缓解 IDOR 猜测，配合 F2 修复更佳）。

---

## 6. 测试覆盖矩阵

| 缺陷 | 单元（DB-free） | curl 黑盒 | 集成（Supertest） |
|---|---|---|---|
| F1 积分并发 | ✅ `credit-concurrency.test.mjs` | — | ✅ 并发冻结回归 |
| F2 项目 IDOR | — | ✅ `[KNOWN-BUG]` | ✅ `[KNOWN-BUG]` |
| F3 上传 500 | ✅ `upload-buffer-probe.mjs` | — | — |
| F4 补偿泄漏 | — | — | （建议补充计费状态测试） |
| F5 adjustCredits 校验 | ✅ `validation.test.mjs`（schema 本身） | — | — |
| F6 并发注册 500 | — | ✅ 重复注册→400 用例 | — |
| F7 余额文案耦合 | — | — | （建议补类型化错误测试） |
| 限流/分页/认证守卫 | ✅ `rate-limit.test.mjs` | ✅ 登录限流/守卫 | ✅ 守卫/限流 |

**如何运行**：见 `tests/README.md`。Tier1 立即可跑（已全绿，19 项断言）；Tier2/3 需在起好 Postgres+Redis 的服务上运行，其中标 `[KNOWN-BUG]` 的项会如实暴露上述缺陷，修复后应转为通过。

---

## 7. 修复优先级建议

1. **P0 立即修**：F1（条件更新 + DB CHECK 约束）、F2（归属校验补齐）、F3（memoryStorage）。
2. **P1 本迭代修**：F4（计费入事务）、F5（挂 schema）、F6（P2002→400）、F7（类型化错误）。
3. **P2 排期**：F8–F14 按需纳入工程化 backlog。

> 注：本审计在"无运行数据库"的沙箱中完成；F1/F3 已通过可执行脚本**确定性复现**，其余为代码走查确认。集成层 `[KNOWN-BUG]` 用例可在起服务后直接复现其余项。

---

## 8. 修复实施记录（2026-07-13）

用户要求将 P0/P1/P2 全部修复。以下改动均已落地，并通过 `tsc --noEmit` 类型检查与 `tests/unit/run.sh`（20 项断言全绿）。

### 已修复清单

| 编号 | 修复内容 | 改动文件 |
|---|---|---|
| **F1** | `freeze/consume/refund` 改用**条件 `updateMany`（`where: {balance\|frozenBalance >= amount}`）**，单条原子语句自带行锁，彻底消除读-改-写 TOCTOU；原 `freeze` 测试复现脚本中的"负余额"路径在修复后逻辑下不再可能。新增数据库层兜底约束 `prisma/checks.sql`（`CHECK (balance>=0)` 与 `CHECK (frozen_balance>=0)`，幂等、可直连执行）。 | `services/credit.service.ts`、`prisma/checks.sql` |
| **F2** | `getAssets/saveVersion/exportProject` 增加 `userId` 形参并调用 `assertOwner` 校验归属；路由 `GET /:id/assets`、`POST /:id/versions`、`POST /:id/export` 传入 `req.user!.id`；`POST /api/image-jobs` 在 `projectId` 存在时校验其归属（防写 IDOR）。 | `services/project.service.ts`、`routes/projects.ts`、`routes/image-jobs.ts` |
| **F3** | `multer` 由 `dest`（diskStorage，不填充 `buffer`）改为 `memoryStorage()`；`uploadAsset` 内对 `file.buffer` 空值与大小（≤20MB）做二次校验。`upload-buffer-probe.mjs` 已复现旧配置必 500、新配置正常。 | `routes/projects.ts`、`services/project.service.ts` |
| **F4** | Worker 成功路径**先同步 `creditService.consume` 再标记 `succeeded`**（不再先标记成功再异步扣减，消除白嫖窗口）；失败路径**先同步 `creditService.refund`**，仅在同步失败时退回补偿队列。两个 Worker（生图 / 合成）均改造。 | `workers/image.worker.ts` |
| **F5** | `POST /admin/users/:id/credits/adjust` 挂载 `adjustCreditsSchema`（整数 + reason 必填 ≤200）；`adminService.adjustCredits` 改用条件 `updateMany` 原子调账，扣减时要求 `balance>=-amount`，抛 `InsufficientBalanceError`。 | `routes/admin.ts`、`services/admin.service.ts` |
| **F6** | 注册接口捕获 `Prisma.PrismaClientKnownRequestError` 且 `code==='P2002'` → 400「该手机号或邮箱已被注册」，不再 500。 | `routes/auth.ts` |
| **F7** | 新增 `InsufficientBalanceError extends AppError(400)`；`credit.service` 抛该类型；`ai.ts` 与 `image-jobs.ts` 的冻结失败分支改为 `return next(err)`（由全局错误处理按类型返回 400），与中文文案彻底解耦。 | `utils/errors.ts`、`routes/ai.ts`、`routes/image-jobs.ts`、`services/credit.service.ts` |
| **F8** | 限流器下发 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`，超限额外下发 `Retry-After`。（`[KNOWN-BUG]` 关联用例在 `tests/unit/rate-limit.test.mjs` 已加断言。）多副本共享计数仍需网关/Redis 层，已注释说明。 | `middleware/rate-limit.ts` |
| **F9** | `/api/ai/prompt` 的 `JSON.stringify(brief)` 包 `try/catch`，循环引用等返回 400 而非 500。 | `routes/ai.ts` |
| **F10** | `project.update` 对 `status` 做枚举校验（`draft/generating/editing/completed/exported`），非法值 400。 | `services/project.service.ts` |
| **F11** | `saveVersion` 对 `canvasJson` 序列化长度做 ≤1MB 限制（含 `JSON.stringify` 异常保护），防 JSON DoS。 | `services/project.service.ts` |
| **F12** | 登出时除 refresh jti 外，额外把 **access token jti** 拉黑（鉴权中间件已校验 access jti 黑名单），关闭"登出后 access token 仍可用至过期"的窗口。 | `routes/auth.ts` |
| **F13** | CORS `credentials` 维持布尔 `true`（受 `cors` 类型约束不能为函数）；在注释中固化该权衡说明——无 Origin 请求由 cors 反射为 `*`，非浏览器客户端不受 CORS 限制，属可接受范围；建议后续在网关层收敛。 | `app.ts` |
| **F14** | `/api/ai/brief` 的 `constraints` 做序列化长度限制（≤`MAX_AI_TEXT_LENGTH`），含 `JSON.stringify` 异常保护。 | `routes/ai.ts` |

### 验证状态
- `apps/server` `tsc --noEmit`：通过（0 错误）。
- `tests/unit/run.sh`：4 个套件、20 项断言全绿（含 `credit-concurrency`、`validation`、`rate-limit` 头断言、`upload-buffer-probe`）。
- 需起 Postgres+Redis 后运行的 `tests/api/robustness.sh` 与 `tests/integration/robustness.spec.ts`：原标 `[KNOWN-BUG]` 的 IDOR / 余额文案耦合等项，修复后预期转为通过（F1/F2/F3/F7 等），建议起服务后复跑核对。

### 仍建议跟进（非阻断）
- 限流器跨副本共享（Redis 计数或网关层）。
- 资金补偿队列增加 `generation_jobs.billing_status` 字段以防重复/遗漏计费（F4 的纵深防御）。
- `prisma/checks.sql` 需在目标数据库执行一次（CI 或首次部署脚本）。
