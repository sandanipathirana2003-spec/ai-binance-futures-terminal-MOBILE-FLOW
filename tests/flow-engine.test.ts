import { alignedResample, adxSeries, buildFlow, onlyClosed, supertrendSeries, vidyaSeries, volumeRatioSeries } from '../lib/flow-engine'
import { supertrend } from '../lib/indicators'
import { DEFAULT_FLOW_PARAMS } from '../lib/flow-types'
import { evaluateSequence, evaluateAll } from '../lib/flow-eval'
import { DEFAULT_FLOW_SETTINGS } from '../lib/flow-types'

let fails = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }

// deterministic PRNG
let seed = 42
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function walk(n: number, start: number, t0: number, drift: (i: number) => number) {
  const out = []
  let p = start
  for (let i = 0; i < n; i++) {
    const o = p
    const c = o * (1 + drift(i) + (rnd() - 0.5) * 0.002)
    const h = Math.max(o, c) * (1 + rnd() * 0.0007)
    const l = Math.min(o, c) * (1 - rnd() * 0.0007)
    out.push({ openTime: t0 + i * 60000, open: o, high: h, low: l, close: c, volume: 100 + rnd() * 100 })
    p = c
  }
  return out
}

// 1) aligned resample: buckets on wall clock, only complete groups
{
  const base = Math.floor(1_700_000_000_000 / 180000) * 180000 + 60000 // start 1 minute INTO a 3m bucket
  const c = walk(20, 100, base, () => 0)
  const r = alignedResample(c, 3)
  ok(r.every((k) => k.openTime % 180000 === 0), '3m buckets aligned to wall clock')
  ok(r.length === 6, `incomplete first bucket dropped, 6 complete buckets kept (got ${r.length})`)
  const k = r[0]
  const grp = c.filter((x) => x.openTime >= k.openTime && x.openTime < k.openTime + 180000)
  ok(grp.length === 3 && k.high === Math.max(...grp.map((x) => x.high)) && k.low === Math.min(...grp.map((x) => x.low)) && k.close === grp[2].close && k.open === grp[0].open, '3m OHLC aggregation correct')
}

// 2) Supertrend vs the project's existing implementation (final direction agreement along the series)
{
  const c = walk(600, 100, 1_700_000_000_000, (i) => (Math.floor(i / 120) % 2 === 0 ? 0.0006 : -0.0006))
  const s = supertrendSeries(c, 10, 3)
  let agree = 0, total = 0
  for (let n = 200; n <= 600; n += 10) {
    const old = supertrend(c.slice(0, n), 10, 3)
    if (!old) continue
    total++
    if ((old.direction === 1 ? 1 : -1) === s.dir[n - 1]) agree++
  }
  ok(agree / total >= 0.9, `supertrend direction agrees with existing implementation ${agree}/${total}`)
  ok(s.dir.slice(0, 9).every((d) => d === 0) && s.dir[9] !== 0, 'warm-up bars have dir 0')
  const flips = s.dir.filter((d, i) => i > 10 && d !== s.dir[i - 1]).length
  ok(flips >= 3, `trend changes produce flips (${flips})`)
}

// 3) ADX, VIDYA, volume ratio basic properties
{
  const trend = walk(300, 100, 0, () => 0.001)
  const chop = walk(300, 100, 0, (i) => (i % 2 ? 0.002 : -0.002))
  const a1 = adxSeries(trend, 14).at(-1)!, a2 = adxSeries(chop, 14).at(-1)!
  ok(a1 > 40 && a1 <= 100, `ADX high in clean trend (${a1.toFixed(1)})`)
  ok(a2 < a1 && a2 >= 0, `ADX lower in chop (${a2.toFixed(1)})`)
  const v = vidyaSeries(trend.map((k) => k.close), 10, 20)
  ok(v.length === 300 && v.at(-1)! < trend.at(-1)!.close && v.at(-1)! > trend[0].close, 'VIDYA trails price in uptrend')
  const vr = volumeRatioSeries(trend, 20)
  ok(Number.isNaN(vr[19]) && Number.isFinite(vr[20]), 'volume ratio defined after 20 bars')
}

