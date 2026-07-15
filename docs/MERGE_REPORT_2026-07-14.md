# AdCraft AI（神笔）业务梳理与合并报告

- **报告日期**：2026-07-14（合并审查执行于 2026-07-15）
- **审查范围**：本轮工作区改动（提示词库 / 工作流库 / 个人中心 / 去 Mock 四大块）
- **审查性质**：只读合并审查 —— 不写业务代码、不 commit、不 push、未启动 dev server、未运行生图
- **审查 Agent**：合并/梳理 Agent

---

## 一、本轮完成功能清单

### 1. 提示词库（`/prompts`）
- 新增页面 `apps/web/src/pages/Prompts/index.tsx`：消费 `public/prompts/data.json`，卡片网格展示，支持**标题/标签/正文搜索**、按 `sourceLabel` **筛选**、**复制提示词**、**「使用此提示词」**一键回填首页。
- 新增静态数据 `apps/web/public/prompts/data.json`（50 条，字段含 index/title/sourceLabel/visibleText/image/imageUrl/width/height/promptText）+ `apps/web/public/prompts/images/`（50 张图，由桌面素材拷贝）。
- 新增解耦桥 `apps/web/src/stores/promptSeed.ts`：`setSeedPrompt` / `clearSeedPrompt` / `seedPrompt`，提示词库写入、首页读取，页面间无强耦合。
- 首页 `apps/web/src/pages/Home/index.tsx` 新增 `useEffect`：挂载/更新时读取 `seedPrompt` 填入客户需求输入框并清空。

### 2. 工作流库（`/workflows`）
- 新增页面 `apps/web/src/pages/Workflows/index.tsx`：6 步工作流引擎可视化（tsc 校验通过，默认导出 `WorkflowLibrary` 已被 `App.tsx` 正确引用）。

### 3. 个人中心（`/account`）
- 新增页面 `apps/web/src/pages/Account/index.tsx`：受 `Protected` 保护，复用 Membership 既有组件 `Profile` / `PointsDetail` / `MembershipModal`（账户信息、积分总览、会员中心、账户设置、退出登录）。
- 复用方式经 tsc 验证与 `MainLayout` 既有用法一致（`compact` 入参、`open`/`onClose` 入参匹配）。

### 4. 去 Mock（生产护栏）
- 后端 `apps/server/src/routes/ai.ts`：`/brief`、`/prompt` 两处 mock 分支增加 `process.env.ALLOW_MOCK === 'true'` 生产护栏。
- 后端 `apps/server/src/routes/image-jobs.ts`：`/image-jobs` 的 mock 短路增加 `allowMock` 护栏（不设置该环境变量时即使请求体带 `mock:true` 也走真实生图）。
- 前端 `apps/web/src/pages/Home/index.tsx`：默认 `runMode='live'`（`mock: runMode === 'mock'`，默认即 false）。
- 前端 `apps/web/src/pages/Editor/index.tsx`：「重新生成」`mock: false`。
- 前端 `apps/web/src/services/editor.api.ts`：`regenerate` 默认 `mock=false`。

### 5. 脚手架/导航（主代理）
- `apps/web/src/App.tsx`：新增 `/prompts`、`/workflows`、`/account`（置 `Protected`）路由与 import。
- `apps/web/src/components/layout/MainLayout.tsx`：`TOP_NAV` 改为五项（首页生成/模板库/提示词库/工作流库/个人中心），**保留并移除原「案例库」**；`RAIL_NAV` 未改动。

---

## 二、改动文件清单（来自 `git status` + `git diff --stat`）

### 已修改（tracked，7 个文件，+33 / -8）

| 文件 | 改动 | 归属 |
|---|---|---|
| `apps/server/src/routes/ai.ts` | +6/-2 mock 护栏 ×2 | Agent A（去 Mock） |
| `apps/server/src/routes/image-jobs.ts` | +5/-1 mock 护栏 | Agent A（去 Mock） |
| `apps/web/src/App.tsx` | +6 新增路由/import | 主代理脚手架 |
| `apps/web/src/components/layout/MainLayout.tsx` | +3/-1 TOP_NAV 五项 | 主代理脚手架 |
| `apps/web/src/pages/Editor/index.tsx` | -1 `mock:false` | Agent A（去 Mock） |
| `apps/web/src/pages/Home/index.tsx` | +17/-2 runMode='live' + seedPrompt effect | 主代理 + Agent A（共享文件） |
| `apps/web/src/services/editor.api.ts` | -1 mock=false | Agent A（去 Mock） |

### 新增（untracked，叶子文件/资源）

