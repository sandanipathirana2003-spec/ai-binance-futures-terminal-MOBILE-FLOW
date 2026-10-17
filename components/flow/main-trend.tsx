'use client'

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatPct, formatPrice } from '@/lib/format'
import { fmtDuration, fmtTime, mainTrendOf, type EvaluatedSetup } from '@/lib/flow-eval'
import type { FlipInfo, FlowRaw, FlowSettings } from '@/lib/flow-types'
import { Card, DirPill, Pill, Row } from './ui'

function flipText(f: FlipInfo | null) {
  return f ? `${f.dir} @ ${fmtTime(f.t)}` : 'none in window'
}

function setupLine(latest: EvaluatedSetup | undefined, now: number) {
  if (!latest) return { tone: 'neutral' as const, text: 'No 1M flip in the last 6h' }
  const s = `${latest.side} ${latest.symbol.replace('USDT', '')}`
  if (latest.status === 'PENDING') return { tone: 'warn' as const, text: `PENDING ${s} · ${fmtDuration(latest.remainingMs ?? 0)} left` }
  if (latest.status === 'CONFIRMED') return { tone: 'bull' as const, text: `CONFIRMED ${s} · ${fmtDuration(now - (latest.confirmAt ?? now))} ago` }
  return { tone: 'bear' as const, text: `CANCELLED ${s}` }
}

