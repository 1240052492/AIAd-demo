# 广告行业 AI 系统开发方案

版本：v0.1  
日期：2026-07-09  
定位：广告公司行业专用 AI 设计生产与交付系统

## 1. 项目目标

本系统不是通用 AI 绘画站，而是面向广告公司、门店招牌制作商、品牌设计工作室、喷绘标识工厂的行业生产工具。

核心目标是打通一条可商业化的交付链路：

```text
客户需求
-> AI 整理 brief
-> 生成广告设计方案
-> 上传门头/墙体/店铺环境图
-> 合成真实广告效果图
-> 在线编辑修改
-> 输出客户效果图、工厂施工参考图、矢量文件
-> 扣除积分并保存项目记录
```

第一阶段优先跑通“门头招牌效果图”业务闭环，后续扩展文化墙、灯箱、喷绘、菜单海报、品牌 VI、导视系统等品类。

## 2. 参考 shenbiai.art 的业务逻辑

可借鉴的产品结构：

- 首页即生成工作台，不做复杂营销首页。
- 顶部包含会员中心、积分超市、当前积分、登录入口。
- 左侧包含首页、工作台、提示词库、工作流库。
- 首页展示生成器、最近项目、提示词模板。
- 提示词库和工作流库降低用户使用门槛。
- 用户生成前校验积分，生成后记录项目和积分流水。

需要强化的行业差异：

- 从“通用 AI 设计”升级为“广告交付工作流”。
- 从“生成图片”升级为“效果图 + 环境合成 + 工厂输出”。
- 从“提示词库”升级为“广告场景模板库”。
- 从“工作流库”升级为“广告公司岗位流程引擎”。

## 3. 用户角色

### 3.1 游客

权限：

- 浏览首页。
- 浏览系统模板库、提示词库、案例库。
- 查看部分工作流说明。

限制：

- 不能生成图片。
- 不能上传客户环境图。
- 不能保存项目。
- 点击生成时引导注册或登录。

### 3.2 注册用户

权限：

- 注册赠送 5 积分。
- 创建客户项目。
- 使用 AI brief 整理。
- 使用 GPT-image-2 生图。
- 上传门头、墙体、店铺实拍图。
- 生成环境效果图。
- 在线编辑文字、颜色、位置、尺寸、材质。
- 导出客户效果图和基础施工参考图。
- 查看积分余额和消费记录。

限制：

- 积分不足时不能提交生成任务。
- 高级导出、批量生成、高清图、矢量导出可设置更高积分消耗或会员限制。

### 3.3 后台管理员

权限：

- 用户管理。
- 用户权限管理。
- 用户积分增减。
- 积分比例设置。
- 消费记录查看。
- 模板库管理。
- 提示词库管理。
- 工作流配置。
- AI provider 配置。
- 生成任务查看和失败重试。
- 首页布局、推荐模板、行业分类配置。
- 管理员操作日志查看。

## 4. 第一阶段 MVP 范围

第一阶段只做一条核心业务：

```text
门头招牌效果图生成
```

### 4.1 用户端流程

1. 用户注册或登录。
2. 系统赠送 5 积分。
3. 用户选择“门头招牌”业务。
4. 输入客户需求：
   - 店名
   - 行业
   - 风格
   - 门头尺寸
   - 材质偏好
   - 是否发光
   - 预算范围
   - 参考要求
5. Anthropic 生成标准 brief 和生图提示词。
6. 用户确认或修改提示词。
7. 后端创建 GPT-image-2 生图任务。
8. 前端轮询任务状态。
9. 返回 1-4 张设计方案图。
10. 用户上传客户门头照片。
11. 进入效果图工作台。
12. 将设计方案套入门头环境图。
13. 用户编辑文字、位置、颜色、材质、灯光。
14. 导出客户效果图。
15. 导出工厂参考说明。
16. 系统扣除积分并保存项目。

### 4.2 后台 MVP

必须包含：

- 用户列表。
- 用户积分余额。
- 积分流水。
- 生图任务列表。
- 生成结果列表。
- 模板管理。
- 提示词管理。
- provider 配置只读展示。
- 管理员手动加减积分。

