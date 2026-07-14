// ============================================
// useAnnotations - 把 AIhuabu 的「标注画布」逻辑移植到 Fabric 编辑器
// 工具：选择(移动) / 框选区域(矩形) / 箭头 / 文字批注
// 每条标注都写入 React 状态数组 {id,type,x,y,w,h,text?}，
// 供「重新生成」门控（annotations.length === 0 时禁用）使用。
// 标注本身是 Fabric 对象，因此依然可编辑 / 可被选中删除。
// ============================================
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import fabricDefault from 'fabric'
import type { FabricCanvasHandle } from '@/components/editor/types'
import type { AnnotationType, EditorAnnotation } from '@/services/editor.api'

// 与 useFabricCanvas 一致：优先用 UMD 挂载在 window.fabric 上的真实对象，
// 默认导入作为降级，避免 new fabric.X() 在 Vite 预构建下为 undefined 导致崩溃。
const fabric =
  (fabricDefault && (fabricDefault as any).Canvas)
    ? (fabricDefault as any)
    : (typeof window !== 'undefined' ? (window as any).fabric : fabricDefault) as any

export type AnnotationTool = 'select' | 'rect' | 'arrow' | 'text'

const ANNOTATION_COLOR = '#ff3b30'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** 取对象在画布坐标下的包围盒（含缩放 / 旋转） */
function bbox(obj: any) {
  const b = obj.getBoundingRect(true, true)
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
}

/**
 * 用单条填充 path 画一个带箭头的线段（比 Group(Line+Triangle) 更稳，
 * 在 Fabric v5 下也只有一个对象、一个 annotationId，删除 / 同步更简单）。
 */
function makeArrowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lw: number,
): any {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const headLen = Math.min(len * 0.4, 18 + lw * 2)
  const hw = headLen * 0.55
  const s = Math.max(lw / 2, 2)
  const bx = x2 - ux * headLen
  const by = y2 - uy * headLen
  const pts: Array<[number, number]> = [
    [x1 - px * s, y1 - py * s],
    [x1 + px * s, y1 + py * s],
    [bx + px * s, by + py * s],
    [bx + px * hw, by + py * hw],
    [x2, y2],
    [bx - px * hw, by - py * hw],
    [bx - px * s, by - py * s],
  ]
  const d = 'M ' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ') + ' Z'
  return new fabric.Path(d, { fill: color, strokeWidth: 0, selectable: true, evented: true })
}

export interface UseAnnotationsResult {
  activeTool: AnnotationTool
  setActiveTool: (t: AnnotationTool) => void
  /** 标注列表（门控用：长度 > 0 才允许 regenerate） */
  annotations: EditorAnnotation[]
  /** 清空所有标注对象与状态 */
  clearAnnotations: () => void
}

