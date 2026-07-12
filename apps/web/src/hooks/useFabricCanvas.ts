import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { fabric } from 'fabric'
import type {
  CanvasLayer,
  FabricController,
} from '@/components/editor/types'
import { exportToPNG, exportToSVG, exportToJson } from '@/utils/exportCanvas'

/** 生成唯一 id */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 需要随画布一起序列化的自定义属性 */
const EXTRA_PROPS = [
  'layerId',
  'layerType',
  'name',
  'material',
  'srcLayerContent',
  'locked',
]

/** 发光字阴影（用 shadow 模拟发光效果） */
function makeGlowShadow(color: string): fabric.Shadow {
  return new fabric.Shadow({
    color,
    blur: 18,
    offsetX: 0,
    offsetY: 0,
  })
}

/** 将 fabric 对象转换为 CanvasLayer 数据 */
function objectToLayer(obj: fabric.Object): CanvasLayer {
  const anyObj = obj as unknown as Record<string, any>
  const type = (anyObj.layerType as CanvasLayer['type']) || 'rect'
  const width = (obj.width || 0) * (obj.scaleX || 1)
  const height = (obj.height || 0) * (obj.scaleY || 1)
  return {
    id: anyObj.layerId || uid(),
    type,
    name: (anyObj.name as string) || (type === 'text' ? '发光字' : type === 'image' ? '效果图' : '底板'),
    content: type === 'text' ? (anyObj.text as string) ?? '' : (anyObj.srcLayerContent as string) ?? '',
    x: obj.left ?? 0,
    y: obj.top ?? 0,
    width: Math.round(width || obj.width || 0),
    height: Math.round(height || obj.height || 0),
    angle: obj.angle ?? 0,
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
    fill: (obj.fill as string) || '#ffffff',
    fontFamily: anyObj.fontFamily,
    fontSize: anyObj.fontSize,
    fontWeight: anyObj.fontWeight as string | undefined,
    opacity: obj.opacity ?? 1,
    visible: obj.visible !== false,
    locked: anyObj.locked ?? false,
    material: anyObj.material as string | undefined,
    brightness: anyObj.brightness,
    contrast: anyObj.contrast,
  }
}

/** 把图层补丁应用到 fabric 对象 */
function applyLayerToObject(obj: fabric.Object, patch: Partial<CanvasLayer>) {
  const anyObj = obj as unknown as Record<string, any>
  const set: Record<string, unknown> = {}

  if (patch.x !== undefined) set.left = patch.x
  if (patch.y !== undefined) set.top = patch.y
  if (patch.angle !== undefined) set.angle = patch.angle
  if (patch.scaleX !== undefined) set.scaleX = patch.scaleX
  if (patch.scaleY !== undefined) set.scaleY = patch.scaleY
  if (patch.opacity !== undefined) set.opacity = patch.opacity
  if (patch.visible !== undefined) set.visible = patch.visible
  if (patch.fontFamily !== undefined) set.fontFamily = patch.fontFamily
  if (patch.fontSize !== undefined) set.fontSize = patch.fontSize
  if (patch.fontWeight !== undefined) set.fontWeight = patch.fontWeight
  if (patch.name !== undefined) anyObj.name = patch.name
  if (patch.material !== undefined) anyObj.material = patch.material

  if (patch.content !== undefined && anyObj.layerType === 'text') {
    set.text = patch.content
  }

  if (patch.fill !== undefined) {
    set.fill = patch.fill
    // 文字图层默认保留发光效果，颜色跟随填充
    if (anyObj.layerType === 'text') {
      set.shadow = makeGlowShadow(patch.fill)
    } else {
      set.shadow = null
    }
  }

  if (patch.locked !== undefined) {
    anyObj.locked = patch.locked
    set.lockMovementX = patch.locked
    set.lockMovementY = patch.locked
    set.lockScalingX = patch.locked
    set.lockScalingY = patch.locked
    set.lockRotation = patch.locked
    set.hasControls = !patch.locked
    set.selectable = !patch.locked
  }

  obj.set(set as any)
}

export interface FabricCanvasOptions {
  width: number
  height: number
  backgroundImageUrl?: string
  initialLayers?: CanvasLayer[]
  /** 画布变化回调（导出 JSON 用于保存项目版本） */
  onChange?: (json: object) => void
}

