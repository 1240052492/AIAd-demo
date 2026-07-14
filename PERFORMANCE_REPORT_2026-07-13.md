# AdCraft AI (神笔) 性能分析报告

**测试对象**：`D:\guanggaohangye`（monorepo：React+Vite 前端 / Express + Prisma + PostgreSQL + Redis + BullMQ 后端）
**测试方式**：真实搭建全栈（Docker Postgres:16 + Redis:7，原生启动 API + Worker），注入规模化测试数据，使用 Node 原生 `fetch` 编写的阶段性负载发生器进行实测。
**测试日期**：2026-07-13
**测试人员**：Performance Benchmarker

> ⚠️ **方法论诚实声明**：负载发生器（load generator）与 API 服务、PostgreSQL 运行在**同一台机器**上。因此在 200 VU 高压下，部分延迟升高来自“测试客户端与系统争抢同一机器 CPU”，而非纯系统行为。本文中 **50 VU 基线被视为可信的正常生产流量画像**，200 VU 仅作为“容量上限探索”，并明确标注共置（co-location）干扰。

---

## 📊 性能测试结果

### 测试数据规模（实测注入）
- `Project`：**100,002** 行（perf 测试用户独占 ~60,000）
- `CreditTransaction`：**50,002** 行（perf 用户独占 50,000）
- `Asset`：**3,000** 行（其中 3,000 个挂在同一个 perf 项目下，用于复现“无分页 assets 加载”反模式）

### 负载测试 / Load Testing（50 VU，60s，正常流量画像）

| 端点 | 请求数 | 错误率 | avg | p95 | p99 | max |
|---|---|---|---|---|---|---|
| GET /api/health | 1300 | 0% | 12.4ms | 45ms | 72ms | 102ms |
| GET /api/credits/balance | 1903 | 0% | 13.6ms | 46ms | 75ms | 104ms |
| GET /api/projects/:id (detail) | 1301 | 0% | 18.0ms | 55ms | 87ms | 113ms |
| GET /api/templates | 1263 | 0% | 19.9ms | 67ms | 93ms | 150ms |
| GET /api/credits/transactions | 2647 | 0% | 34.0ms | 84ms | 115ms | 185ms |
| GET /api/projects (list) | 3250 | 0% | 40.9ms | 92ms | 126ms | 190ms |
| **GET /api/projects/:id/assets** | 656 | 0% | **120.9ms** | **202ms** | 257ms | 283ms |

**结论**：在 50 VU 正常负载下，除 `assets` 端点外，各端点 p95 均 < 100ms，符合常规 API 延迟预算。唯一显著超标的是 `assets` 端点（p95 202ms）。

### 压力测试 / Stress Testing（200 VU，40s）

| 端点 | pool=10 avg / p95 | pool=50 avg / p95 |
|---|---|---|
| GET /api/health | 243.8 / 406ms | 291.6 / 468ms |
| GET /api/credits/balance | 244.5 / 409ms | 306.4 / 494ms |
| GET /api/projects/:id (detail) | 246.7 / 403ms | 315.6 / 503ms |
| GET /api/templates | 337.3 / 546ms | 413.8 / 644ms |
| GET /api/credits/transactions | 407.9 / 635ms | 501.4 / 738ms |
| GET /api/projects (list) | 417.0 / 642ms | 507.1 / 746ms |
| GET /api/projects/:id/assets | 686.0 / 973ms | 892.1 / 1204ms |

**关键发现（A/B 验证）**：将 Prisma 连接池从 `connection_limit=10` 提升到 `50` 后，200 VU 延迟**不降反升**（projects list p95 642ms→746ms，assets p95 973ms→1204ms）。这**证伪**了“应用层连接池=10 是瓶颈”的假设。

→ 真正的约束是**单节点 PostgreSQL 的处理能力** + **测试共置带来的 CPU 争抢**，而非应用连接池过小。因此**不应**通过盲目调大 `connection_limit` 来“修复”——那只会让 Postgres 连接风暴更严重。