第一阶段不做：

- 在线支付。
- 团队组织。
- 多租户。
- 完整矢量编辑器。
- 自动报价系统。
- 工厂订单派单。

这些放到第二、第三阶段。

## 5. 技术选型

### 5.1 前端用户端

推荐：

```text
React + Vite + TypeScript
```

原因：

- 与现有 shenbi 项目技术栈一致。
- 开发速度快。
- 适合工作台、模板库、轮询任务、编辑器等交互。

主要页面：

- `/` 首页生成器。
- `/templates` 模板库。
- `/workflows` 工作流库。
- `/projects` 我的项目。
- `/projects/:id` 项目详情。
- `/editor/:projectId` 效果图编辑器。
- `/credits` 积分中心。
- `/login` 登录。
- `/register` 注册。

### 5.2 后台管理端

第一阶段建议：

```text
React 同项目内 `/admin`
```

不建议第一阶段单独拆后台项目，避免重复搭建鉴权、路由、构建和部署。

后期后台复杂后可拆为：

```text
apps/web
apps/admin
apps/api
apps/worker
```

### 5.3 后端 API

推荐：

```text
Node.js + TypeScript + Express
```

原因：

- 当前项目已有 Express 基础。
- 第一阶段目标是跑通业务闭环，不需要一开始上 NestJS。
- 后续可逐步抽象 service、repository、provider adapter。

主要职责：

- 登录注册。
- JWT 鉴权。
- RBAC 权限控制。
- 用户积分账户。
- 积分流水。
- AI provider 调用。
- 生图任务创建。
- 任务状态查询。
- 文件上传。
- 项目保存。
- 后台管理 API。

### 5.4 数据库

推荐：

```text
PostgreSQL + Prisma
```

原因：

- 用户、积分、订单、项目、任务都需要结构化存储。
- 积分扣费需要事务。
- Prisma 对 TypeScript 类型友好。
- PostgreSQL 后续可支持复杂查询、统计和队列状态分析。

### 5.5 异步任务

推荐：

```text
Redis + BullMQ
```

用途：

- GPT-image-2 生图任务。
- 环境合成任务。
- 高清导出任务。
- 矢量转换任务。
- 失败重试。
- 任务超时处理。

### 5.6 文件存储

开发阶段：

```text
本地磁盘 storage/
```

生产阶段：

```text
阿里 OSS / 腾讯 COS / S3 / MinIO
```

存储内容：

- 用户上传的门头/墙体环境图。
- AI 生成图。
- 合成效果图。
- 导出 PNG/JPG/PDF/SVG。
- 项目源文件 JSON。

### 5.7 可编辑画布

推荐：

```text
Fabric.js
```

用途：

- 文字图层编辑。
- 图片图层编辑。
- 招牌区域定位。
- 缩放、旋转、拖拽。
- 尺寸辅助线。
- 导出 JSON。
- 导出 SVG。

第二阶段可增强：

- 透视变换。
- 网格吸附。
- 标尺。
- 材质图层。
- 灯光效果。

### 5.8 图片处理

推荐：

```text
sharp
```

用途：

- 图片压缩。
- 缩略图。
- 格式转换。
- 导出预览图。
- 合成基础图层。

复杂图像合成可后续加入：

- OpenCV。
- Segment Anything。
- 自定义透视变换服务。

## 6. Docker 方案

### 6.1 开发阶段

建议使用 Docker Compose 跑基础设施：

```text
postgres
redis
minio 可选
```

应用本身开发期本机运行：

```text
pnpm dev
pnpm server
pnpm worker
```

这样调试最快。

### 6.2 生产阶段

建议 Docker 化：

```text
frontend
api
worker
postgres
redis
minio 或外部 OSS
nginx
```

### 6.3 推荐 docker-compose 服务

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ad_ai
      POSTGRES_USER: ad_ai
      POSTGRES_PASSWORD: ad_ai_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

## 7. AI 接入架构

所有 AI 请求必须经过后端，不允许前端直连 provider。

```text
Frontend
-> Backend API
-> AI Service
-> Provider Adapter
-> sub2api / OpenAI / Anthropic / banana2
```

