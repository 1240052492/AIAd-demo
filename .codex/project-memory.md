# guanggaohangye 项目记忆

更新时间：2026-07-16

## 项目定位

本项目是广告行业 AI 设计生产与交付系统的实现仓库，目标不是通用 AI 绘画站，而是面向广告公司、门头制作商、品牌设计工作室、喷绘标识工厂的行业交付工具。

核心闭环是：客户需求 -> AI brief -> 设计方案 -> 环境图合成 -> 在线编辑 -> 客户效果图/施工参考图/矢量文件导出 -> 积分扣费 -> 项目留存。

第一阶段优先做门头招牌效果图闭环，后续再扩展文化墙、灯箱、喷绘、菜单海报、品牌 VI、导视系统等品类。

## 当前仓库状态

- 已拉取最新 GitHub 代码。
- 当前远端：`origin/main`。
- 本次拉取提交：`06c8836`。
- 当前仓库仍保留未跟踪内容 `docs/benchmark/`，未修改。

## 主要资产

- `docs/广告行业AI系统开发方案.md`
- `prototype原型/advertising-ai-ui-prototype.html`
- `prototype原型/assets/storefront-reference.png`
- `output/*.png`
- `prompt模版库数据/`
- `doubao-canvas-similar-projects.md`

## 记忆执行规则

- 每次开始本项目任务前，先读本文件。
- 每次完成本项目任务后，必须追加任务记录。
- 记录内容包括：日期时间、用户目标、实际修改、涉及文件、验证方式、遗留风险或下一步。
- 只做调研、拉取、排查或验证时，也要记录结论。
- 不要写入真实 API key、token、密码、完整敏感 URL 或未脱敏截图内容。
- 除非用户明确同意，不要为了理解项目而整仓读取；优先读 `HANDOVER.md`、`.workbuddy/memory/MEMORY.md` 和当前任务直接相关文件，必须全仓扫描时先确认。

## 任务记录

### 2026-07-17  切回 master 分支

- 用户目标：切回 `master`。
- 实际修改：在 `D:\guanggaohangye` 上从当前 `main` 基线新建并切换到本地 `master` 分支，保留现有未提交改动。
- 涉及文件：无业务文件改动；仅 Git 分支状态变化。
- 验证方式：`git rev-parse --abbrev-ref HEAD` 返回 `master`，`git branch -vv` 显示当前分支为 `master`。
- 遗留风险或下一步：本地仍有未提交改动与未跟踪文件；若后续要和远端保持一致，需先确认 `master` 是否要与 `origin/main` 持续绑定。

### 2026-07-17  切换并创建 dev 分支

- 用户目标：把当前代码切到 `dev` 分支。
- 实际修改：在 `D:\guanggaohangye` 上基于当前 `main` 的 `06c8836` 新建本地 `dev` 分支，保留现有未提交改动，不做强制覆盖。
- 涉及文件：无业务文件改动；仅 Git 分支状态变化。
- 验证方式：`git status --short --branch` 显示 `## dev`，`git branch -vv` 显示 `dev` 指向 `06c8836`。
- 遗留风险或下一步：本地工作区仍有未提交修改与未跟踪文件，后续若要与 `origin/dev` 对齐，需要先确认是保留当前改动还是切换到远端分支。

### 2026-07-16  Figma 重绘系统风格准备

- 用户目标：使用 `figma-use`、`figma-generate-design`、`figma-generate-library` 重绘整个系统风格。
- 实际修改：未修改业务代码；加载并遵循三个 Figma skill，读取 `HANDOVER.md` 和 `.workbuddy/memory/MEMORY.md` 作为项目摘要，未整仓扫描。
- 涉及文件：`.codex/project-memory.md`。
- 验证方式：通过工具发现确认当前会话未暴露 `use_figma`、`create_new_file`、`generate_figma_design`、`search_design_system` 等 Figma MCP 工具。
- 遗留风险或下一步：需要用户提供可用 Figma 文件 URL/fileKey，或在会话中启用 Figma MCP 工具；否则只能输出重绘规范和开发实施方案，不能直接写入 Figma。

### 2026-07-16  拉取 GitHub 最新代码