### 可扩展性评估 / Scalability
- 单节点 Postgres + 共置测试，无法在本环境干净地演示“10× 当前负载无显著退化”的目标。
- 正确扩展路径是**数据库层扩展**（PgBouncer 连接池代理 / 只读副本 / 更大规格实例），而非在应用层堆连接。

### 耐久测试 / Endurance
- 本轮未执行长时耐久测试（共置单节点会污染长时信号）。已定位的耐久风险见下方瓶颈分析（内存型限流器、Worker 并发=1）。

---

## ⚡ Core Web Vitals 相关分析

本项目实测为**后端 API**，CWV 属于前端范畴，故不直接测量 LCP/FID/CLS。但 API 延迟直接影响前端 TTFB（LCP 的组成部分）：

- **TTFB 预算（等价于 API p95）**：正常负载下热点路径 p95 在 45–92ms，对 LCP < 2.5s 友好；
- **LCP 风险点**：`/api/projects/:id/assets` 在正常负载 p95 即达 **202ms**，且单次返回可能包含数千条素材（无分页），会显著拖慢首屏素材渲染；
- **建议**：前端对 assets 列表做分页/虚拟滚动，并配合后端分页（见瓶颈分析）。

---

## 🔍 瓶颈分析

### 数据库性能（已用 EXPLAIN ANALYZE 证实）
1. **缺失复合索引 `(userId, createdAt DESC)`** —— 热点路径 `projects` 列表与 `credit_transactions` 流水均为 `WHERE userId ORDER BY createdAt DESC LIMIT 20`。
   - 实测执行计划（perf 用户拥有 ~60k 行）：
     - projects-list：全表扫描 9.8ms（仍要排序 60k 行）→ 加复合索引后 **0.05ms**，cost 4429→1.94，**排序节点被完全消除**。
     - credit-txns：7.3ms → **0.06ms**。
   - ⚠️ 我最初尝试的**单列 `userId` 索引被证明无效**——因为瓶颈在 `ORDER BY` 排序而非过滤；单列索引下 Postgres 仍需对全部行排序（甚至比顺序扫描更慢）。正确做法是复合索引。
   - API 层实测（30 VU）：因连接池争用掩盖了大部分收益，projects 列表 avg 24.4ms→18.9ms（ modest）；但**数据库原始执行层面的 ~190× 提升是确凿的**，需配合连接池/DB 扩展才能完全兑现。
2. **`assets` 端点无分页（确凿代码反模式）**：
   - `project.service.ts:140-141` `getAssets`：`asset.findMany({ where: { projectId } })` —— **无 `take`/分页**，加载项目下全部素材。
   - `project.service.ts:69-71` `getProjectDetail`：`findUnique` 中 `include: { assets: {...} }` —— 同样无上限。
   - 根因：拥有 3,000 素材的项目直接把 `assets` 端点从基线 120ms 推到压力 686ms。

### 应用层
- **BullMQ Worker 并发=1（未实测，异步风险）**：图片生成是异步任务，并发=1 在批量生图时会形成队列积压。
- **内存型限流器（横向扩展风险）**：限流状态存于单进程内存，多实例部署时各实例独立计数，无法全局限流。
- **`morgan('dev')` 全模式日志**：生产环境仍输出逐请求日志，带来恒定开销（不影响 before/after 对比，但应关闭）。
- **bcrypt 成本因子**：登录为 CPU 密集同步操作，高并发登录时会占用事件循环（本轮未单独压测登录峰值）。

### 基础设施
- 单节点 Postgres / Redis（Docker），无只读副本、无 PgBouncer、无连接池代理。
- 负载发生器与系统共置，高压下 CPU 争抢污染绝对数值。

### 第三方服务
- **AI 网关（外部依赖）**：`/ai/brief`、`/ai/prompt`、`image-jobs` 等依赖外部 AI 网关，延迟不可控、波动性大，本轮未压测（仅作为依赖特征标注）。

