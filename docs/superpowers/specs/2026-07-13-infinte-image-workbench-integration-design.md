# infinte-image 首页工作台集成设计

日期：2026-07-13  
目标项目：`D:\guanggaohangye`  
参考项目：`herosimith/infinte-image`

## 目标

把 `infinte-image` 首页红框内工作台的完整功能和实现逻辑集成到本地 `guanggaohangye` 首页中：首页界面以参考项目为准，后端仍适配本地已有用户、项目、积分、Prisma、BullMQ、资产存储和 GPT-image-2 生图链路。

本次范围采用方案 A：保留本地系统架构，移植工作台闭环和 OCR sidecar。不得引入参考项目的 JSON store 作为新数据源。

## 必须覆盖的功能

1. 客户需求输入。
2. 需原样显示文字输入，作为 OCR 校验真值。
3. 业务、材质、风格、输出尺寸、生成质量、联调预览/真实生图模式。
4. AI 润色提示词展示、编辑、复制、重置、用当前提示词重新生图。
5. 原图生成、环境图上传、环境合成、矢量图输出。
6. 原图/环境图/矢量图 tabs 预览。
7. 下载当前图、查看大图、重新生成。
8. 步骤状态：AE 需求整理、策略判断、创意方向、视觉生成、环境合成、工厂输出。
9. OCR 文字校验与文字重绘。
10. 生图与积分规则必须匹配本地后台配置和现有账务链路。

## 不做的事情

1. 不把 `infinte-image` 的 JSON store 并入本地生产数据层。
2. 不绕过本地登录、权限、项目归属、积分校验。
3. 不把 OCR 结果视为最终人工验收，OCR 只作为辅助校验。
4. 不在第一期实现真正 CAD/AI/CDR 级工厂矢量文件，第一期先输出可下载 SVG 草稿。

## 架构

### 前端

新增首页工作台模块，建议拆分为：

```text
apps/web/src/pages/Home/
  index.tsx
  Workbench.tsx
  workbench.types.ts
  workbench.constants.ts
  workbench.utils.ts
  components/
    RequirementPanel.tsx
    PromptPanel.tsx
    ResultPanel.tsx
    TextValidationPanel.tsx
    WorkflowStatus.tsx
```

首页布局和交互以 `infinte-image/src/client/App.tsx` 为基准，但样式适配本地 Tailwind、现有全局主题和 `MainLayout`。

### 后端

保留现有模块：

1. `Project`：保存项目、客户 brief、业务类型。
2. `Asset`：保存上传环境图、广告原图、环境合成图、文字校正图、SVG。
3. `GenerationJob`：保存原图、环境合成、OCR 校验、文字重绘、矢量输出任务。
4. `CreditService`：继续作为所有积分变化唯一入口。
5. `imageQueue`：处理 GPT-image-2 生图。
6. `compositionQueue`：处理环境合成。

新增或扩展接口：

```text
POST /api/workbench/prompt
POST /api/workbench/projects
POST /api/image-jobs
GET  /api/image-jobs/:id
POST /api/composition-jobs
POST /api/image-jobs/:id/text-validation
POST /api/image-jobs/:id/text-corrections
POST /api/vector-assets
GET  /api/credits/rules/public
```

也可以不新增 `/api/workbench/*`，直接复用 `/api/ai/brief` 和 `/api/projects`。推荐第一期尽量复用现有接口，只为缺口新增 `composition-jobs`、OCR、文字重绘、矢量资产接口。

## 数据流

### 原图生成

1. 用户填写客户需求、可见文字、业务、材质、风格、尺寸、质量。
2. 前端校验登录态和积分预估。
3. 调用 `/api/ai/brief` 生成结构化 brief 和 `imagePrompt`。
4. 创建 `Project`，把 brief、客户原始需求、可见文字、材质、风格、尺寸、质量写入 `briefJson`。
5. 调用 `/api/image-jobs` 创建原图任务。
6. 后端冻结积分，创建 `GenerationJob(jobType=image_generation)`，入 `imageQueue`。
7. Worker 调 GPT-image-2，成功后保存 `Asset(type=generated_design)`，扣减冻结积分；失败则标记失败并退回冻结积分。
8. 前端通过轮询或 WebSocket 更新状态和结果。

### 环境合成