- 用户目标：获取 `D:\guanggaohangye` 路径的 GitHub 最新代码。
- 实际修改：对 `D:\guanggaohangye` 执行 `git pull --ff-only`，将 `main` 从 `3840933` 快进到 `06c8836`；同时在仓库内新增本地记忆文件和项目规则文件。
- 涉及文件：`D:\guanggaohangye\AGENTS.md`、`D:\guanggaohangye\.codex\project-memory.md`。
- 验证方式：检查 `git remote -v`、`git branch -vv`、`git status --short --branch`，并确认拉取结果为 fast-forward。
- 遗留风险或下一步：仓库仍有未跟踪的 `docs/benchmark/` 目录，未处理；后续任务前继续先读 `.codex/project-memory.md`。
### 2026-07-16 21:43  首页生图不自动切 mock
- 用户目标：修复首页生成图片时 key 失效的处理，不允许自动走 mock 回退。
- 实际修改：移除首页能力探测后自动切换到 mock 的逻辑，新增 `shouldAutoSelectMockMode` 纯函数并用回归测试锁定“能力不足时不自动切 mock”。
- 涉及文件：`D:\guanggaohangye\apps\web\src\pages\Home\index.tsx`，`D:\guanggaohangye\apps\web\src\pages\Home\run-mode.ts`，`D:\guanggaohangye\apps\web\tests\home-run-mode.test.ts`。
- 验证方式：`tsx tests/home-run-mode.test.ts` 通过；`corepack pnpm --dir D:\guanggaohangye --filter web build` 通过；`corepack pnpm exec tsc -p tsconfig.json --noEmit` 在 `apps/web` 目录通过。
- 遗留风险或下一步：手动切换到 mock 的入口仍然保留；如果要彻底禁用 mock，需要再收紧按钮状态与后端能力判断。

### 2026-07-16  登录刷新丢失修复

- 用户目标：解决账号登录后点击浏览器刷新，登录信息丢失的问题。
- 实际修改：将开发环境 `VITE_API_BASE_URL` 从跨站 `http://127.0.0.1:4177/api` 改为同源 `/api`，让 Vite 代理转发认证请求；新增配置回归测试。
- 涉及文件：`.env`、`.env.example`、`apps/web/tests/auth-session-config.test.mjs`。
- 验证方式：配置测试先按 TDD 验证失败，再修改配置后通过；`apps/web/tsconfig.json` 类型检查通过；重启 Vite 后使用本地测试账号登录，刷新 `http://localhost:5173/admin/overview` 仍保持在管理后台。
- 遗留风险或下一步：`.env` 为本地忽略文件，部署其他环境时需使用同源前端代理或确保前后端使用同一站点；当前工作区原有的 `apps/web/src/pages/Home/index.tsx` 等未提交改动未被修改。
### 2026-07-16  生成方案缺少 choices 修复

- 用户目标：点击“生成方案”时修复截图中的“AI 文本 Provider 返回格式异常：缺少可用 choices”错误。
- 实际修改：将 `.env` 与 `.env.example` 的 `ANTHROPIC_BASE_URL` 补为 OpenAI-compatible `/v1` 入口；在 `anthropic.service.ts` 增加 `normalizeOpenAICompatibleBaseUrl()`，即使配置漏写 `/v1` 也自动补齐；新增 Provider 配置与 URL 规范化回归测试。
- 涉及文件：`.env`、`.env.example`、`apps/server/src/services/ai/anthropic.service.ts`、`apps/server/tests/unit/text-provider-config.test.mjs`、`apps/server/tests/unit/text-provider-base-url.test.mjs`。
- 验证方式：修复前真实请求 `https://apic.aksearch.site/chat/completions` 返回 `200 text/html` 网关前端页面且无 `choices`；修复后 `/v1/chat/completions` 返回 `200 application/json`，包含 `choices`；浏览器真实点击“生成方案”后 Brief 与英文生图描述成功生成；后端类型检查、配置测试、URL 规范化测试和服务重启健康检查通过。
- 遗留风险或下一步：同一次真实点击在进入图片生成阶段后收到 `401 INVALID_API_KEY`，说明当前图片 Provider 使用的 Key 无生图权限或已失效；这与本次缺少 `choices` 的文本端点配置问题独立，需在 Provider 网关侧换用有效且开通图片权限的 Key。排查过程中不要把真实 Key 写入项目记忆，若相关 Key 已出现在外部日志或共享记录中，应尽快轮换。
### 2026-07-16  生图调用模式确认

