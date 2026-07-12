import { cn } from '@/utils/cn'

export type TagTone = 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'orange'

const toneClasses: Record<TagTone, string> = {
  green: 'text-green border-green/45 bg-green/12',
  blue: 'text-blue border-blue/45 bg-blue/12',
  amber: 'text-amber border-amber/45 bg-amber/12',
  red: 'text-red border-red/45 bg-red/12',
  gray: 'text-gray-400 border-white/12 bg-white/5',
  orange: 'text-orange-400 border-orange-400/45 bg-orange-400/12',
}

export interface TagProps {
  tone?: TagTone
  children: React.ReactNode
  className?: string
  dot?: boolean
}

/** 暗色主题状态标签，约束 #9 配色 */
export function Tag({ tone = 'gray', children, className, dot }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center h-6 px-2.5 rounded-pill border text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {dot && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** 约定状态 -> tag 配色（约束 #9） */
export function statusTone(status: string): TagTone {
  switch (status) {
    case 'live':
    case 'succeeded':
    case 'completed':
    case 'exported':
      return 'green'
    case 'async':
    case 'processing':
    case 'generating':
      return 'blue'
    case 'failed':
      return 'red'
    case 'editable':
      return 'orange'
    case 'reserved':
    case 'draft':
    case 'canceled':
    case 'queued':
    default:
      return 'gray'
  }
}
