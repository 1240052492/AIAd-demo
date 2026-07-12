import { useCallback, useRef, useState } from 'react'
import { UploadCloud, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { projectApi } from '@/services/api'

/** 内置示例门头图（SVG 占位，模拟客户门店环境） */
const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2230"/><stop offset="1" stop-color="#0d0f12"/>
    </linearGradient>
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4aa8ff"/><stop offset="1" stop-color="#7cc7ff"/>
    </linearGradient>
  </defs>
  <rect width="640" height="420" fill="url(#sky)"/>
  <rect x="60" y="70" width="520" height="200" rx="10" fill="#161a20" stroke="#2a313c"/>
  <rect x="80" y="90" width="480" height="60" rx="6" fill="url(#board)"/>
  <text x="320" y="128" font-family="Microsoft YaHei, Arial" font-size="30" font-weight="700" fill="#07121d" text-anchor="middle">示例门头招牌</text>
  <rect x="80" y="170" width="140" height="80" rx="4" fill="#20262f"/>
  <rect x="250" y="170" width="140" height="80" rx="4" fill="#20262f"/>
  <rect x="420" y="170" width="140" height="80" rx="4" fill="#20262f"/>
  <rect x="60" y="295" width="520" height="125" fill="#11151b"/>
  <text x="320" y="370" font-family="Microsoft YaHei, Arial" font-size="16" fill="#a8b1c0" text-anchor="middle">门店环境 · 上传客户实拍图更佳</text>
</svg>`)

interface EnvironmentUploadProps {
  /** 关联的项目 ID（存在时上传会调用接口） */
  projectId?: string
  /** 自定义示例图 URL，默认使用内置示例门头图 */
  sampleImage?: string
  /** 上传完成回调，返回可用图片地址 */
  onUploaded?: (url: string) => void
  className?: string
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'

/**
 * 环境图上传组件：支持拖拽 / 点击上传，本地预览，
 * 若提供 projectId 则调用 projectApi.uploadAsset 上传到服务端。
 */
export default function EnvironmentUpload({
  projectId,
  sampleImage,
  onUploaded,
  className,
}: EnvironmentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string>(sampleImage ?? SAMPLE_IMAGE)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string>('')

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setStatus('error')
        setError('请上传图片文件')
        return
      }
      setError('')
      setFileName(file.name)

      // 本地预览
      const localUrl = URL.createObjectURL(file)
      setPreview(localUrl)
      setStatus('uploading')

      try {
        if (projectId) {
          const res = await projectApi.uploadAsset(projectId, file)
          const url =
            (res.data as { url?: string } | undefined)?.url ?? localUrl
          onUploaded?.(url)
        } else {
          // 无项目时仅本地预览
          onUploaded?.(localUrl)
        }
        setStatus('done')
      } catch (e) {
        setStatus('error')
        setError(e instanceof Error ? e.message : '上传失败')
      }
    },
    [projectId, onUploaded],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFile(file)
      // 允许重复选择同一文件
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* 预览区 */}
      <div className="relative overflow-hidden rounded-card border border-border bg-bg/60">
        <img src={preview} alt="客户环境图" className="h-44 w-full object-cover" />
        {status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
            <Loader2 className="h-6 w-6 animate-spin text-blue" />
          </div>
        )}
        {status === 'done' && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-pill bg-green/15 px-2 py-1 text-xs font-medium text-green">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已上传
          </div>
        )}
      </div>

      {/* 上传区 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed border-border bg-panel/50 px-4 py-5 text-center transition-all duration-150',
          'hover:border-blue/50 hover:bg-panel-2',
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted" />
        <p className="text-sm text-text">
          拖拽图片到此处，或 <span className="text-blue">点击上传</span>
        </p>
        <p className="text-xs text-muted">支持 JPG / PNG / WEBP，建议上传客户门店实拍图</p>
        {fileName && <p className="mt-1 truncate text-xs text-muted">已选择：{fileName}</p>}
        {error && <p className="mt-1 text-xs text-red">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
      </div>
    </div>
  )
}