1. 用户上传环境图到项目资产，保存为 `Asset(type=upload_environment)`。
2. 原图成功后，用户点击或系统自动提交环境合成。
3. 新增 `/api/composition-jobs`：校验项目归属、环境图归属、设计图归属。
4. 后端按积分规则冻结积分，创建 `GenerationJob(jobType=composition)`，入 `compositionQueue`。
5. Worker 调用现有 `CompositionService.composeToEnvironment`。
6. 成功保存 `Asset(type=composited_preview)` 并扣减积分；失败退回。

### OCR 文字校验

1. 原图或环境图成功后，前端调用 `/api/image-jobs/:id/text-validation`。
2. 后端读取该任务对应本地图片资产。
3. 后端调用 OCR sidecar：`POST {OCR_SERVICE_URL}/ocr`。
4. OCR sidecar 使用 PaddleOCR 返回文字区域、置信度、多边形坐标。
5. Node 后端按 `requiredVisibleTexts` 做归一化匹配和相似度判断。
6. 校验结果保存到 `GenerationJob.responseJson.textValidation`。
7. 前端展示 passed、needs_review、unavailable 三类状态。

### 文字重绘

1. 用户在 OCR 未通过的文字项上点击修正。
2. 前端生成或编辑修正框：`x/y/width/height/fontSize/textColor/coverColor`。
3. 调用 `/api/image-jobs/:id/text-corrections`。
4. 后端校验修正文字必须属于该 job 的 `requiredVisibleTexts`。
5. 后端用 Sharp 生成 SVG overlay，覆盖原文字区域并重绘正确文字。
6. 保存 `Asset(type=corrected)`，并把 corrections 和 correctedAssets 写入 `GenerationJob.responseJson`。
7. 前端可在原图和校正图之间切换。

### 矢量图输出

1. 第一阶段沿用 `infinte-image` 的 SVG 草稿逻辑。
2. 调用 `/api/vector-assets`，后端校验 SVG 安全性：拒绝 `<script>`、`on*=`、`javascript:`。
3. 保存 `Asset(type=export_svg)` 或新增 `type=vector` 时需要同步 Prisma 类型约定。
4. 是否扣积分由后台积分规则控制。

## 积分规则

本地现有默认积分规则：

```ts
{
  registerBonus: 5,
  imageGeneration: 2,
  composition: 1,
  exportPng: 1,
  exportPdf: 2,
  exportSvg: 1
}
```

集成后必须满足：

1. 首页工作台不得写死费用。
2. 生图费用按后台规则计算：`imageGeneration * count`。
3. 环境合成费用按后台规则计算：`composition`。
4. SVG 输出费用按后台规则计算：`exportSvg`。
5. Brief/提示词润色如果继续走现有 `/api/ai/brief`、`/api/ai/prompt`，沿用当前 1 积分冻结、成功扣减、失败退回的规则。
6. OCR 校验默认 0 积分，因为它是已付费生成结果的质量校验。
7. 本地文字重绘默认 0 积分，因为它是 Sharp 本地修正，不调用上游 AI；后续可新增 `textCorrection` 规则。
8. 前端生成前展示预估消耗：`briefCost + imageGeneration * count + optionalComposition + optionalExportSvg`。
9. 后端为最终权威，不信任前端预估。
10. 所有扣费继续走 `CreditService.freeze -> consume/refund`，不得直接修改 `CreditAccount`。

建议新增 `credit-rule.service.ts`，统一读取后台配置并回退默认值。`image-jobs.ts` 里当前 `const creditCost = n * 2` 应改为从规则读取，避免和后台配置不一致。

## OCR Sidecar

按 `infinte-image` 原方案保留 Python sidecar：

```text
ocr-sidecar/
  app.py
  requirements.txt
  Dockerfile
```

环境变量：

```text
OCR_SERVICE_URL=http://127.0.0.1:4188
OCR_REQUEST_TIMEOUT_MS=25000
OCR_MAX_INPUT_EDGE=2048
OCR_MIN_CONFIDENCE=0.7
TEXT_RENDER_FONT_FAMILY=Microsoft YaHei, Noto Sans CJK SC, sans-serif
TEXT_RENDER_MAX_INPUT_PIXELS=40000000
```

Docker Compose 增加：

```text
ocr-sidecar
```

容器内 `server` 和 `worker` 使用：

```text
OCR_SERVICE_URL=http://ocr-sidecar:4188
```

