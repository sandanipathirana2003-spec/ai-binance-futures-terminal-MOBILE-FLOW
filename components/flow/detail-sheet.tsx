'use client'

import { useEffect } from 'react'
import { CandlestickChart, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/format'
import { fmtDuration, fmtTime, type EvaluatedSetup } from '@/lib/flow-eval'
import { GradeBadge, Pill, Row, SidePill } from './ui'
import { StepList } from './progress'

export function StatusPill({ s }: { s: EvaluatedSetup }) {
  if (s.status === 'CONFIRMED') return <Pill tone={s.active ? 'bull' : 'neutral'}>{s.active ? 'CONFIRMED · ACTIVE' : 'HISTORICAL'}</Pill>
  if (s.status === 'PENDING') return <Pill tone="warn">PENDING</Pill>
  return <Pill tone="bear">CANCELLED</Pill>
}

/** Full-detail bottom sheet (phone) / centered dialog (tablet+). */
export function DetailSheet({ setup, onClose, onOpenChart }: { setup: EvaluatedSetup | null; onClose: () => void; onOpenChart: (symbol: string) => void }) {
  useEffect(() => {
    if (!setup) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setup, onClose])

  if (!setup) return null
  const s = setup
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`${s.symbol} ${s.side} details`}>
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="bg-card border-border relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border-t md:rounded-2xl md:border">
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold">{s.symbol}</span>
            <SidePill side={s.side} />
            <StatusPill s={s} />
            <GradeBadge grade={s.grade} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="hover:bg-secondary flex size-11 shrink-0 items-center justify-center rounded-md">
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {s.reason ? (
            <div className={cn('mb-3 rounded-md border p-2.5 text-xs leading-snug', s.status === 'CANCELLED' ? 'border-bear/30 bg-bear/10 text-bear' : 'border-border')}>
              <p className="font-bold">{s.status === 'CANCELLED' ? 'Why it was cancelled' : 'Note'}</p>
              <p className="mt-0.5">{s.reason}</p>
            </div>
          ) : null}

          <h4 className="text-muted-foreground mb-1 text-[11px] font-semibold uppercase">Sequence</h4>
          <StepList steps={s.steps} />

          <h4 className="text-muted-foreground mt-1 mb-1 text-[11px] font-semibold uppercase">Timing &amp; price</h4>
          <div className="divide-border divide-y">
            <Row label="1M flip">{fmtTime(s.t0)} @ {formatPrice(s.price0)}</Row>
            <Row label="3M confirmation">{s.confirmAt ? `${fmtTime(s.confirmAt)} @ ${s.confirmPrice !== null ? formatPrice(s.confirmPrice) : '—'}` : 'not yet'}</Row>
            {s.confirmAt ? <Row label="1M → 3M gap">{fmtDuration(s.confirmAt - s.t0)}</Row> : null}
            {s.ageMs !== null ? <Row label="Signal age">{fmtDuration(s.ageMs)}</Row> : null}
            {s.remainingMs !== null ? <Row label="Expires in">{fmtDuration(s.remainingMs)}</Row> : null}
          </div>

          {s.checks ? (
            <>
              <h4 className="text-muted-foreground mt-3 mb-1 text-[11px] font-semibold uppercase">Checks {s.checksLive ? '(live values — re-checked at 3M flip)' : '(at the 3M confirmation candle)'}</h4>
              <div className="divide-border divide-y">
                {s.checks.map((c) => (
                  <Row key={c.key} label={`${c.label}${c.required ? '' : ' · optional'}`}>
                    <span className={c.pass ? 'text-bull' : c.required ? 'text-bear' : 'text-muted-foreground'}>
                      {c.value} {c.pass ? 'PASS' : 'FAIL'}
                    </span>
                  </Row>
                ))}
                <Row label="Grade score">{s.score}/100</Row>
              </div>
            </>
          ) : null}
        </div>

        <div className="border-border flex gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => onOpenChart(s.symbol)} className="bg-primary text-primary-foreground flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold">
            <CandlestickChart className="size-4" /> Open chart
          </button>
          <button type="button" onClick={onClose} className="border-border bg-secondary h-11 flex-1 rounded-md border text-sm font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