| 路径 | 归属 |
|---|---|
| `apps/web/public/prompts/data.json` | 主代理准备 |
| `apps/web/public/prompts/images/`（50 张图） | 主代理准备 |
| `apps/web/src/stores/promptSeed.ts` | 主代理准备 |
| `apps/web/src/pages/Account/` | 用户端 Agent |
| `apps/web/src/pages/Prompts/` | 用户端 Agent |
| `apps/web/src/pages/Workflows/` | 用户端 Agent |

### ⚠️ 非预期 / 越界文件（见第四节）

| 路径 | 说明 |
|---|---|
| `apps/server/tmp_topup.ts` | Agent A 遗留的一次性充值脚本，**禁止提交** |
| `docs/IMA 知识库检索优化/` | `git status` 列为 untracked，但磁盘实际目录为 `docs/IMA测试知识库导入版/`；非本轮范围，归属待确认 |

> **越界约定核对结论**：本轮基本遵守「每个 Agent 只改自有叶子文件」约定。唯一共享文件为 `apps/web/src/pages/Home/index.tsx`（主代理加 seedPrompt effect、Agent A 改 runMode='live'），该文件在任务说明中已被明确列为双方共同改动点，且 git diff 显示两处改动共存、tsc 通过，**未构成冲突或越界**。其余三页（Prompts/Workflows/Account）均为各自新增独立目录，符合约定。

---

## 三、类型 / 一致性检查结果

### 3.1 TypeScript 类型检查 ✅ 通过

| 模块 | 命令 | 结果 |
|---|---|---|
| `apps/web` | `../../node_modules/.bin/tsc --noEmit` | **0 errors**（EXIT=0） |
| `apps/server` | `../../node_modules/.bin/tsc --noEmit` | **0 errors**（EXIT=0） |

> 依赖均已安装（web / server / root `node_modules` 均存在），无需 `pnpm install`。`Account` 复用的 `Profile`/`PointsDetail`/`MembershipModal` 的 export 与 `compact` / `open` / `onClose` 等 prop 类型均经 tsc 验证通过。

### 3.2 路由与导航一致性 ✅ 通过

- `App.tsx:77-79`：`/prompts`、`/workflows`、`/account` 路由均存在，`/account` 由 `<Protected>` 包裹。
- `MainLayout.tsx:24-30`：`TOP_NAV` 为五项（首页生成 / 模板库 / 提示词库 / 工作流库 / 个人中心），与任务要求一致。
- `MainLayout.tsx:33-39`：`RAIL_NAV` 保持 **首页 / 项目 / 画布 / 导出 / 客服** 不变（diff 仅触及 TOP_NAV，未触碰 RAIL_NAV）。
- 注意：原「案例库 `/cases`」已从 TOP_NAV 移除（原 nav 项被「提示词库」替代）；当前 `App.tsx` 本就无 `/cases` 路由，移除 nav 项不影响可达性，仅意味着案例库入口下线（属预期调整）。

### 3.3 类型一致性 ✅ 通过

- **Prompts 本地 interface ↔ data.json**：`Prompts/index.tsx:9-25` 的 `PromptItem`（index/title/sourceLabel/visibleText/image/imageUrl/width/height/promptText）与 `public/prompts/data.json` 实际字段**逐项一致**（9 字段全部匹配）。
- **promptSeed store ↔ 用法**：`promptSeed.ts` 导出 `seedPrompt` / `setSeedPrompt` / `clearSeedPrompt`；`Home`（`Home/index.tsx:159-166`）使用 `seedPrompt` + `clearSeedPrompt`，`Prompts`（`Prompts/index.tsx:35`）用 `setSeedPrompt` 经 `getState()` 写入 —— **三者语义一致**。
- **Account 复用 Membership**：`Account/index.tsx:7-9` 复用 `Profile` / `PointsDetail` / `MembershipModal`，入参 `<Profile compact />`、`<PointsDetail compact />`、`<MembershipModal open onClose>` 与 `MainLayout` 既有用法相同，tsc 已验证类型匹配。

### 3.4 去 Mock 闭环 ✅ 通过

- **前端默认不再发 `mock:true`**：
  - `Home/index.tsx:148` 默认 `runMode='live'` → `Home/index.tsx:250,264` `mock: runMode === 'mock'`（默认 false）。
  - `Editor/index.tsx:103` `mock: false`。
  - `editor.api.ts:53` `mock = false` 默认。
  - 全局 grep：`apps/web/src` 下仅 `editor.api.ts:48` 一处 `mock:true` 为**注释**，无代码默认 `mock:true`。
- **后端默认禁 mock（不设置 `ALLOW_MOCK` 时 mock 分支不可达）**：
  - `ai.ts:75` `/brief`：`if (req.body?.mock === true && process.env.ALLOW_MOCK === 'true')`
  - `ai.ts:163` `/prompt`：同上护栏
  - `image-jobs.ts:122`：`const mock = req.body?.mock === true && allowMock`，`allowMock = process.env.ALLOW_MOCK === 'true'`
  - 结论：即便前端误带 `mock:true`，后端在生产（未设 `ALLOW_MOCK`）下仍强制走真实生图路径。