export interface UseFabricCanvasResult {
  containerRef: RefObject<HTMLCanvasElement>
  canvasRef: React.MutableRefObject<fabric.Canvas | null>
  selectedLayer: CanvasLayer | null
  controller: FabricController
}

export function useFabricCanvas(
  options: FabricCanvasOptions,
): UseFabricCanvasResult {
  const { width, height, backgroundImageUrl, initialLayers, onChange } = options

  const containerRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<fabric.Canvas | null>(null)
  const controllerRef = useRef<FabricController | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 历史记录（用于简单撤销/重做）
  const historyRef = useRef<string[]>([])
  const pointerRef = useRef<number>(-1)
  const isLoadingRef = useRef<boolean>(false)
  const bgUrlRef = useRef<string | undefined>(backgroundImageUrl)

  const [selectedLayer, setSelectedLayer] = useState<CanvasLayer | null>(null)

  // 同步当前选中图层到 React 状态
  const syncSelected = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const active = canvas.getActiveObject() as fabric.Object | undefined
    if (!active) {
      setSelectedLayer(null)
      return
    }
    setSelectedLayer(objectToLayer(active))
  }

  const commit = () => {
    const canvas = canvasRef.current
    if (!canvas || isLoadingRef.current) return
    const json = JSON.stringify(canvas.toJSON(EXTRA_PROPS))
    // 丢弃 redo 分支
    historyRef.current = historyRef.current.slice(0, pointerRef.current + 1)
    historyRef.current.push(json)
    pointerRef.current = historyRef.current.length - 1
    onChangeRef.current?.(canvas.toJSON(EXTRA_PROPS))
  }

  const loadSnapshot = (json: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    isLoadingRef.current = true
    canvas.loadFromJSON(json, () => {
      canvas.renderAll()
      isLoadingRef.current = false
      syncSelected()
      onChangeRef.current?.(canvas.toJSON(EXTRA_PROPS))
    })
  }

  // ===== 初始化 Fabric 画布 =====
  useEffect(() => {
    if (!containerRef.current) return

    const canvas = new fabric.Canvas(containerRef.current, {
      width,
      height,
      backgroundColor: '#0b0d10',
      preserveObjectStacking: true,
      selection: true,
    })

    // 选中控制手柄样式：蓝色圆点
    fabric.Object.prototype.set({
      transparentCorners: false,
      cornerColor: '#4aa8ff',
      cornerStrokeColor: '#4aa8ff',
      borderColor: '#4aa8ff',
      cornerStyle: 'circle',
      cornerSize: 11,
      padding: 4,
      borderScaleFactor: 1.5,
    })

    canvasRef.current = canvas

    // ---- 内部方法 ----
    const setBackground = (url: string) => {
      fabric.Image.fromURL(
        url,
        (img) => {
          if (!img.width || !img.height) {
            canvas.renderAll()
            return
          }
          const scale = Math.max(width / img.width, height / img.height)
          img.set({
            originX: 'center',
            originY: 'center',
            left: width / 2,
            top: height / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
          })
          canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas))
          commit()
        },
        { crossOrigin: 'anonymous' },
      )
    }

    const addText = (opts?: Partial<CanvasLayer>) => {
      const id = opts?.id || uid()
      const fill = opts?.fill || '#ffffff'
      const tb = new fabric.Textbox(opts?.content || '双击编辑文字', {
        left: opts?.x ?? width / 2,
        top: opts?.y ?? height / 2,
        originX: 'center',
        originY: 'center',
        width: opts?.width ?? 360,
        fontSize: opts?.fontSize ?? 64,
        fontFamily: opts?.fontFamily ?? 'Microsoft YaHei',
        fontWeight: (opts?.fontWeight as any) ?? 'bold',
        fill,
        angle: opts?.angle ?? 0,
        scaleX: opts?.scaleX ?? 1,
        scaleY: opts?.scaleY ?? 1,
        opacity: opts?.opacity ?? 1,
        textAlign: 'center',
        shadow: makeGlowShadow(fill),
      })
      tb.set({
        layerId: id,
        layerType: 'text',
        name: opts?.name ?? '发光字',
        material: opts?.material,
      } as any)
      canvas.add(tb)
      canvas.setActiveObject(tb)
      canvas.requestRenderAll()
      commit()
      syncSelected()
    }

    const addImage = (url: string, opts?: Partial<CanvasLayer>) => {
      fabric.Image.fromURL(
        url,
        (img) => {
          if (!img.width) {
            canvas.requestRenderAll()
            return
          }
          const baseW = opts?.width ?? 260
          const scale = (baseW / img.width) * (opts?.scaleX ?? 1)
          img.set({
            left: opts?.x ?? width / 2,
            top: opts?.y ?? height / 2,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale * (opts?.scaleY ?? 1),
            angle: opts?.angle ?? 0,
            opacity: opts?.opacity ?? 1,
          })
          const id = opts?.id || uid()
          img.set({
            layerId: id,
            layerType: 'image',
            name: opts?.name ?? '效果图',
            srcLayerContent: url,
          } as any)
          canvas.add(img)
          canvas.setActiveObject(img)
          canvas.requestRenderAll()
          commit()
          syncSelected()
        },
        { crossOrigin: 'anonymous' },
      )
    }

    const addRect = (opts?: Partial<CanvasLayer>) => {
      const id = opts?.id || uid()
      const fill = opts?.fill || '#1f2730'
      const rect = new fabric.Rect({
        left: opts?.x ?? width / 2,
        top: opts?.y ?? height / 2,
        originX: 'center',
        originY: 'center',
        width: opts?.width ?? 480,
        height: opts?.height ?? 120,
        fill,
        rx: 6,
        ry: 6,
        angle: opts?.angle ?? 0,
        scaleX: opts?.scaleX ?? 1,
        scaleY: opts?.scaleY ?? 1,
        opacity: opts?.opacity ?? 1,
      })
      rect.set({
        layerId: id,
        layerType: 'rect',
        name: opts?.name ?? '底板',
        material: opts?.material,
      } as any)
      canvas.add(rect)
      canvas.setActiveObject(rect)
      canvas.requestRenderAll()
      commit()
      syncSelected()
    }

    const updateSelected = (patch: Partial<CanvasLayer>) => {
      const active = canvas.getActiveObject() as fabric.Object | undefined
      if (!active) return
      applyLayerToObject(active, patch)
      canvas.requestRenderAll()
      commit()
      syncSelected()
    }

    const removeSelected = () => {
      const active = canvas.getActiveObject()
      if (!active) return
      canvas.remove(active)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      commit()
      syncSelected()
    }

    const duplicateSelected = () => {
      const active = canvas.getActiveObject() as fabric.Object | undefined
      if (!active) return
      active.clone(
        (cloned: fabric.Object) => {
          const anyCloned = cloned as unknown as Record<string, any>
          anyCloned.layerId = uid()
          anyCloned.name = `${anyCloned.name || '图层'} 副本`
          cloned.set({
            left: (active.left ?? 0) + 24,
            top: (active.top ?? 0) + 24,
          })
          canvas.add(cloned)
          canvas.setActiveObject(cloned)
          canvas.requestRenderAll()
          commit()
          syncSelected()
        },
        EXTRA_PROPS as any,
      )
    }

    const bringForward = () => {
      const active = canvas.getActiveObject()
      if (!active) return
      canvas.bringForward(active)
      canvas.requestRenderAll()
      commit()
    }

    const sendBackward = () => {
      const active = canvas.getActiveObject()
      if (!active) return
      canvas.sendBackwards(active)
      canvas.requestRenderAll()
      commit()
    }

    const undo = () => {
      if (pointerRef.current <= 0) return
      pointerRef.current -= 1
      loadSnapshot(historyRef.current[pointerRef.current])
    }

    const redo = () => {
      if (pointerRef.current >= historyRef.current.length - 1) return
      pointerRef.current += 1
      loadSnapshot(historyRef.current[pointerRef.current])
    }

    const updateImageFilter = (patch: {
      brightness?: number
      contrast?: number
    }) => {
      const active = canvas.getActiveObject() as unknown as Record<string, any>
      if (!active || active.layerType !== 'image') return
      const brightness =
        patch.brightness !== undefined
          ? patch.brightness
          : (active.brightness ?? 0)
      const contrast =
        patch.contrast !== undefined ? patch.contrast : (active.contrast ?? 0)
      active.brightness = brightness
      active.contrast = contrast

      const filters: any[] = []
      if (brightness !== 0) {
        filters.push(
          new fabric.Image.filters.Brightness({ brightness } as any),
        )
      }
      if (contrast !== 0) {
        filters.push(new fabric.Image.filters.Contrast({ contrast } as any))
      }
      active.filters = filters
      active.applyFilters()
      canvas.requestRenderAll()
      commit()
      syncSelected()
    }

    const exportJSON = () => exportToJson(canvas, EXTRA_PROPS) as Record<string, unknown>
    const exportPNG = () => exportToPNG(canvas)
    const exportSVG = () => exportToSVG(canvas)
    const getCanvas = () => canvas

    const getSelectedLayer = () => {
      const active = canvas.getActiveObject() as fabric.Object | undefined
      return active ? objectToLayer(active) : null
    }

    controllerRef.current = {
      addText,
      addImage,
      addRect,
      updateSelected,
      updateImageFilter,
      removeSelected,
      duplicateSelected,
      bringForward,
      sendBackward,
      undo,
      redo,
      exportJSON,
      exportPNG,
      exportSVG,
      setBackgroundImage: setBackground,
      getSelectedLayer,
      getCanvas,
    }

    // 事件监听
    const onSelectionCreated = () => syncSelected()
    const onSelectionUpdated = () => syncSelected()
    const onSelectionCleared = () => syncSelected()
    const onObjectModified = () => {
      syncSelected()
      commit()
    }
    const onObjectAdded = () => {
      if (!isLoadingRef.current) commit()
    }
    const onObjectRemoved = () => {
      if (!isLoadingRef.current) commit()
    }

    canvas.on('selection:created', onSelectionCreated)
    canvas.on('selection:updated', onSelectionUpdated)
    canvas.on('selection:cleared', onSelectionCleared)
    canvas.on('object:modified', onObjectModified)
    canvas.on('object:added', onObjectAdded)
    canvas.on('object:removed', onObjectRemoved)

    // 初始化背景图
    if (backgroundImageUrl) {
      setBackground(backgroundImageUrl)
    }

    // 初始化图层
    if (initialLayers && initialLayers.length) {
      initialLayers.forEach((layer) => {
        if (layer.type === 'text') addText(layer)
        else if (layer.type === 'image') addImage(layer.content, layer)
        else addRect(layer)
      })
    }

    // 记录初始历史快照
    commit()

    return () => {
      canvas.off('selection:created', onSelectionCreated)
      canvas.off('selection:updated', onSelectionUpdated)
      canvas.off('selection:cleared', onSelectionCleared)
      canvas.off('object:modified', onObjectModified)
      canvas.off('object:added', onObjectAdded)
      canvas.off('object:removed', onObjectRemoved)
      controllerRef.current = null
      canvas.dispose()
      canvasRef.current = null
    }
    // 仅依赖尺寸，避免重复初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])

  // 背景图变化响应
  useEffect(() => {
    if (backgroundImageUrl && backgroundImageUrl !== bgUrlRef.current) {
      bgUrlRef.current = backgroundImageUrl
      controllerRef.current?.setBackgroundImage(backgroundImageUrl)
    }
  }, [backgroundImageUrl])

  // 稳定的控制器包装
  const controller = useMemo<FabricController>(
    () => ({
      addText: (o) => controllerRef.current?.addText(o),
      addImage: (u, o) => controllerRef.current?.addImage(u, o),
      addRect: (o) => controllerRef.current?.addRect(o),
      updateSelected: (p) => controllerRef.current?.updateSelected(p),
      updateImageFilter: (p) => controllerRef.current?.updateImageFilter(p),
      removeSelected: () => controllerRef.current?.removeSelected(),
      duplicateSelected: () => controllerRef.current?.duplicateSelected(),
      bringForward: () => controllerRef.current?.bringForward(),
      sendBackward: () => controllerRef.current?.sendBackward(),
      undo: () => controllerRef.current?.undo(),
      redo: () => controllerRef.current?.redo(),
      exportJSON: () => controllerRef.current?.exportJSON() ?? {},
      exportPNG: () => controllerRef.current?.exportPNG() ?? '',
      exportSVG: () => controllerRef.current?.exportSVG() ?? '',
      setBackgroundImage: (u) => controllerRef.current?.setBackgroundImage(u),
      getSelectedLayer: () => controllerRef.current?.getSelectedLayer() ?? null,
      getCanvas: () => controllerRef.current?.getCanvas() ?? null,
    }),
    [],
  )

  return { containerRef, canvasRef, selectedLayer, controller }
}
