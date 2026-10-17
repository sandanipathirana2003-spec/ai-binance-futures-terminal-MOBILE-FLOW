'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/lib/format'
import { fmtDuration, fmtTime, type EvaluatedSetup } from '@/lib/flow-eval'
import { Card, GradeBadge, Pill, SidePill } from './ui'

type View = 'ACTIVE' | 'HISTORICAL'
type SideFilter = 'ALL' | 'LONG' | 'SHORT'

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="bg-secondary/50 flex rounded-md p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-10 min-w-0 flex-1 rounded px-3 text-xs font-semibold', value === o.value ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SignalsScreen({ setups, onOpen, now }: { setups: EvaluatedSetup[]; onOpen: (s: EvaluatedSetup) => void; now: number }) {
  const [view, setView] = useState<View>('ACTIVE')
  const [side, setSide] = useState<SideFilter>('ALL')
  const [q, setQ] = useState('')

  const confirmed = useMemo(() => setups.filter((s) => s.status === 'CONFIRMED'), [setups])
  const activeCount = confirmed.filter((s) => s.active).length
  const list = useMemo(
    () =>
      confirmed
        .filter((s) => (view === 'ACTIVE' ? s.active : !s.active))
        .filter((s) => side === 'ALL' || s.side === side)
        .filter((s) => !q.trim() || s.symbol.toLowerCase().includes(q.trim().toLowerCase())),
    [confirmed, view, side, q],
  )

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <Seg
          value={view}
          onChange={setView}
          options={[
            { value: 'ACTIVE', label: `Confirmed · active (${activeCount})` },
            { value: 'HISTORICAL', label: `Historical (${confirmed.length - activeCount})` },
          ]}
        />
        <div className="flex gap-2">
          <div className="w-40 shrink-0">
            <Seg
              value={side}
              onChange={setSide}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'LONG', label: 'Long' },
                { value: 'SHORT', label: 'Short' },
              ]}
            />
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pair…"
            aria-label="Search pair"
            className="border-border bg-secondary/50 focus:ring-ring h-11 min-w-0 flex-1 rounded-md border px-3 text-base outline-none focus:ring-2"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="p-4 text-center">
          <p className="text-sm font-semibold">{view === 'ACTIVE' ? 'No active confirmed signals' : 'No historical signals'}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {view === 'ACTIVE'
              ? 'A signal appears only after the 1M flip, MA ribbon/VIDYA check, and 3M flip all pass. Pending sequences are on the Setups tab.'
              : 'Confirmed signals older than the active window move here (last 6 hours scanned).'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {list.map((s) => (
            <SignalCard key={s.id} s={s} now={now} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function Mini({ ok, label }: { ok: boolean; label: string }) {
  return <Pill tone={ok ? 'bull' : 'bear'}>{label} {ok ? 'PASS' : 'FAIL'}</Pill>
}

function SignalCard({ s, now, onOpen }: { s: EvaluatedSetup; now: number; onOpen: (s: EvaluatedSetup) => void }) {
  const c = (k: string) => s.checks?.find((x) => x.key === k)
  const age = s.confirmAt ? fmtDuration(now - s.confirmAt) : '—'
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      className={cn('border-border bg-card block w-full min-w-0 rounded-lg border p-3 text-left active:bg-secondary/40', s.active ? (s.side === 'LONG' ? 'border-l-bull border-l-4' : 'border-l-bear border-l-4') : 'opacity-80')}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm font-bold">{s.symbol}</span>
          <SidePill side={s.side} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone={s.active ? 'bull' : 'neutral'}>{s.active ? 'ACTIVE' : 'HISTORICAL'}</Pill>
          <GradeBadge grade={s.grade} />
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Confirm price</dt>
          <dd className="font-mono font-semibold">{s.confirmPrice !== null ? formatPrice(s.confirmPrice) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Age</dt>
          <dd className="font-mono font-semibold">{age}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">1M flip</dt>
          <dd className="font-mono font-semibold">{fmtTime(s.t0)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">3M confirmed</dt>
          <dd className="font-mono font-semibold">{fmtTime(s.confirmAt)}</dd>
        </div>
      </dl>
      <div className="mt-2 flex flex-wrap gap-1">
        <Pill tone={c('main')?.pass ? 'bull' : 'bear'}>MAIN {s.mainTrend}</Pill>
        <Mini ok={!!c('ribbon')?.pass} label="RIBBON" />
        <Mini ok={!!c('vidya')?.pass} label="VIDYA" />
        <Pill tone={c('adx')?.pass ? 'bull' : 'bear'}>ADX {c('adx')?.value}</Pill>
        <Pill tone={c('volume')?.pass ? 'bull' : 'bear'}>VOL {c('volume')?.value}</Pill>
      </div>
    </button>
  )
}
