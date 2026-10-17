import type { Candle } from './binance'
import { emaSeries } from './indicators'
import type { Dir, Facts, FlipInfo, FlowParams, FlowRaw, FlowSnapshot, RawSequence } from './flow-types'

const MIN = 60_000
/** How far back (ms) 1M flips are turned into sequences. */
const SEQ_LOOKBACK_MS = 6 * 60 * MIN
const MAX_SEQS = 6

// ---------------------------------------------------------------------------
// Series helpers (all pure; arrays are aligned 1:1 with the input candles)
// ---------------------------------------------------------------------------

export interface SupertrendSeries {
  /** 1 = uptrend, -1 = downtrend. 0 until the indicator has warmed up. */
  dir: (1 | -1 | 0)[]
  /** Supertrend line value (NaN until warmed up). */
  line: number[]
}

/** TradingView-style ATR Supertrend, returning the whole series (direction + line). */
export function supertrendSeries(c: Candle[], period: number, mult: number): SupertrendSeries {
  const n = c.length
  const dir: (1 | -1 | 0)[] = new Array(n).fill(0)
  const line: number[] = new Array(n).fill(NaN)
  if (n <= period) return { dir, line }

  const tr: number[] = new Array(n)
  tr[0] = c[0].high - c[0].low
  for (let i = 1; i < n; i++) {
    const pc = c[i - 1].close
    tr[i] = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc))
  }
  // Wilder ATR, seeded with the SMA of the first `period` true ranges.
  const atr: number[] = new Array(n).fill(NaN)
  let seed = 0
  for (let i = 0; i < period; i++) seed += tr[i]
  atr[period - 1] = seed / period
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period

  let upper = NaN
  let lower = NaN
  let d: 1 | -1 = 1
  for (let i = period - 1; i < n; i++) {
    const hl2 = (c[i].high + c[i].low) / 2
    const bu = hl2 + mult * atr[i]
    const bl = hl2 - mult * atr[i]
    if (i === period - 1) {
      upper = bu
      lower = bl
      d = c[i].close >= hl2 ? 1 : -1
    } else {
      const pc = c[i - 1].close
      const nu = bu < upper || pc > upper ? bu : upper
      const nl = bl > lower || pc < lower ? bl : lower
      upper = nu
      lower = nl
      if (d === 1 && c[i].close < lower) d = -1
      else if (d === -1 && c[i].close > upper) d = 1
    }
    dir[i] = d
    line[i] = d === 1 ? lower : upper
  }
  return { dir, line }
}

/** Variable Index Dynamic Average (Chande): EMA whose smoothing scales with |CMO|. */
export function vidyaSeries(close: number[], len: number, momLen: number): number[] {
  const n = close.length
  const out: number[] = new Array(n)
  if (n === 0) return out
  const alpha = 2 / (len + 1)
  out[0] = close[0]
  for (let i = 1; i < n; i++) {
    let up = 0
    let down = 0
    for (let j = Math.max(1, i - momLen + 1); j <= i; j++) {
      const diff = close[j] - close[j - 1]
      if (diff > 0) up += diff
      else down -= diff
    }
    const k = up + down === 0 ? 0 : Math.abs(up - down) / (up + down)
    const a = alpha * k
    out[i] = a * close[i] + (1 - a) * out[i - 1]
  }
  return out
}

/** Wilder ADX series (NaN until 2*period-1 bars). */
export function adxSeries(c: Candle[], period = 14): number[] {
  const n = c.length
  const out: number[] = new Array(n).fill(NaN)
  if (n < period * 2) return out
  let trS = 0
  let pS = 0
  let mS = 0
  const dx: number[] = new Array(n).fill(NaN)
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high
    const dn = c[i - 1].low - c[i].low
    const pdm = up > dn && up > 0 ? up : 0
    const mdm = dn > up && dn > 0 ? dn : 0
    const pc = c[i - 1].close
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc))
    if (i <= period) {
      trS += tr
      pS += pdm
      mS += mdm
    } else {
      trS = trS - trS / period + tr
      pS = pS - pS / period + pdm
      mS = mS - mS / period + mdm
    }
    if (i >= period && trS > 0) {
      const pdi = (100 * pS) / trS
      const mdi = (100 * mS) / trS
      dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi)
    }
  }
  let sum = 0
  for (let i = period; i < period * 2; i++) sum += dx[i]
  out[period * 2 - 1] = sum / period
  for (let i = period * 2; i < n; i++) out[i] = (out[i - 1] * (period - 1) + dx[i]) / period
  return out
}

