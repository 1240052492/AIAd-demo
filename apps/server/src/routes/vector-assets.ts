import { Router, Request, Response, NextFunction } from 'express'
import { requirePermission } from '../middleware/auth'
import { prisma } from '../config'
import { creditService } from '../services/credit.service'
import { creditRuleService } from '../services/credit-rule.service'
import { FileStorage } from '../utils/file'

const router = Router()

function isUnsafeSvg(svg: string): boolean {
  return /<script[\s>]/i.test(svg) || /\son[a-z]+\s*=/i.test(svg) || /javascript:/i.test(svg)
}

router.post('/', requirePermission('canExport'), async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user!.id
  let frozen = 0
  try {
    const svg = String(req.body?.svg || '').trim()
    const projectId = req.body?.projectId ? String(req.body.projectId) : undefined
    const jobId = req.body?.jobId ? String(req.body.jobId) : undefined
    if (!svg.startsWith('<svg')) {
      return res.status(400).json({ code: 400, message: 'svg 为必填项', data: null })
    }
    if (isUnsafeSvg(svg)) {
      return res.status(400).json({ code: 400, message: 'svg 包含不安全内容', data: null })
    }
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
      if (!project) return res.status(403).json({ code: 403, message: '项目不存在或无权操作', data: null })
    }
    if (jobId) {
      const job = await prisma.generationJob.findFirst({ where: { id: jobId, userId } })
      if (!job) return res.status(403).json({ code: 403, message: '任务不存在或无权操作', data: null })
    }

    frozen = await creditRuleService.getCost('exportSvg')
    if (frozen > 0) {
      await creditService.freeze(userId, frozen, { reason: '导出 SVG 矢量图', relatedType: 'export' })
    }

    const saved = await FileStorage.save(Buffer.from(svg, 'utf8'), 'vector.svg', 'exports')
    const asset = await prisma.asset.create({
      data: {
        userId,
        projectId: projectId || null,
        generationJobId: jobId || null,
        type: 'export_svg',
        storageKey: saved.storageKey,
        url: saved.url,
        mimeType: 'image/svg+xml',
        size: saved.size,
        metadataJson: { source: 'workbench-vector' },
      },
    })

    if (frozen > 0) {
      await creditService.consume(userId, frozen, {
        reason: '导出 SVG 矢量图完成',
        relatedType: 'export',
        relatedId: asset.id,
      })
    }

    return res.json({ code: 0, message: 'ok', data: { asset } })
  } catch (err) {
    if (frozen > 0) {
      await creditService
        .refund(userId, frozen, { reason: '导出 SVG 失败退回', relatedType: 'export' })
        .catch(() => undefined)
    }
    return next(err)
  }
})

export const vectorAssetRoutes = router
