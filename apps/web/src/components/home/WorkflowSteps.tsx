import { WORKFLOW_STEPS } from '@/types'
import { cn } from '@/utils/cn'

interface WorkflowStepsProps {
  /** 当前高亮步骤索引（0 起），默认 0 */
  currentStep?: number
  className?: string
}

/**
 * 工作流步骤条：横排渲染 WORKFLOW_STEPS。
 * 每个步骤含 icon emoji、名称（蓝色）、描述（灰色）。
 * 高亮当前步骤并连接箭头。
 */
export default function WorkflowSteps({ currentStep = 0, className }: WorkflowStepsProps) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex min-w-max items-stretch gap-2">
        {WORKFLOW_STEPS.map((step, idx) => {
          const active = idx === currentStep
          const done = idx < currentStep
          return (
            <div key={step.role} className="flex items-stretch">
              <div
                className={cn(
                  'flex w-[150px] flex-col rounded-card border p-3 transition-all duration-150',
                  active
                    ? 'border-blue/60 bg-blue/10'
                    : done
                      ? 'border-green/40 bg-green/5'
                      : 'border-border bg-panel/70',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-pill bg-white/5 text-base',
                      active && 'bg-white/10',
                    )}
                  >
                    {step.icon}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] font-semibold',
                      active ? 'text-blue' : done ? 'text-green' : 'text-text',
                    )}
                  >
                    {step.name}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{step.description}</p>
              </div>

              {idx < WORKFLOW_STEPS.length - 1 && (
                <div className="flex items-center px-1 text-muted/40">
                  <span className="text-lg">→</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