/** Volume / mean(volume of the previous `lookback` bars). */
export function volumeRatioSeries(c: Candle[], lookback = 20): number[] {
  const out: number[] = new Array(c.length).fill(NaN)
  for (let i = lookback; i < c.length; i++) {
    let s = 0
    for (let j = i - lookback; j < i; j++) s += c[j].volume
    const avg = s / lookback
    out[i] = avg > 0 ? c[i].volume / avg : NaN
  }
  return out
}

/**
 * Resample 1m candles into wall-clock-aligned N-minute candles (the same buckets Binance/TradingView use).
 * Only COMPLETE buckets are returned, so a still-forming bucket never leaks in.
 */
export function alignedResample(c1: Candle[], minutes: number): Candle[] {
  const span = minutes * MIN
  const out: Candle[] = []
  let cur: Candle | null = null
  let count = 0
  let bucket = -1
  for (const k of c1) {
    const b = Math.floor(k.openTime / span)
    if (b !== bucket) {
      if (cur && count === minutes) out.push(cur)
      bucket = b
      count = 1
      cur = { openTime: b * span, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume }
    } else if (cur) {
      cur.high = Math.max(cur.high, k.high)
      cur.low = Math.min(cur.low, k.low)
      cur.close = k.close
      cur.volume += k.volume
      count++
    }
  }
  if (cur && count === minutes) out.push(cur)
  return out
}

export function onlyClosed(c: Candle[], minutes: number, now: number): Candle[] {
  return c.filter((k) => k.openTime + minutes * MIN <= now)
}

// ---------------------------------------------------------------------------
// Chart-facing indicator bundle (used by the Charts tab, same code as the engine)
// ---------------------------------------------------------------------------

export interface ChartIndicators {
  ema7: number[]
  ema25: number[]
  ema99: number[]
  stDir: (1 | -1 | 0)[]
  stLine: number[]
  vidya: number[]
}

export function chartIndicators(c: Candle[], p: FlowParams): ChartIndicators {
  const cl = c.map((k) => k.close)
  const st = supertrendSeries(c, p.stPeriod, p.stMult)
  return {
    ema7: emaSeries(cl, 7),
    ema25: emaSeries(cl, 25),
    ema99: emaSeries(cl, 99),
    stDir: st.dir,
    stLine: st.line,
    vidya: vidyaSeries(cl, p.vidyaLen, p.vidyaMom),
  }
}

// ---------------------------------------------------------------------------
// Flow builder
// ---------------------------------------------------------------------------

const toDir = (d: 1 | -1 | 0): Dir => (d === -1 ? 'DOWN' : 'UP')

function flipsOf(dir: (1 | -1 | 0)[], c: Candle[], minutes: number): { i: number; t: number; dir: Dir }[] {
  const out: { i: number; t: number; dir: Dir }[] = []
  for (let i = 1; i < dir.length; i++) {
    // dir[i-1] === 0 means warm-up — that is not a real flip.
    if (dir[i] !== 0 && dir[i - 1] !== 0 && dir[i] !== dir[i - 1]) {
      out.push({ i, t: c[i].openTime + minutes * MIN, dir: toDir(dir[i]) })
    }
  }
  return out
}

/** Index of the last candle whose close time is <= t (or -1). */
function idxAt(c: Candle[], minutes: number, t: number): number {
  for (let i = c.length - 1; i >= 0; i--) if (c[i].openTime + minutes * MIN <= t) return i
  return -1
}

function ribbonAlign(fast: number, mid: number, slow: number): Facts['ribbon'] {
  if (fast > mid && mid > slow) return 'BULL'
  if (fast < mid && mid < slow) return 'BEAR'
  return 'MIXED'
}

function vidyaState(close: number, v: number, vPrev: number): Facts['vidya'] {
  if (close > v && v > vPrev) return 'UP'
  if (close < v && v < vPrev) return 'DOWN'
  return 'FLAT'
}

/**
 * Builds the complete Flow view for one symbol from RAW Binance candles.
 * Only candles that have fully closed at `now` are used — a forming candle can never create or cancel a flip.
 */