export function useAnnotations(
  fabricRef: RefObject<FabricCanvasHandle>,
): UseAnnotationsResult {
  const [activeTool, setActiveTool] = useState<AnnotationTool>('select')
  const [annotations, setAnnotations] = useState<EditorAnnotation[]>([])
  const objMap = useRef<Map<string, any>>(new Map())
  const drawing = useRef<{ id: string; obj?: any; startX: number; startY: number } | null>(null)
  const activeToolRef = useRef<AnnotationTool>(activeTool)
  activeToolRef.current = activeTool

  const getCanvas = () => (fabricRef.current?.getCanvas() as any) ?? null

  // 标注对象被删除（用户选中后删除 / 删除键）时同步状态
  const handleRemoved = useCallback((e: any) => {
    const aid = e?.target?.annotationId
    if (!aid) return
    objMap.current.delete(aid)
    setAnnotations((prev) => prev.filter((a) => a.id !== aid))
  }, [])

  // 标注对象被移动 / 缩放后更新坐标
  const handleModified = useCallback((e: any) => {
    const aid = e?.target?.annotationId
    if (!aid) return
    const b = bbox(e.target)
    setAnnotations((prev) => prev.map((a) => (a.id === aid ? { ...a, x: b.x, y: b.y, w: b.w, h: b.h } : a)))
  }, [])

  // 绑定绘制工具 + 同步监听。依赖 activeTool：
  // 画布就绪后只要切到任一标注工具就会重绑；画布未就绪时不绑。
  useEffect(() => {
    const canvas = getCanvas()
    if (!canvas) return

    // 标注工具激活时关闭 Fabric 自带框选，事件直达画布；
    // 选择(移动)模式则恢复正常编辑（可拖动 / 缩放底图与文字）。
    canvas.selection = activeTool === 'select'
    canvas.skipTargetFind = activeTool !== 'select'
    canvas.defaultCursor = activeTool === 'select' ? 'default' : 'crosshair'

    const onDown = (opt: any) => {
      const tool = activeToolRef.current
      if (tool === 'select') return
      const p = canvas.getPointer(opt.e)
      const id = uid()

      // 文字批注：点击即弹窗输入（与 AIhuabu 行为一致）
      if (tool === 'text') {
        const text = window.prompt('输入批注文字：')
        if (!text) return
        const tb = new fabric.Textbox(text, {
          left: p.x,
          top: p.y,
          originX: 'left',
          originY: 'top',
          width: 280,
          fontSize: 28,
          fontFamily: 'Microsoft YaHei',
          fontWeight: 'bold',
          fill: '#1f2937',
          backgroundColor: 'rgba(255,214,0,0.9)',
          padding: 6,
          editable: true,
        })
        tb.annotationId = id
        tb.annotationType = 'text'
        canvas.add(tb)
        objMap.current.set(id, tb)
        setAnnotations((prev) => [...prev, { id, type: 'text', ...bbox(tb), text }])
        canvas.setActiveObject(tb)
        canvas.requestRenderAll()
        return
      }

      // 框选区域 / 箭头：记录起点，创建预览对象
      const obj =
        tool === 'rect'
          ? new fabric.Rect({
              left: p.x,
              top: p.y,
              width: 0,
              height: 0,
              fill: 'rgba(255,59,48,0.12)',
              stroke: ANNOTATION_COLOR,
              strokeWidth: 3,
              strokeDashArray: [8, 4],
              selectable: false,
              evented: false,
            })
          : new fabric.Line([p.x, p.y, p.x, p.y], {
              stroke: ANNOTATION_COLOR,
              strokeWidth: 4,
              strokeLineCap: 'round',
              selectable: false,
              evented: false,
            })
      obj.annotationId = id
      obj.annotationType = tool
      canvas.add(obj)
      drawing.current = { id, obj, startX: p.x, startY: p.y }
    }

    const onMove = (opt: any) => {
      const d = drawing.current
      if (!d) return
      const p = canvas.getPointer(opt.e)
      if (d.obj.type === 'rect' || d.obj.type === 'Rect') {
        d.obj.set({
          left: Math.min(d.startX, p.x),
          top: Math.min(d.startY, p.y),
          width: Math.abs(p.x - d.startX),
          height: Math.abs(p.y - d.startY),
        })
      } else {
        d.obj.set({ x2: p.x, y2: p.y })
      }
      canvas.requestRenderAll()
    }

    const onUp = () => {
      const d = drawing.current
      drawing.current = null
      if (!d) return

      // 太小的绘制视为误触，丢弃
      if (d.obj.type === 'rect' || d.obj.type === 'Rect') {
        if (d.obj.width < 6 && d.obj.height < 6) {
          canvas.remove(d.obj)
          return
        }
        d.obj.set({ selectable: true, evented: true })
        objMap.current.set(d.id, d.obj)
        setAnnotations((prev) => [...prev, { id: d.id, type: 'rect', ...bbox(d.obj) }])
        canvas.setActiveObject(d.obj)
        canvas.requestRenderAll()
        return
      }

      if (Math.abs(d.obj.x2 - d.startX) < 6 && Math.abs(d.obj.y2 - d.startY) < 6) {
        canvas.remove(d.obj)
        return
      }
      // 箭头：用带箭头的 path 替换临时 Line
      const path = makeArrowPath(d.startX, d.startY, d.obj.x2, d.obj.y2, ANNOTATION_COLOR, 4)
      path.annotationId = d.id
      path.annotationType = 'arrow'
      canvas.remove(d.obj)
      canvas.add(path)
      objMap.current.set(d.id, path)
      setAnnotations((prev) => [...prev, { id: d.id, type: 'arrow', ...bbox(path) }])
      canvas.setActiveObject(path)
      canvas.requestRenderAll()
    }

    const onRemovedBound = (e: any) => handleRemoved(e)
    const onModifiedBound = (e: any) => handleModified(e)
    canvas.on('mouse:down', onDown)
    canvas.on('mouse:move', onMove)
    canvas.on('mouse:up', onUp)
    canvas.on('object:removed', onRemovedBound)
    canvas.on('object:modified', onModifiedBound)
    return () => {
      canvas.off('mouse:down', onDown)
      canvas.off('mouse:move', onMove)
      canvas.off('mouse:up', onUp)
      canvas.off('object:removed', onRemovedBound)
      canvas.off('object:modified', onModifiedBound)
    }
  }, [activeTool, handleRemoved, handleModified])

  const clearAnnotations = useCallback(() => {
    const canvas = getCanvas()
    objMap.current.forEach((obj) => {
      if (canvas) canvas.remove(obj)
    })
    objMap.current.clear()
    setAnnotations([])
  }, [])

  return { activeTool, setActiveTool, annotations, clearAnnotations }
}
