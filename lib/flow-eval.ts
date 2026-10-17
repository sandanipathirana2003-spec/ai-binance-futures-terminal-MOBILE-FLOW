import type { Facts, FlowRaw, FlowResponse, FlowSettings, Grade, MainTrend, RawSequence, Side } from './flow-types'

export type SetupStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED'
export type StepState = 'done' | 'active' | 'waiting' | 'warn' | 'failed' | 'skipped'

export interface Step {
  key: 'flip' | 'check' | 'wait' | 'result'
  title: string
  state: StepState
  detail: string
}

export interface Check {
  key: 'main' | 'ribbon' | 'vidya' | 'adx' | 'volume'
  label: string
  value: string
  pass: boolean
  required: boolean
}

export interface EvaluatedSetup {
  id: string
  symbol: string
  side: Side
  status: SetupStatus
  t0: number
  price0: number
  confirmAt: number | null
  confirmPrice: number | null
  reversedAt: number | null
  /** Check results (live values while pending, values at the 3M candle once it flipped). Null if never evaluated. */
  checks: Check[] | null
  /** True when `checks` are live values rather than values at the confirmation candle. */
  checksLive: boolean
  steps: Step[]
  reason: string | null
  grade: Grade | null
  score: number | null
  /** ms since confirmation (confirmed only). */
  ageMs: number | null
  /** Confirmed and younger than the "active" window. */
  active: boolean
  /** ms left before a pending setup expires. */
  remainingMs: number | null
  mainTrend: MainTrend
}

const GRADE_ORDER: Record<Grade, number> = { A: 3, B: 2, C: 1, D: 0 }
export const gradeAtLeast = (g: Grade | null, min: Grade) => g !== null && GRADE_ORDER[g] >= GRADE_ORDER[min]

export function mainTrendOf(f: Pick<Facts, 'st5' | 'ema99Rel'>, rule: FlowSettings['mainTrendRule']): MainTrend {
  if (!f.st5) return 'MIXED'
  if (rule === 'st5') return f.st5 === 'UP' ? 'BULLISH' : 'BEARISH'
  if (f.st5 === 'UP') return f.ema99Rel === 'ABOVE' ? 'BULLISH' : 'MIXED'
  return f.ema99Rel === 'BELOW' ? 'BEARISH' : 'MIXED'
}

