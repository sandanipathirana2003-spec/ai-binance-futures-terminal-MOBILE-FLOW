'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Dir, Grade, Side } from '@/lib/flow-types'

export function dirTone(d: Dir | 'BULL' | 'BEAR' | 'UP' | 'DOWN' | 'BULLISH' | 'BEARISH' | 'MIXED' | 'LONG' | 'SHORT' | 'FLAT' | 'MIXED' | null | undefined) {
  if (d === 'UP' || d === 'BULL' || d === 'BULLISH' || d === 'LONG') return 'bull'
  if (d === 'DOWN' || d === 'BEAR' || d === 'BEARISH' || d === 'SHORT') return 'bear'
  return 'neutral'
}

const TONE: Record<string, string> = {
  bull: 'border-bull/30 bg-bull/10 text-bull',
  bear: 'border-bear/30 bg-bear/10 text-bear',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  neutral: 'border-border bg-secondary/40 text-muted-foreground',
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'bull' | 'bear' | 'warn' | 'neutral'; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold leading-tight whitespace-nowrap', TONE[tone], className)}>
      {children}
    </span>
  )
}

export function DirPill({ value, label }: { value: Parameters<typeof dirTone>[0]; label?: string }) {
  return <Pill tone={dirTone(value) as 'bull' | 'bear' | 'neutral'}>{label ?? value ?? '—'}</Pill>
}

export function SidePill({ side }: { side: Side }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-extrabold tracking-wide',
        side === 'LONG' ? 'bg-bull text-bull-foreground' : 'bg-bear text-bear-foreground',
      )}
    >
      {side}
    </span>
  )
}

export function GradeBadge({ grade }: { grade: Grade | null }) {
  const tone = grade === 'A' ? 'bull' : grade === 'B' ? 'bull' : grade === 'C' ? 'warn' : 'neutral'
  return <Pill tone={tone}>{grade ? `GRADE ${grade}` : 'NO GRADE'}</Pill>
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('border-border bg-card min-w-0 rounded-lg border', className)}>{children}</div>
}

export function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-start justify-between gap-3 py-1.5 text-xs', className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right font-mono font-semibold break-words">{children}</span>
    </div>
  )
}

export function Collapsible({ title, subtitle, defaultOpen = false, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle ? <span className="text-muted-foreground block text-[11px]">{subtitle}</span> : null}
        </span>
        <ChevronDown className={cn('text-muted-foreground size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={id} className="border-border flex flex-col gap-3 border-t p-3">
          {children}
        </div>
      ) : null}
    </Card>
  )
}

export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="text-muted-foreground block text-[11px] leading-snug">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-40',
          checked ? 'border-primary bg-primary' : 'border-border bg-secondary',
        )}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-0.5')} />
      </button>
    </div>
  )
}

export function NumField({ label, hint, value, onChange, min, max, step = 1 }: { label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm">
        {label}
        {hint ? <span className="text-muted-foreground block text-[11px] leading-snug">{hint}</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className="border-border bg-secondary/50 focus:ring-ring h-11 w-24 shrink-0 rounded-md border px-2 text-right font-mono text-base outline-none focus:ring-2"
      />
    </div>
  )
}

export function SelectField<T extends string>({ label, hint, value, onChange, options }: { label: string; hint?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm">
        {label}
        {hint ? <span className="text-muted-foreground block text-[11px] leading-snug">{hint}</span> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="border-border bg-secondary/50 focus:ring-ring h-11 max-w-[55%] min-w-0 shrink-0 rounded-md border px-2 text-base outline-none focus:ring-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