// 4) End-to-end: downtrend -> sharp reversal up. Expect LONG sequence confirmed by 3M after a 1M flip.
{
  const now0 = Math.floor(1_700_000_000_000 / 300000) * 300000 // multiple of 5 min
  const n1 = 499
  const start = now0 - n1 * 60000
  const c1 = walk(n1, 100, start, (i) => (i < 430 ? -0.0008 : 0.0016))
  const c5 = alignedResample(c1, 5)
  const now = now0 + 20_000 // 20s into the next minute -> last candle (open=now0) is forming
  const withForming = [...c1, { openTime: now0, open: c1.at(-1)!.close, high: c1.at(-1)!.close * 1.01, low: c1.at(-1)!.close * 0.9, close: c1.at(-1)!.close * 0.95, volume: 1 }]
  const f = buildFlow('TEST', withForming, c5, now, DEFAULT_FLOW_PARAMS)
  ok(!!f, 'flow built')
  if (f) {
    ok(f.snap.close === c1.at(-1)!.close, 'forming candle ignored (close = last CLOSED close)')
    ok(f.seqs.length > 0, `sequences found (${f.seqs.length})`)
    const longs = f.seqs.filter((s) => s.side === 'LONG')
    console.log('seqs:', f.seqs.map((s) => `${s.side}@${new Date(s.t0).toISOString().slice(11, 16)} conf=${s.confirmAt ? new Date(s.confirmAt).toISOString().slice(11, 16) : '-'} rev=${s.reversedAt ? new Date(s.reversedAt).toISOString().slice(11, 16) : '-'}`).join(' | '))
    for (const s of f.seqs) {
      if (s.confirmAt) ok(s.confirmAt >= s.t0 && s.confirmAt % 180000 === 0, `3M confirm on a 3m boundary and >= 1M flip (${s.side})`)
      if (s.reversedAt) ok(s.reversedAt > s.t0, 'reversal after flip')
    }
    // No lookahead: confirmAt never later than 'now'
    ok(f.seqs.every((s) => (s.confirmAt ?? 0) <= now && s.t0 <= now), 'no future timestamps')
    // evaluation
    const ev = evaluateAll({ live: true, updatedAt: now, dataTime: now, symbols: ['TEST'], prices: {}, flow: { TEST: f }, params: DEFAULT_FLOW_PARAMS }, DEFAULT_FLOW_SETTINGS, now)
    console.log(ev.map((e) => `${e.side} ${e.status} ${e.reason ?? ''}`).join('\n'))
    ok(ev.every((e) => e.steps.length === 4), 'every setup has 4 honest steps')
    ok(ev.filter((e) => e.status !== 'PENDING').every((e) => e.steps[3].state !== 'waiting'), 'finished setups never show result as waiting')
    ok(ev.filter((e) => e.status === 'PENDING').every((e) => e.steps[3].state === 'waiting' && e.steps[2].state === 'active'), 'pending: result not reached, wait active')
    // expiry semantics: same data, expiry 3 min => older unconfirmed become cancelled/expired
    const tight = evaluateAll({ live: true, updatedAt: now, dataTime: now, symbols: ['TEST'], prices: {}, flow: { TEST: f }, params: DEFAULT_FLOW_PARAMS }, { ...DEFAULT_FLOW_SETTINGS, expiryMin: 3 }, now + 3600_000)
    ok(tight.every((e) => e.status !== 'PENDING'), 'after long time nothing stays pending')
    void longs
  }
}

// 5) Synthetic pending case: hand-built sequence evaluated at different times
{
  const snap: any = { t: 0, close: 1, m1: {}, m3: { st: 'DOWN' }, m5: {}, facts: { ribbon: 'MIXED', vidya: 'UP', adx: 30, volRatio: 1.2, st5: 'UP', ema99Rel: 'ABOVE' } }
  const seq: any = { id: 'X-1-LONG', side: 'LONG', t0: 1_000_000, price0: 1, reversedAt: null, confirmAt: null, confirmPrice: null, facts: null }
  const e1 = evaluateSequence('X', seq, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 5 * 60000)
  ok(e1.status === 'PENDING' && e1.steps[1].state === 'warn' && e1.steps[3].state === 'waiting', 'pending shows ribbon not met as warn, result waiting')
  const e2 = evaluateSequence('X', seq, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 16 * 60000)
  ok(e2.status === 'CANCELLED' && /Expired/.test(e2.reason!), 'expires after 15 min')
  const rev = { ...seq, reversedAt: 1_000_000 + 120000 }
  const e3 = evaluateSequence('X', rev, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 5 * 60000)
  ok(e3.status === 'CANCELLED' && /reversed/.test(e3.reason!), 'reversal cancels')
  const conf = { ...seq, confirmAt: 1_000_000 + 180000, confirmPrice: 2, facts: { ribbon: 'BULL', vidya: 'UP', adx: 30, volRatio: 1.2, st5: 'UP', ema99Rel: 'ABOVE' } }
  const e4 = evaluateSequence('X', conf, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 240000)
  ok(e4.status === 'CONFIRMED' && e4.active && e4.grade === 'A', `confirmed A grade (score ${e4.score})`)
  const lowAdx = { ...conf, facts: { ...conf.facts, adx: 12 } }
  const e5 = evaluateSequence('X', lowAdx, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 240000)
  ok(e5.status === 'CANCELLED' && /ADX/.test(e5.reason!), 'low ADX rejects when required')
  const e6 = evaluateSequence('X', lowAdx, snap, { ...DEFAULT_FLOW_SETTINGS, requireAdx: false }, 1_000_000 + 240000)
  ok(e6.status === 'CONFIRMED', 'low ADX accepted when filter off')
  const bearMain = { ...conf, facts: { ...conf.facts, st5: 'DOWN' } }
  ok(evaluateSequence('X', bearMain, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 240000).status === 'CANCELLED', 'main trend disagreement rejects LONG')
  const mixed = { ...conf, facts: { ...conf.facts, ema99Rel: 'BELOW' } }
  ok(evaluateSequence('X', mixed, snap, { ...DEFAULT_FLOW_SETTINGS, mainTrendRule: 'st5_ema99' }, 1_000_000 + 240000).status === 'CANCELLED', 'ST+EMA99 rule: UP but below EMA99 => MIXED => rejected')
  const old = evaluateSequence('X', conf, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 180000 + 20 * 60000)
  ok(old.status === 'CONFIRMED' && !old.active, 'old confirmed signal becomes historical')
  const late = { ...conf, confirmAt: 1_000_000 + 20 * 60000 }
  ok(evaluateSequence('X', late, snap, DEFAULT_FLOW_SETTINGS, 1_000_000 + 21 * 60000).status === 'CANCELLED', '3M flip after expiry is cancelled')
}
console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILED`)
process.exit(fails ? 1 : 0)