### 7.1 Provider 优先级

第一阶段：

```text
ANTHROPIC：聊天、brief、提示词、skills 工作流，优先跑通
GPT-image-2：生图，通过 OPENAI 接口异步任务 + 轮询，优先跑通
```

预留：

```text
OPENAI：文本备用 provider
banana2：图像备用 provider
```

### 7.2 环境变量建议

不要混用聊天和生图配置。建议拆分：

```env
NODE_ENV=development
PORT=4177
APP_URL=http://127.0.0.1:5173
API_URL=http://127.0.0.1:4177

DATABASE_URL=postgresql://ad_ai:ad_ai_password@127.0.0.1:5432/ad_ai
REDIS_URL=redis://127.0.0.1:6379

JWT_SECRET=replace-with-long-random-secret
REGISTER_BONUS_CREDITS=5

SHENBI_AI_MODE=live

AI_TEXT_PROVIDER=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=https://apic.aksearch.site
ANTHROPIC_MODEL=

OPENAI_API_KEY=
OPENAI_BASE_URL=https://apic.aksearch.site/v1
OPENAI_MODEL=

OPENAI_IMAGE_API_KEY=
OPENAI_IMAGE_BASE_URL=https://apic.aksearch.site/v1
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_MODE=async

BANANA2_ENABLED=false
BANANA2_API_KEY=
BANANA2_BASE_URL=
BANANA2_MODEL=

STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=storage
```

注意：

- 不要在聊天中暴露 API key。
- 已经截图出现过的 key 建议作废并重新生成。
- `.env` 必须加入 `.gitignore`。
- `.env.example` 只保留变量名和示例，不放真实 key。

### 7.3 Anthropic 聊天链路

用途：

- 客户需求整理。
- 缺失信息追问。
- 标准 brief。
- 生图提示词优化。
- 广告公司岗位工作流。

接口设计：

```text
POST /api/ai/brief
POST /api/ai/prompt
POST /api/ai/workflows/run
```

请求示例：

```json
{
  "businessType": "storefront_sign",
  "clientText": "给一家服装工作室做门头，白墙黑字，高级干净，夜间好看",
  "materials": ["客户门头照片"],
  "constraints": {
    "budget": "中等",
    "style": "简洁高级",
    "lighting": "暖白背光"
  }
}
```

返回示例：

```json
{
  "brief": {
    "businessType": "门头招牌",
    "targetAudience": "年轻女性服装消费人群",
    "visualDirection": "高级、克制、白墙黑字、暖白背光",
    "missingQuestions": ["门头实际尺寸是多少？", "是否已有 logo？"]
  },
  "imagePrompt": "为一家名为“不晚 STUDIO”的服装工作室设计门头..."
}
```

### 7.4 GPT-image-2 生图链路

采用异步任务，不让前端等待 provider 长请求。

创建任务：

```text
POST /api/image-jobs
```

返回：

```json
{
  "jobId": "job_20260709_001",
  "status": "queued"
}
```

查询任务：

```text
GET /api/image-jobs/:jobId
```

状态：

```text
queued
submitted
processing
succeeded
failed
canceled
```

任务成功返回：

```json
{
  "jobId": "job_20260709_001",
  "status": "succeeded",
  "results": [
    {
      "assetId": "asset_001",
      "url": "/storage/generated/asset_001.png"
    }
  ]
}
```

积分处理：

```text
提交任务前：校验积分
创建任务时：冻结积分
任务成功：正式扣除
任务失败：释放冻结积分
```

## 8. Agency-Workflow-skills 嵌入设计

这套 skills 不作为普通提示词库，而作为广告公司岗位流程引擎。

岗位映射：

```text
Account Executive -> 需求整理
Strategy Director -> 策略判断
Creative Director -> 创意方向
Copywriter -> 文案与广告语
Designer -> 视觉提示词与设计系统
BOSS -> 最终复核
```

产品内展示方式：

```text
智能项目流程
1. 需求整理
2. 策略判断
3. 创意方向
4. 文案生成
5. 视觉生成
6. 最终审核
```

用户不需要看到底层 skill 名称，只看到业务步骤。

后台配置：

