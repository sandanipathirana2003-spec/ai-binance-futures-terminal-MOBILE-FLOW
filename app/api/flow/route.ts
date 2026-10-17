import { NextResponse } from 'next/server'
import { fetchBulkTicker24hr, fetchFuturesUniverse, fetchKlinesBatch, type Candle } from '@/lib/binance'
import { buildFlow } from '@/lib/flow-engine'
import { DEFAULT_FLOW_PARAMS, sanitizeParams, type FlowParams, type FlowRaw, type FlowResponse } from '@/lib/flow-types'

// Edge runtime for the same reason as /api/market: Binance blocks US IPs, edge runs near the visitor.
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const FLOW_SYMBOLS = 80 // top-80 USDT-M perpetuals by 24h volume
const M1_LIMIT = 499 // native 1m candles (request weight 2); 3M is built from these on wall-clock-aligned buckets
const M5_LIMIT = 300 // native 5m candles — 5M Supertrend + EMA99 need real 5m history
const CANDLE_TTL_MS = 20_000
const UNIVERSE_TTL_MS = 60 * 60 * 1000

interface CandleCache {
  fetchedAt: number
  symbols: string[]
  c1: Map<string, Candle[]>
  c5: Map<string, Candle[]>
  // memo of computed flows per parameter set, valid for this fetch only
  flows: Map<string, Record<string, FlowRaw>>
}

let universe: { at: number; symbols: string[] } | null = null
let cache: CandleCache | null = null
let inFlight: Promise<CandleCache> | null = null

async function getUniverse() {
  if (universe && Date.now() - universe.at < UNIVERSE_TTL_MS) return universe.symbols
  const symbols = await fetchFuturesUniverse()
  universe = { at: Date.now(), symbols }
  return symbols
}

async function refresh(): Promise<CandleCache> {
  const [all, ticker] = await Promise.all([getUniverse(), fetchBulkTicker24hr()])
  const ranked = all
    .filter((s) => ticker.has(s))
    .sort((a, b) => (ticker.get(b)?.quoteVolume ?? 0) - (ticker.get(a)?.quoteVolume ?? 0))
    .slice(0, FLOW_SYMBOLS)
  const symbols = ['BTCUSDT', ...ranked.filter((s) => s !== 'BTCUSDT')]
  const [c1, c5] = await Promise.all([
    fetchKlinesBatch(symbols, '1m', M1_LIMIT, 12),
    fetchKlinesBatch(symbols, '5m', M5_LIMIT, 12),
  ])
  return { fetchedAt: Date.now(), symbols, c1, c5, flows: new Map() }
}

async function getCandles(): Promise<CandleCache> {
  const now = Date.now()
  // Fresh enough AND still inside the same minute (a new minute may have closed a new candle).
  if (cache && now - cache.fetchedAt < CANDLE_TTL_MS && Math.floor(now / 60_000) === Math.floor(cache.fetchedAt / 60_000)) return cache
  if (!inFlight) {
    inFlight = refresh()
      .then((c) => {
        cache = c
        return c
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

function parseParams(url: URL): FlowParams {
  const g = (k: keyof FlowParams) => {
    const v = url.searchParams.get(k)
    return v === null ? undefined : Number(v)
  }
  return sanitizeParams({
    stPeriod: g('stPeriod'),
    stMult: g('stMult'),
    ribFast: g('ribFast'),
    ribMid: g('ribMid'),
    ribSlow: g('ribSlow'),
    vidyaLen: g('vidyaLen'),
    vidyaMom: g('vidyaMom'),
  })
}

export async function GET(req: Request) {
  const params = parseParams(new URL(req.url))
  try {
    const data = await getCandles()
    const ticker = await fetchBulkTicker24hr()
    const key = JSON.stringify(params)
    let flow = data.flows.get(key)
    if (!flow) {
      flow = {}
      const now = Date.now()
      for (const s of data.symbols) {
        const c1 = data.c1.get(s)
        const c5 = data.c5.get(s)
        if (!c1 || !c5) continue
        const f = buildFlow(s, c1, c5, now, params)
        if (f) flow[s] = f
      }
      data.flows.clear()
      data.flows.set(key, flow)
    }
    const symbols = data.symbols.filter((s) => flow![s])
    const prices: FlowResponse['prices'] = {}
    for (const s of symbols) {
      const t = ticker.get(s)
      if (t) prices[s] = { p: t.price, c: t.changePct }
    }
    const body: FlowResponse = { live: true, updatedAt: Date.now(), dataTime: data.fetchedAt, symbols, prices, flow, params }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    const body: FlowResponse = {
      live: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching Binance data',
      updatedAt: Date.now(),
      dataTime: 0,
      symbols: [],
      prices: {},
      flow: {},
      params: DEFAULT_FLOW_PARAMS,
    }
    return NextResponse.json(body, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
