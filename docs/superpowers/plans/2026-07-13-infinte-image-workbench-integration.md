# infinte-image Workbench Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the `infinte-image` home workbench into `guanggaohangye` while preserving local auth, projects, assets, BullMQ workers, Prisma data, and credit accounting.

**Architecture:** Keep `guanggaohangye` as the system of record. Add missing workbench APIs for credit rules, composition jobs, OCR validation, text correction, and SVG assets; add a Python PaddleOCR sidecar; then replace the home page with a workbench UI adapted from `infinte-image`.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind, Express, Prisma, BullMQ, Redis, Sharp, Python FastAPI, PaddleOCR, Docker Compose.

---

## File Map

- Create: `ocr-sidecar/app.py` - PaddleOCR HTTP service copied from `infinte-image`.
- Create: `ocr-sidecar/requirements.txt` - Python dependencies for the sidecar.
- Create: `ocr-sidecar/Dockerfile` - Docker runtime for OCR.
- Modify: `docker-compose.yml` - add `ocr-sidecar` and wire `OCR_SERVICE_URL` into server/worker.
- Modify: `.env.example` - add OCR and text rendering configuration.
- Modify: `apps/server/src/config/index.ts` - expose OCR and text rendering env values.
- Create: `apps/server/src/services/credit-rule.service.ts` - centralize credit rule lookup.
- Modify: `apps/server/src/routes/image-jobs.ts` - use credit rules and expose OCR/text correction endpoints.
- Create: `apps/server/src/routes/composition-jobs.ts` - create composition jobs with ownership and credit checks.
- Create: `apps/server/src/routes/vector-assets.ts` - store safe SVG assets.
- Create: `apps/server/src/services/ai/text-validation.service.ts` - call OCR sidecar and compare required texts.
- Create: `apps/server/src/services/ai/text-correction.service.ts` - render text correction overlay with Sharp.
- Modify: `apps/server/src/app.ts` - register new routes.
- Modify: `apps/server/src/types/common.ts` and `apps/web/src/types/index.ts` - add corrected/vector text validation types where needed.
- Modify: `apps/web/src/services/api.ts` - add workbench API clients.
- Replace/Modify: `apps/web/src/pages/Home/index.tsx` - home workbench UI and flow.
- Create: `apps/web/src/pages/Home/workbench.constants.ts` - business, size, quality presets.
- Create: `apps/web/src/pages/Home/workbench.utils.ts` - prompt text extraction, SVG creation, image URL helpers.

## Task 1: OCR Sidecar

**Files:**
- Create: `ocr-sidecar/app.py`
- Create: `ocr-sidecar/requirements.txt`
- Create: `ocr-sidecar/Dockerfile`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add OCR sidecar files**

Create `ocr-sidecar/app.py` from the reference implementation. It must expose:

```python
@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": PaddleOCR is not None, "error": PADDLE_IMPORT_ERROR or None}

@app.post("/ocr")
async def ocr(file: UploadFile = File(...), max_edge: int = 2048) -> Dict[str, Any]:
    # returns sourceWidth, sourceHeight, scale, regions
```

- [ ] **Step 2: Add Docker image**

Create `ocr-sidecar/Dockerfile`:

```dockerfile
FROM docker.m.daocloud.io/library/python:3.11-slim
WORKDIR /app
COPY ocr-sidecar/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ocr-sidecar/app.py .
EXPOSE 4188
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4188"]
```

- [ ] **Step 3: Wire compose and env**

Add `OCR_SERVICE_URL=http://ocr-sidecar:4188` to `server` and `worker` services and add a new `ocr-sidecar` service. Add local defaults to `.env.example`.

- [ ] **Step 4: Verify syntax**

Run:

```bash
docker compose config
```

Expected: valid config with `ocr-sidecar`.

## Task 2: Credit Rule Service

**Files:**
- Create: `apps/server/src/services/credit-rule.service.ts`
- Modify: `apps/server/src/routes/image-jobs.ts`

- [ ] **Step 1: Create failing expectation by inspection**

Current `image-jobs.ts` contains:

```ts
const creditCost = n * 2
```

This must be replaced with a service call.

- [ ] **Step 2: Implement credit rule lookup**

Create:

```ts
export type CreditRuleKey = 'imageGeneration' | 'composition' | 'exportSvg' | 'exportPng' | 'exportPdf'

export class CreditRuleService {
  async getRules(): Promise<Record<string, number>> {
    // read system setting if present, fallback to DEFAULT_CREDIT_RULES
  }

  async getCost(key: CreditRuleKey): Promise<number> {
    const rules = await this.getRules()
    const value = Number(rules[key])
    return Number.isInteger(value) && value >= 0 ? value : 0
  }
}
```

- [ ] **Step 3: Replace hard-coded image cost**

Use:

```ts
const perImageCost = await creditRuleService.getCost('imageGeneration')
const creditCost = n * perImageCost
```

