# 生图逻辑 Diff 对比：AdCraft AI vs gpt_image_playground（参考项目）

> 参考项目：`https://github.com/CookSleep/gpt_image_playground`（前端 playground，生图逻辑在 `src/lib/openaiCompatibleImageApi.ts`，约 1000 行）
> 对比对象：AdCraft 后端 `apps/server/src/services/ai/openai-image.service.ts`
> 结论先行：**参考项目「能跑通」的关键是它走标准同步 `images/generations` 并内联拿图；AdCraft 当前把「异步 background/async + 轮询」当默认主路径，而当前网关（`apic.aksearch.site`）不支持这套异步协议，于是 404/403。**

---

## 1. 一句话对比

| 维度 | 参考项目（OK） | AdCraft（当前，不通） |
|------|---------------|----------------------|
| 默认调用方式 | **同步** `POST /images/generations`，等待 JSON 返回 | **异步优先**：`background:true, async:true` → 轮询 `GET /images/generations/{id}` |
| 异步轮询 | 仅「自定义服务商」**显式配置** submit+poll 时才用 | 当成**默认主路径**（`OPENAI_IMAGE_MODE=async`） |
| 拿图方式 | `response_format: b64_json`（可配）→ 图**内联**返回 base64 | 异步路径不请求；sync 回退用 SDK 默认 `url` |
| 模型/端点 | `gpt-image-2`、端点 `{baseUrl}/v1/images/generations` | `gpt-image-2`、`{OPENAI_IMAGE_BASE_URL}/images/generations` |
| 失败原因 | — | 网关无 `/async` 与 `background` 支持 → 404/403 |

---

## 2. 参考项目「标准路径」请求体（`callImagesApiSingle`，非编辑分支，行 633–668）

```
POST {baseUrl}/v1/images/generations        # Content-Type: application/json
Authorization: Bearer {apiKey}
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1024x1024",
  "output_format": "png",
  "moderation": "auto",
  "quality": "auto",                         # 除非 codexCli
  "output_compression": ...,                 # 若非 png
  "n": 1,                                    # 若 >1
  "response_format": "b64_json",             # 若 profile.responseFormatB64Json=true
  "stream": true, "partial_images": 2        # 仅流式可选
}
→ 同步 await，解析 JSON：data[].b64_json 或 data[].url（parseImagesApiResponse）
```

- **关键点**：**没有 `background` / `async` 字段，不轮询 id**。
- 默认 `apiMode='images'`（行 319）、`DEFAULT_IMAGES_MODEL='gpt-image-2'`（行 32）。
- `buildApiUrl`（devProxy.ts:57）会**自动保证 baseUrl 带 `/v1`**：若 baseUrl 已含 `/v1` 则只保留到 `/v1`；否则自动补 `/v1`。所以用户填 `https://x/v1` 或 `https://x` 都能拼成 `…/v1/images/generations`。

## 3. AdCraft 当前请求体（`submitJob`，`OPENAI_IMAGE_MODE=async` 默认，行 120–195）

```
POST {OPENAI_IMAGE_BASE_URL}/images/generations     # Authorization: Bearer
{
  "model": "gpt-image-2",
  "prompt": "...",
  "size": "1024x1024",
  "n": 1,
  "quality": "standard",
  "background": true,        # ← 强制异步
  "async": true              # ← 强制异步
}
→ 若 200 含 id：轮询 GET /images/generations/{id}（off- 前缀）
→ 否则：POST /images/generations/async 再轮询（gw- 前缀）
```

- 只有 `OPENAI_IMAGE_MODE=sync` 时才走 `client.images.generate`（SDK 同步），且 SDK 默认 `response_format=url`（拿的是 URL，worker 再 fetch）。
- **默认是 async**，所以当前链路永远先试异步 → 网关 404/403。

---

## 4. 关键差异点（Diff）

1. **同步 vs 异步（根因）**
   - 参考：同步 POST 等结果，简单可靠。
   - AdCraft：异步 `background/async` + 轮询。当前网关（`apic.aksearch.site`）**既没有 `/images/generations/async` 也没有 OpenAI 官方 `background` 异步语义** → 直接失败。
   - 参考项目里的「异步轮询」(`pollCustomTaskResult`) **只服务于用户手动配置的「自定义服务商」**（submit/poll mapping），不是 OpenAI 标准路径。