### 额外发现：Schema 迁移漂移（部署风险）
- 已提交迁移 `20260101000000_init` 与当前 `schema.prisma` **不一致**：`SystemSetting` 的 `updatedAt` 字段已加入 schema 但迁移 SQL 未重新生成。直接用 `migrate deploy` 会得到缺字段的库。本轮用 `db push` 强制对齐才得以继续。**这是真实的生产部署隐患，应修复。**

---

## 💰 性能 ROI 分析

| 优化项 | 实施成本 | 收益 | 业务影响 |
|---|---|---|---|
| 复合索引 `(userId, createdAt)` | ~5 分钟（一次迁移） | 热点查询原始执行 ~190× 提速，消除排序 | 列表/流水加载更跟手 |
| assets 端点分页 | 低（~半天） | 120ms→<20ms，消除最差端点 | 首屏素材渲染提速，LCP 改善 |
| 修复 Schema 迁移漂移 | 低（重新生成迁移） | 消除部署失败风险 | 避免生产发布事故 |
| BullMQ 并发调优 + PgBouncer | 中 | 支撑更高并发与横向扩展 | 为增长预留容量 |
| 限流器改 Redis 存储 | 中 | 支持多实例水平扩展 | 部署架构解耦 |

---

## 🎯 优化建议

### 高优先级（立即见效）
1. **加复合索引**：在 `projects(userId, createdAt DESC)` 与 `credit_transactions(userId, createdAt DESC)` 上加索引（通过正式 Prisma 迁移，勿用 `db push`）。
2. **assets 端点分页**：`getAssets` 与 `getProjectDetail` 的 assets `include` 增加 `take`/`skip`（或改为独立分页接口）。
3. **修复 Schema 迁移漂移**：重新生成 `SystemSetting.updatedAt` 的迁移，保证 `migrate deploy` 可复现。

### 中优先级（适度投入）
4. **BullMQ Worker 并发**：将 `image.worker` 并发从 1 提升至与 CPU/外部 API 配额匹配的值，并配置 `attempts`/`backoff`（当前缺失重试）。
5. **限流器改 Redis 存储**：支持多实例全局限流。
6. **生产关闭 `morgan('dev')`**：用结构化日志替代。
7. **显式设置连接池**：保持 `connection_limit` 在 10–20 区间（已证伪“调大即可”），不要盲目加。

### 长期（战略扩展）
8. **数据库层扩展**：引入 PgBouncer（事务级池化）+ 只读副本，支撑 10× 增长。
9. **API 水平扩展**：配合 Redis 限流 + 无状态化，实现多实例。
10. **图片生成异步扩容**：Worker 独立伸缩组，按队列深度自动扩缩。
11. **接入 RUM + 合成监控**：建立 p95 延迟告警、慢查询日志、连接池等待指标。

### 监控建议
- 对 `projects list` / `credit transactions` / `assets` 三个热点设 p95 > 200ms 告警。
- 开启 Postgres `log_min_duration_statement`（如 50ms）捕获回归。
- 暴露 Prisma 连接池等待时长，作为容量预警先行指标。

---

## ✅ 结论

**性能状态（SLA）**：在正常 50 VU 负载下，**多数端点 p95 < 100ms，达到可接受延迟预算**；唯一例外是 `assets` 端点（p95 202ms，应修复）。在 200 VU 压力下，**所有端点 p95 > 400ms，未达高并发 SLA**，但根因是单节点 Postgres 容量 + 测试共置，而非单一应用 bug。

**可扩展性评估**：**NEEDS WORK**。当前架构无法在单节点上演示 10× 容量余量；须先完成数据库层扩展（PgBouncer / 只读副本）再谈 API 横向扩展。

**最值得立即做的三件事**：① 加复合索引（5 分钟，~190× 查询提速）；② assets 端点分页（消除 120ms 最差端点）；③ 修复 Schema 迁移漂移（避免生产部署事故）。

---
**Performance Benchmarker**
**分析日期**：2026-07-13
**性能状态**：正常负载 MEETS 预算 / 高压 FAILS SLA（根因为单节点容量）
**可扩展性评估**：NEEDS WORK（需先完成数据库层扩展）
