import { NextResponse } from 'next/server'
import { fetchKlines } from '@/lib/binance'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const INTERVALS: Record<string, number> = { '1m': 1, '3m': 3, '5m': 5 }

/** Native Binance candles (1m/3m/5m) for the chart. The last candle may still be forming (`closed: false`). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase()
  const interval = url.searchParams.get('interval') ?? '1m'
  const limit = Math.min(500, Math.max(50, Number(url.searchParams.get('limit') ?? 300) || 300))
  if (!/^[A-Z0-9]{3,20}$/.test(symbol) || !(interval in INTERVALS)) {
    return NextResponse.json({ error: 'bad symbol or interval' }, { status: 400 })
  }
  try {
    const candles = await fetchKlines(symbol, interval, limit)
    const span = INTERVALS[interval] * 60_000
    const now = Date.now()
    return NextResponse.json(
      { symbol, interval, updatedAt: now, candles: candles.map((c) => ({ ...c, closed: c.openTime + span <= now })) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'klines failed' }, { status: 502 })
  }
}
