import { Router, Request, Response, NextFunction } from 'express'
import { requirePermission } from '../middleware/auth'
import { prisma, compositionQueue, env } from '../config'
import { creditService } from '../services/credit.service'
import { creditRuleService } from '../services/credit-rule.service'
import { enqueueCreditCompensation } from '../workers/credit-compensation'

const router = Router()

type ComposePosition = {
  x: number
  y: number
  width: number
  height: number
}

function parsePosition(value: unknown): ComposePosition | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const position = {
    x: Number(record.x),
    y: Number(record.y),
    width: Number(record.width),
    height: Number(record.height),
  }
  const values = Object.values(position)
  if (values.some((item) => !Number.isFinite(item))) return undefined
  if (position.width <= 0 || position.height <= 0) return undefined
  return {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y)),
    width: Math.round(position.width),
    height: Math.round(position.height),
  }
}

function normalizeRequiredVisibleTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((item) => String(item || '').trim().replace(/\s+/g, ' '))
    .filter((item) => item.length > 0 && item.length <= 80)
    .filter((item) => {
      const key = item.toLocaleLowerCase().replace(/\s+/g, '')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

router.post('/', requirePermission('canCompose'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, environmentAssetId, designAssetId } = req.body ?? {}
    const userId = req.user!.id
    if (!projectId || !environmentAssetId || !designAssetId) {
      return res.status(400).json({
        code: 400,
        message: 'projectId、environmentAssetId、designAssetId 为必填项',
        data: null,
      })
    }

    const project = await prisma.project.findFirst({ where: { id: String(projectId), userId } })
    if (!project) {
      return res.status(403).json({ code: 403, message: '项目不存在或无权操作', data: null })
    }

    const [environmentAsset, designAsset] = await Promise.all([
      prisma.asset.findFirst({
        where: {
          id: String(environmentAssetId),
          userId,
          projectId: project.id,
          type: 'upload_environment',
        },
      }),
      prisma.asset.findFirst({
        where: {
          id: String(designAssetId),
          userId,
          projectId: project.id,
          type: 'generated_design',
        },
      }),
    ])

    if (!environmentAsset) {
      return res.status(404).json({ code: 404, message: '环境图不存在或无权访问', data: null })
    }
    if (!designAsset) {
      return res.status(404).json({ code: 404, message: '设计原图不存在或无权访问', data: null })
    }

    const creditCost = await creditRuleService.getCost('composition')
    const position = parsePosition(req.body.position)
    const outputFormat = req.body.outputFormat === 'jpeg' ? 'jpeg' : 'png'
    const requiredVisibleTexts = normalizeRequiredVisibleTexts(req.body.requiredVisibleTexts)
    const genJob = await prisma.generationJob.create({
      data: {
        userId,
        projectId: project.id,
        provider: 'local',
        model: 'composition-v1',
        jobType: 'composition',
        status: 'queued',
        requestJson: {
          environmentAssetId: environmentAsset.id,
          designAssetId: designAsset.id,
          position,
          outputFormat,
          requiredVisibleTexts,
        },
        creditsFrozen: creditCost,
      },
    })

    try {
      if (creditCost > 0) {
        await creditService.freeze(userId, creditCost, {
          reason: '提交环境合成任务',
          relatedType: 'job',
          relatedId: genJob.id,
        })
      }

      await compositionQueue.add('compose', {
        jobId: genJob.id,
        userId,
        projectId: project.id,
        environmentAssetId: environmentAsset.id,
        designAssetId: designAsset.id,
        position,
        outputFormat,
        creditsFrozen: creditCost,
      })
    } catch (err) {
      await prisma.generationJob
        .update({
          where: { id: genJob.id },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
        .catch(() => undefined)
      if (creditCost > 0) {
        await enqueueCreditCompensation({
          type: 'refund',
          userId,
          credits: creditCost,
          reason: '环境合成任务入队失败退回积分',
          relatedType: 'job',
          relatedId: genJob.id,
        })
      }
      return next(err)
    }

    return res.json({ code: 0, message: 'ok', data: { jobId: genJob.id, status: 'queued' } })
  } catch (err) {
    return next(err)
  }
})

export const compositionJobRoutes = router