- 每个岗位绑定一组 system prompt。
- 每个岗位可配置输入字段和输出 schema。
- 每个岗位可设置是否需要用户确认。
- 每个岗位可设置积分消耗。
- BOSS 审核可作为导出前检查。

## 9. 数据库设计

### 9.1 用户与权限

```text
users
- id
- phone
- email
- password_hash
- nickname
- status
- created_at
- updated_at

roles
- id
- code
- name

user_roles
- user_id
- role_id
```

### 9.2 积分账户

```text
credit_accounts
- id
- user_id
- balance
- frozen_balance
- created_at
- updated_at

credit_transactions
- id
- user_id
- account_id
- type
- amount
- balance_after
- related_type
- related_id
- reason
- operator_id
- created_at
```

type 示例：

```text
register_bonus
admin_adjust
freeze
consume
refund
recharge
```

### 9.3 项目

```text
projects
- id
- user_id
- title
- business_type
- status
- brief_json
- current_version_id
- created_at
- updated_at

project_versions
- id
- project_id
- name
- canvas_json
- created_at
```

### 9.4 素材和结果

```text
assets
- id
- user_id
- project_id
- type
- storage_key
- url
- mime_type
- width
- height
- size
- metadata_json
- created_at
```

type 示例：

```text
upload_environment
generated_design
composited_preview
export_png
export_pdf
export_svg
```

### 9.5 生成任务

```text
generation_jobs
- id
- user_id
- project_id
- provider
- model
- job_type
- status
- prompt
- request_json
- response_json
- error_message
- credits_frozen
- credits_consumed
- started_at
- finished_at
- created_at
```

### 9.6 模板和工作流

```text
templates
- id
- title
- category
- business_type
- cover_asset_id
- prompt
- config_json
- sort_order
- is_public
- created_at

workflow_templates
- id
- title
- business_type
- description
- steps_json
- credit_rule_json
- is_public
- created_at
```

### 9.7 Provider 配置

```text
ai_provider_configs
- id
- provider
- display_name
- base_url
- model
- enabled
- priority
- config_json
- created_at
- updated_at
```

不要把 API key 明文存数据库。第一阶段用 `.env`，后期接密钥管理服务。

## 10. API 草案

### 10.1 Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

### 10.2 用户项目

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
POST   /api/projects/:id/assets
POST   /api/projects/:id/export
```

### 10.3 AI

```text
POST /api/ai/brief
POST /api/ai/prompt
POST /api/image-jobs
GET  /api/image-jobs/:id
POST /api/composition-jobs
GET  /api/composition-jobs/:id
```

### 10.4 积分

```text
GET  /api/credits/balance
GET  /api/credits/transactions
POST /api/admin/users/:id/credits/adjust
```

### 10.5 后台

```text
GET   /api/admin/overview
GET   /api/admin/users
GET   /api/admin/generation-jobs
GET   /api/admin/templates
POST  /api/admin/templates
PATCH /api/admin/templates/:id
GET   /api/admin/workflows
POST  /api/admin/workflows
PATCH /api/admin/workflows/:id
GET   /api/admin/provider-configs
PATCH /api/admin/provider-configs/:id
```

## 11. 积分规则建议

初始规则：

```text
注册赠送：5 积分
Anthropic brief 整理：1 积分
Anthropic 提示词优化：1 积分
GPT-image-2 生成 1 张：2 积分
环境合成 1 次：2 积分
高清导出：1 积分
SVG 导出：2 积分
施工参考 PDF：2 积分
```

后台必须可配置：

- 每类任务单价。
- 注册赠送积分。
- 失败是否退回。
- 会员折扣。
- 单次生成最大张数。

## 12. UI 原型说明

本次同时输出 4 张 UI 原型图：

```text
output/home-ui-prototype.png
用户首页生成器：输入客户需求、选择业务类型、查看模板和工作流。

output/editor-ui-prototype.png
门头效果图工作台：上传环境图、套入招牌、编辑文字/材质/尺寸、导出文件。

output/projects-ui-prototype.png
用户项目和积分中心：项目列表、积分流水、模板入口。