export function buildFlow(symbol: string, raw1m: Candle[], raw5m: Candle[], now: number, p: FlowParams): FlowRaw | null {
  const c1 = onlyClosed(raw1m, 1, now)
  if (c1.length < 120) return null
  const c3 = alignedResample(c1, 3)
  const c5 = onlyClosed(raw5m, 5, now)
  if (c3.length < 40) return null

  const cl1 = c1.map((k) => k.close)
  const cl3 = c3.map((k) => k.close)

  const st1 = supertrendSeries(c1, p.stPeriod, p.stMult)
  const st3 = supertrendSeries(c3, p.stPeriod, p.stMult)
  const st5 = c5.length > p.stPeriod + 2 ? supertrendSeries(c5, p.stPeriod, p.stMult) : null
  const vid1 = vidyaSeries(cl1, p.vidyaLen, p.vidyaMom)
  const e7 = emaSeries(cl1, 7)
  const e25 = emaSeries(cl1, 25)
  const rf = emaSeries(cl3, p.ribFast)
  const rm = emaSeries(cl3, p.ribMid)
  const rs = emaSeries(cl3, p.ribSlow)
  const adx3 = adxSeries(c3, 14)
  const vol3 = volumeRatioSeries(c3, 20)
  const cl5 = c5.map((k) => k.close)
  const e99 = c5.length >= 20 ? emaSeries(cl5, 99) : null

  const last1 = c1.length - 1
  const last3 = c3.length - 1
  const last5 = c5.length - 1

  const flips1 = flipsOf(st1.dir, c1, 1)
  const flips3 = flipsOf(st3.dir, c3, 3)
  const flips5 = st5 ? flipsOf(st5.dir, c5, 5) : []

  const factsAt = (t: number, i3: number): Facts => {
    const i1 = idxAt(c1, 1, t)
    const i5 = idxAt(c5, 5, t)
    const rel: Facts['ema99Rel'] = e99 && i5 >= 0 && c5.length >= 99 ? (cl5[i5] >= e99[i5] ? 'ABOVE' : 'BELOW') : null
    return {
      ribbon: ribbonAlign(rf[i3], rm[i3], rs[i3]),
      vidya: i1 >= 1 ? vidyaState(cl1[i1], vid1[i1], vid1[i1 - 1]) : 'FLAT',
      adx: Number.isFinite(adx3[i3]) ? adx3[i3] : 0,
      volRatio: Number.isFinite(vol3[i3]) ? vol3[i3] : 0,
      st5: st5 && i5 >= 0 && st5.dir[i5] !== 0 ? toDir(st5.dir[i5]) : null,
      ema99Rel: rel,
    }
  }

  const lastFlip = (f: { t: number; dir: Dir }[]): FlipInfo | null => (f.length ? { t: f[f.length - 1].t, dir: f[f.length - 1].dir } : null)
  const tNow = c1[last1].openTime + MIN

  const snap: FlowSnapshot = {
    t: tNow,
    close: cl1[last1],
    m1: {
      st: toDir(st1.dir[last1]),
      stValue: st1.line[last1],
      flip: lastFlip(flips1),
      ema7: e7[last1],
      ema25: e25[last1],
      emaAlign: e7[last1] >= e25[last1] ? 'BULL' : 'BEAR',
      vidyaValue: vid1[last1],
    },
    m3: {
      st: toDir(st3.dir[last3]),
      stValue: st3.line[last3],
      flip: lastFlip(flips3),
      fast: rf[last3],
      mid: rm[last3],
      slow: rs[last3],
    },
    m5: {
      st: st5 && st5.dir[last5] !== 0 ? toDir(st5.dir[last5]) : null,
      stValue: st5 && Number.isFinite(st5.line[last5]) ? st5.line[last5] : null,
      flip: lastFlip(flips5),
      ema99: e99 ? e99[last5] : null,
      ema99Bars: c5.length,
      close: last5 >= 0 ? cl5[last5] : null,
    },
    facts: factsAt(tNow, last3),
  }

  // Sequences: every 1M flip in the lookback window, newest first.
  const recent = flips1.filter((f) => f.t >= now - SEQ_LOOKBACK_MS).slice(-MAX_SEQS)
  const seqs: RawSequence[] = []
  for (let n = 0; n < recent.length; n++) {
    const f = recent[n]
    const side = f.dir === 'UP' ? 'LONG' : 'SHORT'
    const nextOpp = flips1.find((x) => x.i > f.i)
    // First 3M bar closing at/after the 1M flip on which 3M Supertrend flipped INTO this direction.
    const conf = flips3.find((x) => x.t >= f.t && x.dir === f.dir)
    let facts: Facts | null = null
    let confirmPrice: number | null = null
    if (conf) {
      facts = factsAt(conf.t, conf.i)
      confirmPrice = cl3[conf.i]
    }
    seqs.push({
      id: `${symbol}-${f.t}-${side}`,
      side,
      t0: f.t,
      price0: cl1[f.i],
      reversedAt: nextOpp ? nextOpp.t : null,
      confirmAt: conf ? conf.t : null,
      confirmPrice,
      facts,
    })
  }
  seqs.reverse()
  return { snap, seqs }
}
