'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { chartIndicators, type ChartIndicators } from '@/lib/flow-engine'
import { paramsOf, type FlowSettings } from '@/lib/flow-types'
import { CandleChart, OVERLAY_COLORS, type ChartCandle, type Overlays } from './candle-chart'
import { Card } from './ui'

const TFS = ['1m', '3m', '5m'] as const
type Tf = (typeof TFS)[number]

interface KlinesResponse {
  candles: ChartCandle[]
  updatedAt: number
  error?: string
}

const fetcher = async (url: string): Promise<KlinesResponse> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const body = (await res.json()) as KlinesResponse
  if (!res.ok) throw new Error(body.error ?? `Server returned ${res.status}`)
  return body
}

const DEFAULT_OVERLAYS: Overlays = { ema7: true, ema25: true, ema99: true, st: true, vidya: true, vol: true }

const CHIPS: { key: keyof Overlays; label: string; color?: string }[] = [
  { key: 'st', label: 'Supertrend' },
  { key: 'ema7', label: 'EMA 7', color: OVERLAY_COLORS.ema7 },
  { key: 'ema25', label: 'EMA 25', color: OVERLAY_COLORS.ema25 },
  { key: 'ema99', label: 'EMA 99', color: OVERLAY_COLORS.ema99 },
  { key: 'vidya', label: 'VIDYA', color: OVERLAY_COLORS.vidya },
  { key: 'vol', label: 'Volume' },
]

export function ChartsScreen({ symbol, settings }: { symbol: string; settings: FlowSettings }) {
  const [tf, setTf] = useState<Tf>('3m')
  const [overlays, setOverlays] = useState<Overlays>(DEFAULT_OVERLAYS)
  const [full, setFull] = useState(false)
  const [vh, setVh] = useState(640)
  const [fullH, setFullH] = useState(400)
  const fullRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = () => setVh(window.innerHeight)
    on()
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  useEffect(() => {
    if (!full) return
    const el = fullRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFullH(Math.max(200, Math.floor(el.clientHeight))))
    ro.observe(el)
    setFullH(Math.max(200, Math.floor(el.clientHeight)))
    return () => ro.disconnect()
  }, [full])
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  const { data, error, isLoading, isValidating, mutate } = useSWR<KlinesResponse>(`/api/klines?symbol=${symbol}&interval=${tf}&limit=300`, fetcher, {
    refreshInterval: 10_000,
    keepPreviousData: false,
    revalidateOnFocus: true,
  })

  const p = paramsOf(settings)
  const ind: ChartIndicators | null = useMemo(() => {
    if (!data?.candles?.length) return null
    // Indicators use CLOSED candles only; the forming candle is drawn dimmed without indicator values.
    const closed = data.candles.filter((c) => c.closed)
    return closed.length > 20 ? chartIndicators(closed, p) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, p.stPeriod, p.stMult, p.vidyaLen, p.vidyaMom])

  const body = (h: number) => (
    <>
      {isLoading ? (
        <div className="text-muted-foreground flex items-center justify-center font-mono text-sm" style={{ height: h }}>
          Loading {symbol} {tf.toUpperCase()} candles…
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center" style={{ height: h }}>
          <p className="text-bear text-sm font-semibold">Couldn&apos;t load candles</p>
          <p className="text-muted-foreground text-xs">{error instanceof Error ? error.message : 'Network error'}</p>
          <button type="button" onClick={() => void mutate()} className="bg-primary text-primary-foreground h-11 rounded-md px-4 text-sm font-semibold">
            Retry
          </button>
        </div>
      ) : data ? (
        <CandleChart key={`${symbol}-${tf}`} candles={data.candles} ind={ind} overlays={overlays} height={h} />
      ) : null}
    </>
  )

  const controls = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="bg-secondary/50 flex flex-1 rounded-md p-0.5" role="tablist" aria-label="Chart timeframe">
          {TFS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tf === t}
              onClick={() => setTf(t)}
              className={cn('h-10 flex-1 rounded font-mono text-xs font-bold', tf === t ? 'bg-background text-foreground shadow' : 'text-muted-foreground')}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void mutate()} aria-label="Refresh chart" className="border-border bg-secondary flex size-11 items-center justify-center rounded-md border">
          <RefreshCw className={cn('size-4', isValidating && 'animate-spin')} />
        </button>
        <button type="button" onClick={() => setFull((f) => !f)} aria-label={full ? 'Exit full screen' : 'Full screen chart'} className="border-border bg-secondary flex size-11 items-center justify-center rounded-md border">
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={overlays[c.key]}
            onClick={() => setOverlays((o) => ({ ...o, [c.key]: !o[c.key] }))}
            className={cn('flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold', overlays[c.key] ? 'border-primary/50 bg-primary/10' : 'border-border text-muted-foreground')}
          >
            {c.color ? <span className="size-2 rounded-full" style={{ background: c.color }} /> : null}
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )

  if (full) {
    return (
      <div className="bg-background fixed inset-0 z-[55] flex flex-col gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold">{symbol} · {tf.toUpperCase()}</span>
        </div>
        {controls}
        <div ref={fullRef} className="min-h-0 flex-1 overflow-hidden">{body(fullH)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="font-mono text-sm font-bold">{symbol}</h2>
        <span className="text-muted-foreground text-[10px]">native Binance {tf.toUpperCase()} candles · indicators on closed candles</span>
      </div>
      {controls}
      <Card className="overflow-hidden p-1">{body(Math.min(420, Math.max(260, Math.round(vh * 0.5))))}</Card>
      <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">
        VIDYA here is the standard CMO-based Variable Index Dynamic Average (length {settings.vidyaLen}, momentum {settings.vidyaMom}) — the same series the signal engine uses. Supertrend {settings.stPeriod}/{settings.stMult}.
      </p>
    </div>
  )
}
