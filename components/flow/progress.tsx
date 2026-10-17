import { AlertTriangle, Check, Circle, Loader2, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Step, StepState } from '@/lib/flow-eval'

const ICON: Record<StepState, React.ReactNode> = {
  done: <Check className="size-3.5" />,
  active: <Loader2 className="size-3.5 animate-spin" />,
  waiting: <Circle className="size-3" />,
  warn: <AlertTriangle className="size-3.5" />,
  failed: <X className="size-3.5" />,
  skipped: <Minus className="size-3.5" />,
}

const DOT: Record<StepState, string> = {
  done: 'border-bull bg-bull text-bull-foreground',
  active: 'border-primary bg-primary/15 text-primary',
  waiting: 'border-border bg-secondary text-muted-foreground',
  warn: 'border-warn bg-warn/15 text-warn',
  failed: 'border-bear bg-bear text-bear-foreground',
  skipped: 'border-border bg-secondary/60 text-muted-foreground',
}

const LABEL: Record<StepState, string> = {
  done: 'DONE',
  active: 'IN PROGRESS',
  waiting: 'NOT REACHED',
  warn: 'NOT MET (LIVE)',
  failed: 'FAILED',
  skipped: 'SKIPPED',
}

/** Vertical progress indicator. Every step shows its real state — future steps are never shown as done. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border', DOT[s.state])}>{ICON[s.state]}</span>
            {i < steps.length - 1 ? <span className={cn('my-0.5 w-px flex-1', s.state === 'done' ? 'bg-bull/60' : 'bg-border')} /> : null}
          </div>
          <div className="min-w-0 pb-3">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-bold">
              {s.title}
              <span className={cn('font-mono text-[10px] font-semibold', s.state === 'failed' ? 'text-bear' : s.state === 'done' ? 'text-bull' : s.state === 'warn' || s.state === 'active' ? 'text-warn' : 'text-muted-foreground')}>
                {LABEL[s.state]}
              </span>
            </p>
            <p className="text-muted-foreground text-[11px] leading-snug break-words">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
