'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatPrice } from '@/lib/format'
import type { ChartIndicators } from '@/lib/flow-engine'

export interface ChartCandle {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

export interface Overlays {
  ema7: boolean
  ema25: boolean
  ema99: boolean
  st: boolean
  vidya: boolean
  vol: boolean
}

export const OVERLAY_COLORS = { ema7: '#fbbf24', ema25: '#38bdf8', ema99: '#a78bfa', vidya: '#f472b6' }

const AXIS_W = 54
const TIME_H = 18
const MIN_BARS = 15
const CTRL_H = 56 // zoom/latest control row under the plot

function path(xs: number[], ys: number[], vals: number[], from: number, to: number, y: (v: number) => number, x: (i: number) => number) {
  let d = ''
  let pen = false
  for (let i = from; i <= to; i++) {
    const v = vals[i]
    if (v === undefined || !Number.isFinite(v)) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  }
  void xs
  void ys
  return d
}

export function CandleChart({ candles, ind, overlays, height: totalHeight }: { candles: ChartCandle[]; ind: ChartIndicators | null; overlays: Overlays; height: number }) {
  const height = Math.max(120, totalHeight - CTRL_H)
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [bars, setBars] = useState(70)
  const [offset, setOffset] = useState(0) // bars scrolled back from the newest candle
  const [cursor, setCursor] = useState<number | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; offset: number; moved: boolean } | null>(null)
  const pinch = useRef<{ dist: number; bars: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(el.clientWidth))))
    ro.observe(el)
    setWidth(Math.max(200, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  const n = candles.length
  const nBars = Math.min(Math.max(MIN_BARS, bars), Math.max(MIN_BARS, n))
  const maxOffset = Math.max(0, n - nBars)
  const off = Math.min(offset, maxOffset)
  const end = n - 1 - off
  const start = Math.max(0, end - nBars + 1)

  const plotW = Math.max(50, width - AXIS_W)
  const bw = plotW / nBars
  const volH = overlays.vol ? Math.round(height * 0.17) : 0
  const priceH = height - TIME_H - volH
  const x = useCallback((i: number) => (i - start) * bw + bw / 2, [start, bw])

  const { lo, hi, vmax } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    let vmax = 0
    for (let i = start; i <= end; i++) {
      const c = candles[i]
      if (!c) continue
      lo = Math.min(lo, c.low)
      hi = Math.max(hi, c.high)
      vmax = Math.max(vmax, c.volume)
    }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 1, vmax: 1 }
    const pad = (hi - lo) * 0.06 || hi * 0.001
    return { lo: lo - pad, hi: hi + pad, vmax: vmax || 1 }
  }, [candles, start, end])

  const y = useCallback((v: number) => ((hi - v) / (hi - lo || 1)) * (priceH - 6) + 3, [hi, lo, priceH])

  const zoom = useCallback(
    (f: number) => setBars((b) => Math.round(Math.min(Math.max(MIN_BARS, b * f), Math.max(MIN_BARS, candles.length)))),
    [candles.length],
  )

  const onDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) drag.current = { x: e.clientX, offset: off, moved: false }
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), bars: nBars }
      drag.current = null
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values())
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d > 10) setBars(Math.round(Math.min(Math.max(MIN_BARS, pinch.current.bars * (pinch.current.dist / d)), Math.max(MIN_BARS, candles.length))))
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x
      if (Math.abs(dx) > 4) drag.current.moved = true
      setOffset(Math.round(Math.min(Math.max(0, drag.current.offset + dx / bw), maxOffset)))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const wasTap = drag.current && !drag.current.moved && pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (wasTap) {
      const rect = (e.currentTarget as Element).getBoundingClientRect()
      const idx = start + Math.floor((e.clientX - rect.left) / bw)
      setCursor(idx >= start && idx <= end ? idx : null)
    }
    if (pointers.current.size === 0) drag.current = null
  }

  const shown = cursor !== null && cursor >= start && cursor <= end ? cursor : end
  const c = candles[shown]

  // Price axis ticks + time labels
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 5)
  const timeEvery = Math.max(1, Math.round(nBars / Math.max(2, Math.floor(plotW / 62))))

  const stSegs = useMemo(() => {
    if (!ind) return []
    const segs: { d: string; up: boolean }[] = []
    let cur = ''
    let curDir = 0
    for (let i = start; i <= Math.min(end, ind.stDir.length - 1); i++) {
      const dir = ind.stDir[i]
      const v = ind.stLine[i]
      if (dir === 0 || !Number.isFinite(v)) continue
      if (dir !== curDir) {
        if (cur) segs.push({ d: cur, up: curDir === 1 })
        cur = `M${x(i).toFixed(1)} ${y(v).toFixed(1)}`
        curDir = dir
      } else cur += `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    }
    if (cur) segs.push({ d: cur, up: curDir === 1 })
    return segs
  }, [ind, start, end, x, y])

  const fmtT = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const val = (arr: number[] | undefined) => (arr && Number.isFinite(arr[shown]) ? formatPrice(arr[shown]) : '—')

  return (
    <div className="flex min-w-0 flex-col" style={{ height: totalHeight }}>
      <div ref={wrap} className="relative min-w-0 select-none" style={{ touchAction: 'pan-y', height }}>
        {c ? (
          <div className="pointer-events-none absolute top-1 left-1 z-10 max-w-[calc(100%-4.5rem)] rounded bg-black/55 px-1.5 py-1 font-mono text-[10px] leading-tight">
            <span className="text-muted-foreground">{fmtT(c.openTime)}{c.closed ? '' : ' (forming)'} </span>
            O {formatPrice(c.open)} H {formatPrice(c.high)} L {formatPrice(c.low)} C {formatPrice(c.close)}
            {ind ? (
              <span className="block">
                {overlays.ema7 ? <span style={{ color: OVERLAY_COLORS.ema7 }}>E7 {val(ind.ema7)} </span> : null}
                {overlays.ema25 ? <span style={{ color: OVERLAY_COLORS.ema25 }}>E25 {val(ind.ema25)} </span> : null}
                {overlays.ema99 ? <span style={{ color: OVERLAY_COLORS.ema99 }}>E99 {val(ind.ema99)} </span> : null}
                {overlays.vidya ? <span style={{ color: OVERLAY_COLORS.vidya }}>VIDYA {val(ind.vidya)}</span> : null}
              </span>
            ) : null}
          </div>
        ) : null}
        <svg
          width={width}
          height={height}
          className="block max-w-full"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label="Candlestick chart"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={plotW + 4} y={y(t) + 3} fontSize={9} fill="currentColor" fillOpacity={0.6} className="font-mono">
                {formatPrice(t)}
              </text>
            </g>
          ))}

          {candles.slice(start, end + 1).map((k, j) => {
            const i = start + j
            const up = k.close >= k.open
            const col = up ? 'var(--bull)' : 'var(--bear)'
            const top = y(Math.max(k.open, k.close))
            const bh = Math.max(1, Math.abs(y(k.open) - y(k.close)))
            return (
              <g key={k.openTime} opacity={k.closed ? 1 : 0.55}>
                <line x1={x(i)} x2={x(i)} y1={y(k.high)} y2={y(k.low)} style={{ stroke: col }} strokeWidth={1} />
                <rect x={x(i) - Math.max(1, bw * 0.34)} y={top} width={Math.max(2, bw * 0.68)} height={bh} style={{ fill: col }} />
                {overlays.vol ? (
                  <rect
                    x={x(i) - Math.max(1, bw * 0.34)}
                    y={height - TIME_H - (k.volume / vmax) * (volH - 4)}
                    width={Math.max(2, bw * 0.68)}
                    height={Math.max(1, (k.volume / vmax) * (volH - 4))}
                    style={{ fill: col }}
                    opacity={0.45}
                  />
                ) : null}
              </g>
            )
          })}

          {ind && overlays.st
            ? stSegs.map((s, i) => <path key={i} d={s.d} fill="none" strokeWidth={1.6} style={{ stroke: s.up ? 'var(--bull)' : 'var(--bear)' }} />)
            : null}
          {ind && overlays.ema99 ? <path d={path([], [], ind.ema99, start, Math.min(end, ind.ema99.length - 1), y, x)} fill="none" stroke={OVERLAY_COLORS.ema99} strokeWidth={1.2} /> : null}
          {ind && overlays.ema25 ? <path d={path([], [], ind.ema25, start, Math.min(end, ind.ema25.length - 1), y, x)} fill="none" stroke={OVERLAY_COLORS.ema25} strokeWidth={1.2} /> : null}
          {ind && overlays.ema7 ? <path d={path([], [], ind.ema7, start, Math.min(end, ind.ema7.length - 1), y, x)} fill="none" stroke={OVERLAY_COLORS.ema7} strokeWidth={1.2} /> : null}
          {ind && overlays.vidya ? <path d={path([], [], ind.vidya, start, Math.min(end, ind.vidya.length - 1), y, x)} fill="none" stroke={OVERLAY_COLORS.vidya} strokeWidth={1.4} strokeDasharray="4 2" /> : null}

          {shown >= start && shown <= end ? <line x1={x(shown)} x2={x(shown)} y1={0} y2={height - TIME_H} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" /> : null}

          {candles.slice(start, end + 1).map((k, j) => {
            const i = start + j
            if ((end - i) % timeEvery !== 0) return null
            if (x(i) < 20 || x(i) > plotW - 20) return null
            return (
              <text key={`t${k.openTime}`} x={x(i)} y={height - 5} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.6} className="font-mono">
                {fmtT(k.openTime)}
              </text>
            )
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex gap-1.5">
          <button type="button" aria-label="Zoom out" onClick={() => zoom(1.35)} className="border-border bg-secondary size-11 rounded-md border text-lg font-bold">−</button>
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1 / 1.35)} className="border-border bg-secondary size-11 rounded-md border text-lg font-bold">+</button>
        </div>
        <span className="text-muted-foreground text-[10px]">drag to pan · pinch to zoom · tap a candle</span>
        <button type="button" onClick={() => { setOffset(0); setCursor(null) }} disabled={off === 0} className="border-border bg-secondary h-11 rounded-md border px-3 text-xs font-semibold disabled:opacity-40">
          Latest
        </button>
      </div>
    </div>
  )
}