export function MainTrendScreen({
  symbol,
  flow,
  price,
  change,
  setups,
  settings,
  now,
  onOpen,
}: {
  symbol: string
  flow?: FlowRaw
  price?: number
  change?: number
  setups: EvaluatedSetup[]
  settings: FlowSettings
  now: number
  onOpen: (s: EvaluatedSetup) => void
}) {
  if (!flow) {
    return (
      <Card className="m-3 p-4 text-sm">
        <p className="font-semibold">No flow data for {symbol}</p>
        <p className="text-muted-foreground mt-1 text-xs">This pair isn&apos;t in the scanned universe (top 80 USDT-M perpetuals by volume) or doesn&apos;t have enough closed candles yet.</p>
      </Card>
    )
  }
  const { snap } = flow
  const trend = mainTrendOf(snap.facts, settings.mainTrendRule)
  const mine = setups.filter((s) => s.symbol === symbol)
  const latest = mine[0]
  const line = setupLine(latest, now)
  const pending = mine.find((s) => s.status === 'PENDING')
  const ruleLabel = settings.mainTrendRule === 'st5' ? '5M Supertrend' : '5M Supertrend + EMA99'
  const e99Ready = snap.m5.ema99 !== null && snap.m5.ema99Bars >= 99
  const wantTrend = latest ? (latest.side === 'LONG' ? 'BULLISH' : 'BEARISH') : null

  return (
    <div className="flex flex-col gap-3 p-3">
      <Card className={cn('p-3', trend === 'BULLISH' ? 'border-bull/40 bg-bull/5' : trend === 'BEARISH' ? 'border-bear/40 bg-bear/5' : '')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase">Main trend · {ruleLabel}</p>
            <p className={cn('mt-0.5 flex items-center gap-1.5 font-mono text-2xl font-extrabold', trend === 'BULLISH' ? 'text-bull' : trend === 'BEARISH' ? 'text-bear' : 'text-warn')}>
              {trend === 'BULLISH' ? <TrendingUp className="size-6" /> : trend === 'BEARISH' ? <TrendingDown className="size-6" /> : <Minus className="size-6" />}
              {trend}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">${price !== undefined ? formatPrice(price) : formatPrice(snap.close)}</p>
            {change !== undefined ? <p className={cn('font-mono text-xs font-semibold', change >= 0 ? 'text-bull' : 'text-bear')}>{formatPct(change)} 24h</p> : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* 1M */}
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-bold">1M</h3>
            <DirPill value={snap.m1.st} label={`ST ${snap.m1.st}`} />
          </div>
          <div className="divide-border divide-y">
            <Row label="Latest confirmed flip">{flipText(snap.m1.flip)}</Row>
            <Row label="EMA 7/25">
              <DirPill value={snap.m1.emaAlign} label={snap.m1.emaAlign === 'BULL' ? '7 > 25 BULL' : '7 < 25 BEAR'} />
            </Row>
            <Row label="VIDYA">
              <DirPill value={snap.facts.vidya} label={snap.facts.vidya} />
            </Row>
            <Row label="Setup">
              <button type="button" disabled={!latest} onClick={() => latest && onOpen(latest)} className="text-right underline-offset-2 enabled:underline">
                <Pill tone={line.tone} className="whitespace-normal text-left">{line.text}</Pill>
              </button>
            </Row>
          </div>
        </Card>

        {/* 3M */}
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-bold">3M</h3>
            <DirPill value={snap.m3.st} label={`ST ${snap.m3.st}`} />
          </div>
          <div className="divide-border divide-y">
            <Row label="Latest confirmed flip">{flipText(snap.m3.flip)}</Row>
            <Row label={`MA ribbon ${settings.ribFast}/${settings.ribMid}/${settings.ribSlow}`}>
              <DirPill value={snap.facts.ribbon} label={snap.facts.ribbon} />
            </Row>
            <Row label="Confirmation">
              {pending ? (
                <Pill tone="warn">PENDING · {pending.side}</Pill>
              ) : latest?.status === 'CONFIRMED' ? (
                <Pill tone="bull">COMPLETE · {latest.side}</Pill>
              ) : latest?.status === 'CANCELLED' ? (
                <Pill tone="bear">CANCELLED</Pill>
              ) : (
                <Pill>NO SETUP</Pill>
              )}
            </Row>
            <Row label="ADX / volume">
              <span>
                {snap.facts.adx.toFixed(1)} · {snap.facts.volRatio.toFixed(2)}×
              </span>
            </Row>
          </div>
        </Card>

        {/* 5M */}
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-bold">5M</h3>
            <DirPill value={snap.m5.st} label={snap.m5.st ? `ST ${snap.m5.st}` : 'NO DATA'} />
          </div>
          <div className="divide-border divide-y">
            <Row label="Main trend direction">
              <DirPill value={snap.m5.st === 'UP' ? 'BULLISH' : snap.m5.st === 'DOWN' ? 'BEARISH' : 'MIXED'} label={snap.m5.st === 'UP' ? 'BULLISH' : snap.m5.st === 'DOWN' ? 'BEARISH' : 'MIXED'} />
            </Row>
            <Row label="Supertrend flip">{flipText(snap.m5.flip)}</Row>
            <Row label="EMA 99 context">
              {snap.m5.ema99 !== null && snap.m5.close !== null ? (
                <span>
                  {snap.m5.close >= snap.m5.ema99 ? 'price ABOVE' : 'price BELOW'} {formatPrice(snap.m5.ema99)}
                  {!e99Ready ? <span className="text-warn block text-[10px] font-normal">only {snap.m5.ema99Bars} 5M bars</span> : null}
                </span>
              ) : (
                '—'
              )}
            </Row>
            <Row label={`Rule: ${ruleLabel}`}>
              <DirPill value={trend} label={`${trend}${wantTrend ? (trend === wantTrend ? ' ✓ agrees' : ' ✗ differs') : ''}`} />
            </Row>
          </div>
          {wantTrend ? <p className="text-muted-foreground mt-1 text-[10px]">Agreement is checked against the latest {latest?.side} setup.</p> : null}
        </Card>
      </div>

      <p className="text-muted-foreground px-1 text-[10px] leading-relaxed">
        Cards use closed candles only and refresh as soon as a new 1M/3M/5M candle has closed (data polled every 15s). Last closed 1M candle: {fmtTime(snap.t)}.
      </p>
    </div>
  )
}
