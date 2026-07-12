import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { useFabricCanvas } from '@/hooks/useFabricCanvas'
import type { CanvasLayer, FabricCanvasHandle } from '@/components/editor/types'

export interface FabricCanvasProps {
  width: number
  height: number
  /** 环境图 URL */
  backgroundImageUrl?: string
  /** 初始图层 */
  initialLayers?: CanvasLayer[]
  /** 选中图层回调 */
  onLayerSelect?: (layer: CanvasLayer | null) => void
  /** 画布变化回调（用于保存项目版本） */
  onCanvasChange?: (json: object) => void
}

export const FabricCanvas = forwardRef<FabricCanvasHandle, FabricCanvasProps>(
  function FabricCanvas(props, ref) {
    const { containerRef, controller, selectedLayer } = useFabricCanvas({
      width: props.width,
      height: props.height,
      backgroundImageUrl: props.backgroundImageUrl,
      initialLayers: props.initialLayers,
      onChange: props.onCanvasChange,
    })

    // 把选中图层同步给父组件
    useEffect(() => {
      props.onLayerSelect?.(selectedLayer)
    }, [selectedLayer, props])

    useImperativeHandle(ref, () => controller, [controller])

    return (
      <div
        className="rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl shadow-black/50"
        style={{ width: props.width, height: props.height }}
      >
        <canvas ref={containerRef} />
      </div>
    )
  },
)
