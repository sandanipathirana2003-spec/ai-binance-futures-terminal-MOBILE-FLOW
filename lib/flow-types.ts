// Types + defaults for the 1M -> 3M flip-sequence engine ("Flow") used by the mobile/tablet UI
// and the desktop "Flip Setups" tab.

export type Dir = 'UP' | 'DOWN'
export type Side = 'LONG' | 'SHORT'
export type MainTrend = 'BULLISH' | 'BEARISH' | 'MIXED'
export type Grade = 'A' | 'B' | 'C' | 'D'
export type MainTrendRule = 'st5' | 'st5_ema99'

export interface FlipInfo {
  /** Close time (ms) of the candle on which Supertrend flipped. */
  t: number
  dir: Dir
}

/** Indicator parameters that change the server-side computation (sent as query params). */
export interface FlowParams {
  stPeriod: number
  stMult: number
  ribFast: number
  ribMid: number
  ribSlow: number
  vidyaLen: number
  vidyaMom: number
}

export const DEFAULT_FLOW_PARAMS: FlowParams = {
  stPeriod: 10,
  stMult: 3,
  ribFast: 9,
  ribMid: 21,
  ribSlow: 50,
  vidyaLen: 10,
  vidyaMom: 20,
}

export interface Facts {
  /** 3M EMA ribbon stack: fast>mid>slow = BULL, fast<mid<slow = BEAR. */
  ribbon: 'BULL' | 'BEAR' | 'MIXED'
  /** 1M VIDYA: UP when close above a rising VIDYA, DOWN when below a falling VIDYA. */
  vidya: 'UP' | 'DOWN' | 'FLAT'
  /** 3M ADX(14). */
  adx: number
  /** 3M volume / average volume of the previous 20 three-minute bars. */
  volRatio: number
  /** 5M Supertrend direction (null when not enough 5M history). */
  st5: Dir | null
  /** 5M close vs 5M EMA99. */
  ema99Rel: 'ABOVE' | 'BELOW' | null
}

export interface FlowSnapshot {
  /** Close time (ms) of the last CLOSED 1m candle used. */
  t: number
  close: number
  m1: { st: Dir; stValue: number; flip: FlipInfo | null; ema7: number; ema25: number; emaAlign: 'BULL' | 'BEAR'; vidyaValue: number }
  m3: { st: Dir; stValue: number; flip: FlipInfo | null; fast: number; mid: number; slow: number }
  m5: { st: Dir | null; stValue: number | null; flip: FlipInfo | null; ema99: number | null; ema99Bars: number; close: number | null }
  /** Current (live) values of every fact — used to show pending setups' check status. */
  facts: Facts
}

export interface RawSequence {
  id: string
  side: Side
  /** Close time of the 1M flip candle. */
  t0: number
  price0: number
  /** Close time of the first opposite 1M flip after t0, if any. */
  reversedAt: number | null
  /** Close time of the first 3M candle (>= t0) on which 3M Supertrend flipped into `side`'s direction, if any. */
  confirmAt: number | null
  confirmPrice: number | null
  /** Facts as of the confirmation candle (null when the 3M never flipped). */
  facts: Facts | null
}

export interface FlowRaw {
  snap: FlowSnapshot
  /** Newest first. */
  seqs: RawSequence[]
}

export interface FlowResponse {
  live: boolean
  error?: string
  updatedAt: number
  /** When the underlying Binance candles were fetched. */
  dataTime: number
  symbols: string[]
  prices: Record<string, { p: number; c: number }>
  flow: Record<string, FlowRaw>
  params: FlowParams
}

export interface FlowSettings extends FlowParams {
  requireMainTrend: boolean
  mainTrendRule: MainTrendRule
  requireRibbon: boolean
  requireVidya: boolean
  requireAdx: boolean
  adxMin: number
  requireVolume: boolean
  volMin: number
  /** Max minutes between the 1M flip and the 3M flip before a setup is cancelled. */
  expiryMin: number
  /** How long (minutes) a confirmed signal stays ACTIVE before it becomes HISTORICAL. */
  activeMin: number
  popups: boolean
  browserNotif: boolean
  sound: boolean
  minGrade: Grade
  alertScope: 'all' | 'selected'
}

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  ...DEFAULT_FLOW_PARAMS,
  requireMainTrend: true,
  mainTrendRule: 'st5',
  requireRibbon: true,
  requireVidya: true,
  requireAdx: true,
  adxMin: 20,
  requireVolume: true,
  volMin: 1,
  expiryMin: 15,
  activeMin: 15,
  popups: true,
  browserNotif: false,
  sound: false,
  minGrade: 'B',
  alertScope: 'all',
}

export function paramsOf(s: FlowSettings): FlowParams {
  return {
    stPeriod: s.stPeriod,
    stMult: s.stMult,
    ribFast: s.ribFast,
    ribMid: s.ribMid,
    ribSlow: s.ribSlow,
    vidyaLen: s.vidyaLen,
    vidyaMom: s.vidyaMom,
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Clamp indicator params into safe ranges (used by both the API route and the settings form). */
export function sanitizeParams(p: Partial<FlowParams>): FlowParams {
  const d = DEFAULT_FLOW_PARAMS
  const ribFast = Math.round(clamp(num(p.ribFast, d.ribFast), 2, 100))
  const ribMid = Math.round(clamp(num(p.ribMid, d.ribMid), ribFast + 1, 150))
  const ribSlow = Math.round(clamp(num(p.ribSlow, d.ribSlow), ribMid + 1, 200))
  return {
    stPeriod: Math.round(clamp(num(p.stPeriod, d.stPeriod), 2, 50)),
    stMult: Math.round(clamp(num(p.stMult, d.stMult), 0.5, 10) * 100) / 100,
    ribFast,
    ribMid,
    ribSlow,
    vidyaLen: Math.round(clamp(num(p.vidyaLen, d.vidyaLen), 2, 100)),
    vidyaMom: Math.round(clamp(num(p.vidyaMom, d.vidyaMom), 2, 100)),
  }
}

export function sanitizeSettings(raw: Partial<FlowSettings> | null | undefined): FlowSettings {
  const d = DEFAULT_FLOW_SETTINGS
  const r = raw ?? {}
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)
  return {
    ...sanitizeParams(r),
    requireMainTrend: bool(r.requireMainTrend, d.requireMainTrend),
    mainTrendRule: r.mainTrendRule === 'st5_ema99' ? 'st5_ema99' : 'st5',
    requireRibbon: bool(r.requireRibbon, d.requireRibbon),
    requireVidya: bool(r.requireVidya, d.requireVidya),
    requireAdx: bool(r.requireAdx, d.requireAdx),
    adxMin: clamp(num(r.adxMin, d.adxMin), 0, 60),
    requireVolume: bool(r.requireVolume, d.requireVolume),
    volMin: clamp(num(r.volMin, d.volMin), 0, 10),
    expiryMin: Math.round(clamp(num(r.expiryMin, d.expiryMin), 3, 120)),
    activeMin: Math.round(clamp(num(r.activeMin, d.activeMin), 1, 240)),
    popups: bool(r.popups, d.popups),
    browserNotif: bool(r.browserNotif, d.browserNotif),
    sound: bool(r.sound, d.sound),
    minGrade: r.minGrade === 'A' || r.minGrade === 'B' || r.minGrade === 'C' || r.minGrade === 'D' ? r.minGrade : d.minGrade,
    alertScope: r.alertScope === 'selected' ? 'selected' : 'all',
  }
}