OCR sidecar 必须只暴露在内网或本机环回地址，不直接对公网开放。

## 接口适配细节

### `POST /api/composition-jobs`

请求：

```json
{
  "projectId": "project_id",
  "environmentAssetId": "asset_env",
  "designAssetId": "asset_design",
  "position": { "x": 100, "y": 100, "width": 800, "height": 260 },
  "outputFormat": "png"
}
```

返回：

```json
{
  "code": 0,
  "data": { "jobId": "job_id", "status": "queued" }
}
```

### `POST /api/image-jobs/:id/text-validation`

返回：

```json
{
  "status": "passed | needs_review | unavailable",
  "expectedTexts": ["不晚 STUDIO"],
  "regions": [],
  "checks": []
}
```

### `POST /api/image-jobs/:id/text-corrections`

请求：

```json
{
  "corrections": [
    {
      "expectedText": "不晚 STUDIO",
      "regionId": "ocr_1",
      "x": 120,
      "y": 80,
      "width": 480,
      "height": 120,
      "fontSize": 72,
      "textColor": "#111827",
      "coverColor": "#ffffff"
    }
  ]
}
```

返回更新后的 job 和校正图 asset。

## 前端状态模型

首页工作台维护以下核心状态：

```ts
customerText
requiredVisibleTexts
businessType
material
style
runMode
imageSize
imageQuality
project
prompt
polishedPromptText
uploadAsset
originalJob
composedJob
vectorAsset
activeTab
textValidation
correctionDraft
creditEstimate
busy/error
```

状态来源优先级：

1. 当前页面内存状态。
2. 后端 job 轮询或 WebSocket 更新。
3. 项目详情和资产列表恢复。

## 错误处理

1. 未登录：跳转登录。
2. 积分不足：阻止提交，显示当前余额和预计消耗。
3. 生图失败：任务标记 failed，冻结积分退回。
4. 环境合成失败：任务标记 failed，冻结积分退回。
5. OCR 服务不可用：显示 `unavailable`，不阻断下载和导出。
6. 文字重绘失败：保留原图，提示错误。
7. 上传失败：保留当前结果，不清空已有生成图。

## 安全要求

1. 所有项目、资产、任务接口必须校验 `userId` 归属。
2. 上传文件限制类型和大小，沿用本地现有上传限制。
3. SVG 输出必须做安全过滤。
4. OCR sidecar 不直接暴露公网。
5. 文字重绘只能修正当前任务 `requiredVisibleTexts` 中的文字，不能任意写入未授权内容。
6. 不把 API key、真实 `.env`、上传文件、生成文件提交到 Git。

## 测试计划

1. 前端：工作台状态流转、积分预估、tab 切换、提示词编辑、OCR 面板。
2. 后端：composition job 创建、归属校验、积分冻结和退回。
3. 后端：OCR 校验接口在 sidecar 可用和不可用两种情况下的返回。
4. 后端：文字重绘坐标、颜色、文本白名单、安全限制。
5. 集成：mock/联调模式完整跑通，不消耗 GPT-image-2。
6. 集成：真实生图模式消耗积分并落盘结果。
7. Docker：`postgres + redis + server + worker + web + ocr-sidecar` 启动健康检查。

## 实施顺序

1. 新增 OCR sidecar 和 Docker 配置。
2. 抽象积分规则读取服务，替换生图硬编码 `n * 2`。
3. 新增 composition job API。
4. 新增 OCR 校验和文字重绘服务/API。
5. 新增 SVG 资产 API。
6. 改造首页为 `infinte-image` 工作台布局。
7. 接入工作台 API 状态流转和积分预估。
8. 本地联调和 Docker 联调。

## 验收标准

1. 首页视觉和交互闭环与 `infinte-image` 红框内工作台一致。
2. 用户登录后可从首页完成客户需求到广告原图生成。
3. 上传环境图后可生成真实环境效果图。
4. 可生成并下载 SVG 矢量草稿。
5. OCR sidecar 可用时可校验文字并显示通过/待复核。
6. 可对待复核文字生成校正图。
7. 生图、环境合成、SVG 输出积分消耗与后台规则一致。
8. 任务失败时冻结积分能退回。
9. 未登录或积分不足时不能提交真实生图。
10. 现有后台、项目、积分、用户权限不被破坏。