If `creditCost` is `0`, skip freeze and set `creditsFrozen: 0`.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @adcraft/server build
```

Expected: TypeScript build passes.

## Task 3: Composition Job API

**Files:**
- Create: `apps/server/src/routes/composition-jobs.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add route**

Create `POST /api/composition-jobs` with body:

```ts
{
  projectId: string
  environmentAssetId: string
  designAssetId: string
  position?: { x: number; y: number; width: number; height: number }
  outputFormat?: 'png' | 'jpeg'
}
```

- [ ] **Step 2: Add ownership checks**

Check project, environment asset, and design asset all belong to `req.user!.id` and the same project.

- [ ] **Step 3: Add credit freeze and queue**

Use `creditRuleService.getCost('composition')`, create `GenerationJob(jobType='composition')`, and enqueue `compositionQueue.add('compose', payload)`.

- [ ] **Step 4: Register route**

Add:

```ts
app.use('/api/composition-jobs', apiLimiter, compositionJobRoutes)
```

- [ ] **Step 5: Add client API**

Add `compositionJobApi.create()` to `apps/web/src/services/api.ts`.

## Task 4: OCR Validation API

**Files:**
- Create: `apps/server/src/services/ai/text-validation.service.ts`
- Modify: `apps/server/src/routes/image-jobs.ts`
- Modify: `apps/web/src/types/index.ts`

- [ ] **Step 1: Define types**

Add OCR types equivalent to:

```ts
export interface TextValidationRecord {
  status: 'pending' | 'passed' | 'needs_review' | 'unavailable'
  expectedTexts: string[]
  regions: OcrRegion[]
  checks: TextValidationCheck[]
  error?: string
}
```

- [ ] **Step 2: Implement service**

Call `env.ocrServiceUrl + '/ocr'`, send local generated asset bytes, parse regions, compare normalized expected text against OCR text with confidence threshold.

- [ ] **Step 3: Add route**

Add:

```ts
router.post('/:id/text-validation', authMiddleware, async (...) => {})
```

Save the result inside `GenerationJob.responseJson.textValidation`.

## Task 5: Text Correction API

**Files:**
- Create: `apps/server/src/services/ai/text-correction.service.ts`
- Modify: `apps/server/src/routes/image-jobs.ts`

- [ ] **Step 1: Implement correction rendering**

Use Sharp to composite an SVG overlay with a cover rectangle and corrected text.

- [ ] **Step 2: Enforce whitelist**

Reject `expectedText` values not present in `requiredVisibleTexts` stored in the job request/response JSON.

- [ ] **Step 3: Save corrected asset**

Create `Asset(type='corrected')` if schema allows it, or `Asset(type='generated_design')` with `metadataJson.kind='corrected'` if avoiding migration.

First implementation should avoid a Prisma enum migration because `type` is currently string.

## Task 6: SVG Asset API

**Files:**
- Create: `apps/server/src/routes/vector-assets.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add safe SVG route**

Reject SVG containing `<script`, `on[a-z]=`, or `javascript:`.

- [ ] **Step 2: Apply credit rule**

Use `creditRuleService.getCost('exportSvg')`; if cost > 0, freeze and consume synchronously after save, refund on save failure.

- [ ] **Step 3: Save asset**

Write SVG to storage and create `Asset(type='export_svg')`.

## Task 7: Home Workbench UI

**Files:**
- Modify: `apps/web/src/pages/Home/index.tsx`
- Create: `apps/web/src/pages/Home/workbench.constants.ts`
- Create: `apps/web/src/pages/Home/workbench.utils.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Add constants**

Add business types, image sizes, quality options, and default need from `infinte-image`.

- [ ] **Step 2: Add utility functions**

Add `extractStoreName`, `createVectorSvg`, and `activeImageUrl`.

- [ ] **Step 3: Replace home layout**

Adapt `infinte-image` red-frame workbench into React/Tailwind. Keep local `useAuthStore`, `projectApi`, `aiApi`, `imageJobApi`, `compositionJobApi`, `vectorAssetApi`.

- [ ] **Step 4: Wire flow**

Implement:

```ts
generatePromptAndOriginal()
uploadEnvironment()
generateComposition()
validateText()
applyCorrection()
generateVector()
downloadCurrentImage()
```

- [ ] **Step 5: Verify UI**

Run dev server and inspect with browser screenshot at desktop and mobile widths.

## Task 8: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Typecheck/build**

Run:

```bash
pnpm --filter @adcraft/server build
pnpm --filter @adcraft/web build
```

- [ ] **Step 2: Docker config**

Run:

```bash
docker compose config
```

- [ ] **Step 3: Git status**

Confirm only intended files changed.

- [ ] **Step 4: Commit implementation**

Commit with:

```bash
git add ocr-sidecar apps/server apps/web docker-compose.yml .env.example docs/superpowers/plans/2026-07-13-infinte-image-workbench-integration.md
git commit -m "feat: integrate infinte image workbench"
```
