'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { evaluateAll, type EvaluatedSetup } from '@/lib/flow-eval'
import { paramsOf, type FlowResponse, type FlowSettings } from '@/lib/flow-types'

const fetcher = async (url: string): Promise<FlowResponse> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) })
  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  return res.json()
}

/** Ticks every `ms` so ages / countdowns stay current without refetching. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export type Connection = 'connecting' | 'live' | 'stale' | 'offline' | 'error'

export function useFlow(settings: FlowSettings) {
  const p = paramsOf(settings)
  const qs = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)])).toString()
  const [slow, setSlow] = useState(false)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const { data, error, isLoading, isValidating, mutate } = useSWR<FlowResponse>(`/api/flow?${qs}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    loadingTimeout: 6000,
    onLoadingSlow: () => setSlow(true),
    errorRetryInterval: 5000,
  })
  useEffect(() => {
    if (!isValidating) setSlow(false)
  }, [isValidating])

  const now = useNow(1000)

  const setups = useMemo(() => evaluateAll(data, settings, now), [data, settings, now])

  let connection: Connection = 'connecting'
  if (!online) connection = 'offline'
  else if (error) connection = 'error' // request failed (SWR keeps the last good data visible)
  else if (data && !data.live) connection = 'error'
  else if (data) connection = now - data.updatedAt > 60_000 ? 'stale' : 'live'

  const retry = useCallback(() => void mutate(), [mutate])
  const lastGood = useRef<FlowResponse | undefined>(undefined)
  if (data?.live) lastGood.current = data

  return {
    data: data?.live ? data : lastGood.current,
    setups: setups as EvaluatedSetup[],
    now,
    connection,
    errorMessage: data && !data.live ? (data.error ?? 'Binance data unavailable') : error instanceof Error ? error.message : null,
    isLoading: isLoading && !data,
    isValidating,
    slow,
    retry,
  }
}