export function fmtTime(t: number | null | undefined): string {
  if (!t) return '—'
  return new Date(t).toLocaleTimeString('en-GB', { hour12: false })
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function runChecks(side: Side, f: Facts, s: FlowSettings): Check[] {
  const want = side === 'LONG'
  const mt = mainTrendOf(f, s.mainTrendRule)
  return [
    {
      key: 'main',
      label: 'Main trend',
      value: `${mt}${f.st5 ? '' : ' (no 5M data)'}`,
      pass: mt === (want ? 'BULLISH' : 'BEARISH'),
      required: s.requireMainTrend,
    },
    {
      key: 'ribbon',
      label: 'MA ribbon (3M)',
      value: f.ribbon,
      pass: f.ribbon === (want ? 'BULL' : 'BEAR'),
      required: s.requireRibbon,
    },
    {
      key: 'vidya',
      label: 'VIDYA (1M)',
      value: f.vidya,
      pass: f.vidya === (want ? 'UP' : 'DOWN'),
      required: s.requireVidya,
    },
    { key: 'adx', label: `ADX ≥ ${s.adxMin}`, value: f.adx.toFixed(1), pass: f.adx >= s.adxMin, required: s.requireAdx },
    { key: 'volume', label: `Volume ≥ ${s.volMin}×`, value: `${f.volRatio.toFixed(2)}×`, pass: f.volRatio >= s.volMin, required: s.requireVolume },
  ]
}

/** Grade is independent of the on/off filters so it always means the same thing: 0-100 over five factors. */
function scoreOf(side: Side, f: Facts, s: FlowSettings): { score: number; grade: Grade } {
  const want = side === 'LONG'
  const mt = mainTrendOf(f, s.mainTrendRule)
  let score = 0
  if (mt === (want ? 'BULLISH' : 'BEARISH')) score += 25
  if (f.ribbon === (want ? 'BULL' : 'BEAR')) score += 25
  if (f.vidya === (want ? 'UP' : 'DOWN')) score += 20
  score += f.adx >= 35 ? 15 : f.adx >= 25 ? 12 : f.adx >= 20 ? 8 : f.adx >= 15 ? 4 : 0
  score += f.volRatio >= 2 ? 15 : f.volRatio >= 1.5 ? 12 : f.volRatio >= 1 ? 8 : f.volRatio >= 0.7 ? 4 : 0
  const grade: Grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'
  return { score, grade }
}

const dirWord = (side: Side) => (side === 'LONG' ? 'UP' : 'DOWN')

export function evaluateSequence(symbol: string, seq: RawSequence, snap: FlowRaw['snap'], s: FlowSettings, now: number): EvaluatedSetup {
  const expiryMs = s.expiryMin * 60_000
  const { side } = seq
  const flipStep: Step = {
    key: 'flip',
    title: '1M FLIP DETECTED',
    state: 'done',
    detail: `1M Supertrend flipped ${dirWord(side)} at ${fmtTime(seq.t0)} (close ${seq.price0})`,
  }

  const base = {
    id: seq.id,
    symbol,
    side,
    t0: seq.t0,
    price0: seq.price0,
    confirmAt: seq.confirmAt,
    confirmPrice: seq.confirmPrice,
    reversedAt: seq.reversedAt,
  }

  const mk = (o: Partial<EvaluatedSetup> & Pick<EvaluatedSetup, 'status' | 'steps'>): EvaluatedSetup => ({
    ...base,
    checks: null,
    checksLive: false,
    reason: null,
    grade: null,
    score: null,
    ageMs: null,
    active: false,
    remainingMs: null,
    mainTrend: 'MIXED',
    ...o,
  })

  // 1) The 1M flipped back before the 3M confirmed -> cancelled.
  if (seq.reversedAt !== null && (seq.confirmAt === null || seq.reversedAt <= seq.confirmAt)) {
    const reason = `1M Supertrend reversed to ${side === 'LONG' ? 'DOWN' : 'UP'} at ${fmtTime(seq.reversedAt)} before the 3M Supertrend confirmed.`
    return mk({
      status: 'CANCELLED',
      reason,
      steps: [
        flipStep,
        { key: 'check', title: 'MA/VIDYA CHECK', state: 'skipped', detail: 'Not evaluated — setup ended first.' },
        { key: 'wait', title: 'WAITING FOR 3M', state: 'failed', detail: reason },
        { key: 'result', title: 'CANCELLED', state: 'failed', detail: 'Reversed before 3M confirmation.' },
      ],
    })
  }

  // 2) 3M flipped in the same direction.
  if (seq.confirmAt !== null && seq.facts) {
    const f = seq.facts
    const mt = mainTrendOf(f, s.mainTrendRule)
    const { score, grade } = scoreOf(side, f, s)
    const checks = runChecks(side, f, s)
    const lateMs = seq.confirmAt - seq.t0
    const waitStepDone: Step = {
      key: 'wait',
      title: 'WAITING FOR 3M',
      state: 'done',
      detail: `3M Supertrend flipped ${dirWord(side)} at ${fmtTime(seq.confirmAt)} (${fmtDuration(lateMs)} after the 1M flip).`,
    }

    if (lateMs > expiryMs) {
      const reason = `3M flipped ${fmtDuration(lateMs)} after the 1M flip — beyond the ${s.expiryMin} min expiry.`
      return mk({
        status: 'CANCELLED',
        reason,
        checks,
        grade,
        score,
        mainTrend: mt,
        steps: [
          flipStep,
          { key: 'check', title: 'MA/VIDYA CHECK', state: 'skipped', detail: 'Not evaluated — setup had already expired.' },
          { key: 'wait', title: 'WAITING FOR 3M', state: 'failed', detail: reason },
          { key: 'result', title: 'CANCELLED', state: 'failed', detail: 'Expired before 3M confirmation.' },
        ],
      })
    }

    const maVidyaChecks = checks.filter((c) => c.key === 'ribbon' || c.key === 'vidya')
    const maVidyaFail = maVidyaChecks.filter((c) => c.required && !c.pass)
    const checkStep: Step = {
      key: 'check',
      title: 'MA/VIDYA CHECK',
      state: maVidyaFail.length ? 'failed' : 'done',
      detail: maVidyaChecks.map((c) => `${c.label}: ${c.value}${c.required ? '' : ' (not required)'} ${c.pass ? '✓' : '✗'}`).join(' · '),
    }
    const failed = checks.filter((c) => c.required && !c.pass)

    if (failed.length) {
      const reason = `Rejected at 3M confirmation (${fmtTime(seq.confirmAt)}): ${failed.map((c) => `${c.label} = ${c.value}`).join('; ')}.`
      return mk({
        status: 'CANCELLED',
        reason,
        checks,
        grade,
        score,
        mainTrend: mt,
        steps: [flipStep, checkStep, waitStepDone, { key: 'result', title: 'CANCELLED', state: 'failed', detail: reason }],
      })
    }

    const ageMs = Math.max(0, now - seq.confirmAt)
    return mk({
      status: 'CONFIRMED',
      checks,
      grade,
      score,
      mainTrend: mt,
      ageMs,
      active: ageMs <= s.activeMin * 60_000,
      steps: [
        flipStep,
        checkStep,
        waitStepDone,
        { key: 'result', title: 'CONFIRMED', state: 'done', detail: `All required checks passed at ${fmtTime(seq.confirmAt)}.` },
      ],
    })
  }

  // 3) No 3M flip yet and no reversal: pending or expired.
  const elapsed = now - seq.t0
  if (elapsed > expiryMs) {
    const reason = `Expired: no 3M ${dirWord(side)} flip within ${s.expiryMin} min of the 1M flip.`
    return mk({
      status: 'CANCELLED',
      reason,
      steps: [
        flipStep,
        { key: 'check', title: 'MA/VIDYA CHECK', state: 'skipped', detail: 'Not evaluated — setup expired.' },
        { key: 'wait', title: 'WAITING FOR 3M', state: 'failed', detail: reason },
        { key: 'result', title: 'CANCELLED', state: 'failed', detail: 'Expired.' },
      ],
    })
  }

  const f = snap.facts
  const checks = runChecks(side, f, s)
  const { score, grade } = scoreOf(side, f, s)
  const mv = checks.filter((c) => c.key === 'ribbon' || c.key === 'vidya')
  const mvOk = mv.every((c) => c.pass || !c.required)
  const remainingMs = Math.max(0, expiryMs - elapsed)
  return mk({
    status: 'PENDING',
    checks,
    checksLive: true,
    grade,
    score,
    mainTrend: mainTrendOf(f, s.mainTrendRule),
    remainingMs,
    steps: [
      flipStep,
      {
        key: 'check',
        title: 'MA/VIDYA CHECK',
        state: mvOk ? 'done' : 'warn',
        detail: `Live: ${mv.map((c) => `${c.label} ${c.value} ${c.pass ? '✓' : '✗'}`).join(' · ')}. Re-checked when the 3M flips.`,
      },
      {
        key: 'wait',
        title: 'WAITING FOR 3M',
        state: 'active',
        detail: `Waiting for 3M Supertrend ${dirWord(side)} flip — ${fmtDuration(remainingMs)} left (3M is currently ${snap.m3.st}).`,
      },
      { key: 'result', title: 'CONFIRMED / CANCELLED', state: 'waiting', detail: 'Not reached yet.' },
    ],
  })
}

export function evaluateAll(data: FlowResponse | undefined, s: FlowSettings, now: number): EvaluatedSetup[] {
  if (!data?.flow) return []
  const out: EvaluatedSetup[] = []
  for (const symbol of data.symbols) {
    const fr = data.flow[symbol]
    if (!fr) continue
    for (const seq of fr.seqs) out.push(evaluateSequence(symbol, seq, fr.snap, s, now))
  }
  out.sort((a, b) => (b.confirmAt ?? b.t0) - (a.confirmAt ?? a.t0))
  return out
}