2. **`response_format` 内联拿图**
   - 参考：可配 `response_format: b64_json`，图片直接 base64 内联返回，**无需再 fetch 一个 URL**（规避临时 URL / CORS / 后端无法访问的问题）。
   - AdCraft：异步路径完全不请求 `response_format`；sync 回退用 SDK 默认 `url` → worker 必须能访问该 URL 才能落盘。

3. **`/v1` 拼接**
   - 参考：`buildApiUrl` 自动规整 baseUrl 到 `…/v1`。
   - AdCraft：由用户在 `OPENAI_IMAGE_BASE_URL` 手动写 `/v1`（当前写对了，不是问题点）。

4. **错误处理**
   - 参考：非 2xx → `getApiErrorMessage(response)` 抛出清晰错误；流式/轮询有 `isRetryablePollingStatus`（408/429/5xx 重试，4xx 终态）。
   - AdCraft：异步路径对 401/403/5xx 抛错、404/405/400 才继续尝试 `/async` 回退——逻辑本身没错，但**前提网关支持异步**，而当前网关不支持。

---

## 5. 对 AdCraft 的修复建议（对齐参考项目）

> 注：你之前要求「异步请求」。但你说「参考项目逻辑是 OK 的」——而参考项目**默认就是同步**。两者冲突。最稳妥是**对齐参考项目：同步为主、异步降级为可选项**。

1. **把生图主路径改为同步**（推荐直接改 `openai-image.service.ts`）：
   - `submitJob` 默认走 `client.images.generate({ model, prompt, size, n, quality, response_format: 'b64_json' })`。
   - worker 直接拿到 `b64_json` 落盘（去掉「fetch URL」环节，规避后端访问临时 URL 失败）。
2. **异步轮询降级为可选**：仅当用户在配置里显式开启且网关支持时才走 `background/async`+轮询（对齐参考的 custom-provider 思路）。`OPENAI_IMAGE_MODE` 默认建议 `sync`。
3. **结果解析**：复用现有 `normalizeResults`（已兼容 `b64_json` / `url` / `data` / `output` 等多结构），无需大改。

### 改动量极小（示例伪代码）
```ts
// openai-image.service.ts submitJob 同步分支
const gen = await this.ensureReady().images.generate({
  model, prompt, size, n, quality,
  response_format: 'b64_json',          // ← 对齐参考：内联拿图
} as any)
const items = (gen.data || []).map(d => ({ b64_json: d.b64_json }))
// 直接返回，worker 落盘，无需 fetch URL
```

---

## 6. 参考项目关键代码摘录（供对照）

- `openaiCompatibleImageApi.ts:480` `callOpenAICompatibleImageApi` → 按 `apiMode` 分流 `responses` / `images`。
- `openaiCompatibleImageApi.ts:553` `callImagesApiSingle` → 标准同步生图请求（无 background/async）。
- `openaiCompatibleImageApi.ts:632-668` 生成分支请求体构造（含 `response_format: b64_json`）。
- `openaiCompatibleImageApi.ts:295` `parseImagesApiResponse` → 解析 `data[].b64_json` 或 `data[].url`。
- `openaiCompatibleImageApi.ts:882` `pollCustomTaskResult` → **仅自定义服务商**用的异步轮询（非默认）。
- `devProxy.ts:13` `normalizeBaseUrl` / `:57` `buildApiUrl` → 自动规整 baseUrl 到 `…/v1`。
- `apiProfiles.ts:32` `DEFAULT_IMAGES_MODEL='gpt-image-2'`；`:319` 默认 `apiMode='images'`。

---

## 7. 仍需注意（非代码）

即使改成同步，能否真出图仍取决于 `.env` 的 key 对该网关**有效且开通生图权限**。当前 `apic.aksearch.site` 对该 key 是 403/503（账号/鉴权层拒绝），属配置项。同步改造解决的是「协议不匹配」问题，解决不了「key 无效」问题。
