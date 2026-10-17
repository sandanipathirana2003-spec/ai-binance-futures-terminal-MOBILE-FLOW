'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtDuration, type EvaluatedSetup } from '@/lib/flow-eval'
import { Card, GradeBadge, Pill, SidePill } from './ui'
import { StepList } from './progress'

export function SetupsScreen({ setups, onOpen }: { setups: EvaluatedSetup[]; onOpen: (s: EvaluatedSetup) => void }) {
  const [showCancelled, setShowCancelled] = useState(false)
  const pending = useMemo(() => setups.filter((s) => s.status === 'PENDING').sort((a, b) => (a.remainingMs ?? 0) - (b.remainingMs ?? 0)), [setups])
  const cancelled = useMemo(() => setups.filter((s) => s.status === 'CANCELLED').slice(0, 30), [setups])

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Pending setups <span className="text-muted-foreground font-mono">({pending.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          aria-pressed={showCancelled}
          className={cn('h-10 rounded-md border px-3 text-xs font-semibold', showCancelled ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary')}
        >
          {showCancelled ? 'Hide' : 'Show'} cancelled ({cancelled.length})
        </button>
      </div>

      {pending.length === 0 ? (
        <Card className="p-4 text-center">
          <p className="text-sm font-semibold">No pending setups</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">A setup appears here the moment a 1M Supertrend flip closes, and stays until the 3M flips, the 1M reverses, or it expires.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {pending.map((s) => (
            <SetupCard key={s.id} s={s} onOpen={onOpen} />
          ))}
        </div>
      )}

      {showCancelled ? (
        <>
          <h2 className="mt-1 text-sm font-semibold">Recently cancelled</h2>
          {cancelled.length === 0 ? (
            <p className="text-muted-foreground text-xs">Nothing cancelled in the last 6 hours.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {cancelled.map((s) => (
                <button key={s.id} type="button" onClick={() => onOpen(s)} className="border-border bg-card min-w-0 rounded-lg border p-3 text-left opacity-90 active:bg-secondary/40">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-bold">{s.symbol}</span>
                    <SidePill side={s.side} />
                    <Pill tone="bear">CANCELLED</Pill>
                  </div>
                  <p className="text-bear mt-1.5 text-[11px] leading-snug break-words">{s.reason}</p>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function SetupCard({ s, onOpen }: { s: EvaluatedSetup; onOpen: (s: EvaluatedSetup) => void }) {
  return (
    <div className="border-border bg-card min-w-0 rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm font-bold">{s.symbol}</span>
          <SidePill side={s.side} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone="warn">{fmtDuration(s.remainingMs ?? 0)} left</Pill>
          <GradeBadge grade={s.grade} />
        </div>
      </div>
      <StepList steps={s.steps} />
      <button type="button" onClick={() => onOpen(s)} className="border-border bg-secondary h-11 w-full rounded-md border text-xs font-semibold">
        Open details &amp; checks
      </button>
    </div>
  )
}