- **Editor「重新生成」走真实生图**：`Editor/index.tsx:103` 已改 `mock:false`，配合后端护栏闭环。

### 3.5 静态资源路径 ✅ 通过

- `public/prompts/data.json` 存在；`public/prompts/images/` 存在 **50 张图**（与 `data.json` `total:50` 一致）。
- 程序化交叉校验（node）：50 条 `item.image` 文件名与磁盘文件 **100% 匹配，0 缺失，0 大小写重复**。
- 中文文件名无丢失/乱码（如 `001-小学科技文化墙.jpg`、`005-logo“辣翻天串串香”.jpg` 均正常落盘）。
- `git check-ignore` 确认图片与 `data.json` 均**未被 gitignore**，可随提交进入版本库（Vite `public/` 约定，运行时以 `/prompts/...` 访问，`Prompts/index.tsx:127` `fetch('/prompts/data.json')` 与 `encodeURI(item.image)` 路径一致）。

---

## 四、已知风险 / 待办

### 🔴 需主代理跟进的阻断项（合并/提交前必须处理）

1. **`apps/server/tmp_topup.ts` 禁止提交**
   - 性质：Agent A 遗留的一次性脚本，给测试账号 `13900008899` 充值 100 积分（写 `creditAccount` + `creditTransaction`），import 路径 `./src/config` 属临时用途。
   - 处理：**从工作区删除，切勿 `git add`**；测试账号 `13900008899` 一并清理（见风险 5）。
   - 非编译问题，但属于「脏文件」，提交会污染仓库并留下测试痕迹。

2. **`docs/IMA 知识库检索优化/` 越界且状态异常**
   - 现象：`git status` 将其列为 untracked 目录，但磁盘实际目录名为 `docs/IMA测试知识库导入版/`（`docs/` 下确无 `IMA 知识库检索优化`）。
   - 判断：不在本轮功能范围（疑似「知识库检索优化」独立 feature 遗留），名称与落地目录不一致。
   - 处理：**排除出本轮合并**，由主代理确认其归属与正确命名后再单独处理；本轮报告不将其计入功能改动。

### 🟡 数据质量（非阻断，建议补全）

3. **`data.json` index=27（长城城门头）`promptText` 为占位文案 `"正在加载提示词..."`**
   - 该条目标题/图片正常，但提示词正文缺失，点击「复制/使用」会带入无效内容。不影响编译与渲染，建议补全真实提示词。

### 🟡 运行时注意（非阻断，上线前验证）

4. **index=5 图片含全角中文引号文件名 `005-logo“辣翻天串串香”.jpg`**
   - 页面以 `encodeURI(item.image)` 访问，本地 dev 与生产静态服务通常可解析；但部署到部分对象存储/反向代理时全角引号可能需额外转义。建议上线前对第 5 条做一次真实路径拉取验证（其余 49 条无特殊字符，风险低）。

5. **对象存储未接生产 / 测试账号待清理**
   - 本轮生图链路已去 Mock，但生产对象存储（OSS）尚未接入；测试账号 `13900008899`（及 `tmp_topup.ts` 充值的 100 积分）需清理，避免遗留至生产环境。

---

## 五、系统可上线结论

**结论：功能层面可上线（绿灯），但合并/提交前须先清除 2 个遗留物。**

- ✅ 编译与类型：web + server `tsc --noEmit` 均 **0 errors**，无编译阻塞。
- ✅ 一致性：路由/导航、三处类型契约（data.json↔Prompts、promptSeed↔Home/Prompts、Account↔Membership 组件）、去 Mock 前后端闭环、静态资源路径与中文文件名 —— **全部通过**。
- ✅ 生产护栏：去 Mock 已具备「前端默认 live + 后端 `ALLOW_MOCK` 守卫」双重保险，生产环境不会被 mock 短路。
- ⚠️ 合并卫生：存在 `tmp_topup.ts`（必删）与 `docs/IMA 知识库检索优化/`（越界/状态异常，需确认），二者**不得进入提交**。
- 🟡 收尾项：补全 `data.json` index=27 占位提示词；上线前核验全角引号图片路径与对象存储接入；清理测试账号。

> 一句话：**类型/一致性全绿，去 Mock 闭环完备；清除 `tmp_topup.ts` 与异常 `docs/IMA` 目录、并补一条占位提示词后，即可安全合并上线。**

---

*本报告由合并/梳理 Agent 自动产出，所有结论基于 `git status` / `git diff --stat` / `tsc --noEmit` / 静态文件交叉校验，未对任何业务代码做修改。*