output/admin-ui-prototype.png
后台管理：用户、积分、模型 provider、任务队列、模板和工作流管理。
```

原型源文件：

```text
prototype/advertising-ai-ui-prototype.html
prototype/assets/storefront-reference.png
```

## 13. 阶段排期

### 阶段 0：准备

周期：1-2 天

任务：

- 清理敏感 `.env`。
- 统一项目编码为 UTF-8。
- 明确 `.env.example`。
- 增加 `.gitignore`。
- 确定本地开发端口。

### 阶段 1：基础业务闭环

周期：7-10 天

任务：

- 用户注册登录。
-注册送 5 积分。
- PostgreSQL + Prisma。
- 积分账户和流水。
- Anthropic brief 和提示词接口。
- GPT-image-2 异步生图任务。
- 任务轮询。
- 图片保存。
- 项目保存。
- 后台用户和任务列表。

验收：

- 新用户注册后有 5 积分。
- 用户能输入门头需求。
- 系统能生成 brief 和生图 prompt。
- 系统能提交 GPT-image-2 任务。
- 前端能轮询并展示图片。
- 成功后扣积分并保存记录。

### 阶段 2：门头效果图工作台

周期：10-15 天

任务：

- 门头环境图上传。
- 项目素材管理。
- Fabric.js 画布。
- 文字图层编辑。
- 图片图层编辑。
- 简单招牌区域调整。
- PNG 导出。
- SVG 导出。
- 施工参考 PDF 初版。

验收：

- 用户可上传门头照片。
- 可在照片上叠加招牌方案。
- 可修改文字、位置、颜色。
- 可导出客户效果图。
- 可导出基础 SVG。

### 阶段 3：后台运营能力

周期：7-10 天

任务：

- 模板库管理。
- 提示词库管理。
- 工作流配置。
- 积分规则配置。
- 管理员加减积分。
- Provider 状态展示。
- 失败任务重试。
- 统计总览。

验收：

- 管理员可配置模板和工作流。
- 管理员可调整用户积分。
- 所有积分变动有流水。
- 生图失败可查看错误。

### 阶段 4：商业化扩展

周期：后续迭代

任务：

- 支付充值。
- 会员套餐。
- 团队账号。
- 更多广告品类。
- 高级环境合成。
- 自动尺寸标注。
- 工厂报价辅助。
- 订单流转。

## 14. 风险与注意事项

### 14.1 API key 安全

截图里出现过 API key，建议视为已暴露并重新生成。

要求：

- 不在聊天、文档、截图中展示真实 key。
- `.env` 不提交 git。
- 后台不展示完整 key。
- 日志中屏蔽 key。

### 14.2 生图稳定性

GPT-image-2 生图可能耗时较长或失败，必须用异步任务。

要求：

- 前端轮询。
- 后端状态机。
- 失败重试。
- 超时处理。
- 积分失败退回。

### 14.3 效果图真实性

第一阶段不追求完全自动透视融合，先做可编辑叠加和导出。

第二阶段再做：

- 门头区域自动识别。
- 透视变换。
- 光照匹配。
- 材质模拟。

### 14.4 矢量图边界

AI 生成图不能天然变成高质量可施工矢量图。

第一阶段推荐：

- 文字、形状、招牌区域使用 Fabric.js 图层导出 SVG。
- 位图方案作为参考图保留。
- 不承诺自动把复杂位图完美矢量化。

第二阶段可接：

- Potrace 类位图描摹。
- SVG 编辑。
- PDF 导出。
- 人工修图流程。

## 15. 推荐执行顺序

最稳妥顺序：

```text
1. 修正项目编码和敏感配置
2. 接 PostgreSQL + Prisma
3. 做用户注册登录和积分账户
4. 跑通 Anthropic brief/prompt
5. 跑通 GPT-image-2 异步生图
6. 保存生成结果和扣积分
7. 做门头项目工作台
8. 做后台管理
9. 做 SVG/PDF 导出
10. 扩展更多广告品类
```

核心原则：

```text
先跑通可收费闭环，再做复杂编辑能力。
先做门头招牌一个品类，再扩展其他广告业务。
先做任务和积分可靠，再做视觉细节。
```
