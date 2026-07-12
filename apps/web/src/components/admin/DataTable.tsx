import { cn } from '@/utils/cn'

export interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (row: T, index: number) => React.ReactNode
  className?: string
  headerClassName?: string
  width?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  /** 行 key 提取 */
  rowKey?: (row: T, index: number) => string | number
  emptyText?: string
  /** 每次渲染的骨架行数 */
  skeletonRows?: number
  onRowClick?: (row: T) => void
  className?: string
}

/** 可复用暗色主题数据表格：斑马纹 + 暗色表头 + loading 骨架 + 空状态 */
export function DataTable<T>({
  columns,
  data,
  loading = false,
  rowKey,
  emptyText = '暂无数据',
  skeletonRows = 6,
  onRowClick,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-hidden rounded-card border border-border', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-panel-2/80 text-left text-xs uppercase tracking-wide text-muted">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn('whitespace-nowrap px-4 py-3 font-medium', col.headerClassName)}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, r) => (
                  <tr key={`sk-${r}`} className="border-t border-border">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-white/8" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.map((row, i) => (
                  <tr
                    key={rowKey ? rowKey(row, i) : i}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-t border-border transition-colors',
                      i % 2 === 1 ? 'bg-white/[0.02]' : 'bg-transparent',
                      onRowClick && 'cursor-pointer hover:bg-white/5',
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('whitespace-nowrap px-4 py-3 text-text', col.className)}
                      >
                        {col.cell(row, i)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!loading && data.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
          <span className="text-sm text-muted">{emptyText}</span>
        </div>
      )}
    </div>
  )
}