- 用户目标：确认当前生图模型是否使用 OpenAI 协议，以及是否采用上游轮询。
- 实际修改：未修改文件；核对 `.env`、`openai-image.service.ts`、`image-jobs.ts` 和前端生成状态轮询代码。
- 涉及文件：未修改文件。
- 验证方式：当前 `.env` 为 `OPENAI_IMAGE_MODE=sync`；代码显示同步请求 `POST /images/generations`，使用 `Authorization: Bearer` 和 `response_format=b64_json`；同步结果写 Redis 后由 `sync-` 任务 ID 返回；前端每 1600ms 查询本地 `/api/image-jobs/:id`。
- 关键结论：当前是 OpenAI-compatible 协议，但上游采用同步返回，不轮询上游 OpenAI；系统自身仍轮询本地任务状态。只有显式设置 `OPENAI_IMAGE_MODE=async` 时，才会使用上游 `background` 或网关 `/async` 任务 ID，并通过 GET 接口轮询。
- 遗留风险或下一步：当前图片 Provider Key 仍返回 `401 INVALID_API_KEY`，与调用模式无关；更换有效且有生图权限的 Key 后再验证完整出图。
### 2026-07-16  重新测试 async 生图配置

- 用户目标：测试用户修改后的生图配置是否可用，并确认是否需要重新加载 `.env`。
- 实际修改：未修改文件；确认 `.env` 当前为 `OPENAI_IMAGE_MODE=async`，并重启了当前项目的 server 与 image worker，使新环境变量生效。
- 涉及文件：未修改文件；仅运行服务重启和真实浏览器测试。
- 验证方式：后端读取到 `mode=async`；浏览器点击“生成方案”后 Brief 与 imagePrompt 成功，随后生图提交在 60 秒后失败为 `提交生图任务 超时（60000ms）`；直接探测 Provider：官方 async 请求返回 `400 invalid_value`（网关将 background 解析为不支持的布尔值），网关 `/images/generations/async` 返回 `404`。
- 结论：需要重新加载 `.env`，后端和 Worker 必须重启；本次已完成重启。当前 Provider 不支持项目使用的 async/background 协议，不能判定为生图成功；建议使用 `OPENAI_IMAGE_MODE=sync`，再重启 server/worker 后复测。
- 遗留风险或下一步：未擅自覆盖用户刚修改的 async 配置；若切回 sync 后仍失败，再单独检查图片 Key 权限与同步接口响应。
### 2026-07-16  生图长时提交超时修复

- 用户目标：当前网关不支持 async 协议，但实测单张图需要 3–4 分钟，要求解决超时导致的生图失败。
- 实际修改：新增 `OPENAI_IMAGE_SUBMIT_TIMEOUT_MS=600000`；配置对象增加 `openaiImageSubmitTimeoutMs`；Worker 将提交生图任务的硬编码 60 秒改为读取该配置；同步更新 `.env.example` 与 `.env.production.example`；新增超时配置回归测试。
- 涉及文件：`.env`、`.env.example`、`.env.production.example`、`apps/server/src/config/index.ts`、`apps/server/src/workers/image.worker.ts`、`apps/server/tests/unit/image-submit-timeout.test.mjs`。
- 验证方式：配置测试、后端 TypeScript 检查、`git diff --check` 通过；重启 server 与 image worker；在 `OPENAI_IMAGE_MODE=async` 下真实点击“生成方案”，Brief 成功、图片完成、矢量稿导出，耗时约 4 分钟。
- 关键结论：网关仍不支持 `background/async`，代码会回退到同步生图；10 分钟提交超时使 3–4 分钟的同步回退可以完成。前端本地轮询上限约 12 分钟，当前足够覆盖该流程。
- 遗留风险或下一步：如果网关未来提供真正的异步任务接口，可再优化为直接使用任务 ID；当前不需要把模式切回 `sync`，但 server/worker 修改 `.env` 后必须重启。