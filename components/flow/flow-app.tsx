'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CandlestickChart, Gauge, ListChecks, Loader2, RefreshCw, Settings as SettingsIcon, WifiOff, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFlow, type Connection } from '@/hooks/use-flow'
import { useFlowAlerts } from '@/hooks/use-flow-alerts'
import { useFlowSettings, usePersistedState } from '@/hooks/use-flow-settings'
import { fmtTime, type EvaluatedSetup } from '@/lib/flow-eval'
import { ChartsScreen } from './charts'
import { DetailSheet } from './detail-sheet'
import { MainTrendScreen } from './main-trend'
import { SettingsScreen } from './settings'
import { SetupsScreen } from './setups'
import { SignalPopup } from './signal-popup'
import { SignalsScreen } from './signals'

type Screen = 'trend' | 'signals' | 'setups' | 'charts' | 'settings'

const NAV: { key: Screen; label: string; icon: React.ReactNode }[] = [
  { key: 'trend', label: 'Main Trend', icon: <Gauge className="size-5" /> },
  { key: 'signals', label: 'Signals', icon: <Zap className="size-5" /> },
  { key: 'setups', label: 'Setups', icon: <ListChecks className="size-5" /> },
  { key: 'charts', label: 'Charts', icon: <CandlestickChart className="size-5" /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon className="size-5" /> },
]

const CONN: Record<Connection, { label: string; cls: string }> = {
  live: { label: 'LIVE', cls: 'border-bull/30 bg-bull/10 text-bull' },
  stale: { label: 'STALE', cls: 'border-warn/30 bg-warn/10 text-warn' },
  connecting: { label: 'CONNECTING', cls: 'border-border bg-secondary/40 text-muted-foreground' },
  offline: { label: 'OFFLINE', cls: 'border-bear/30 bg-bear/10 text-bear' },
  error: { label: 'NO DATA', cls: 'border-bear/30 bg-bear/10 text-bear' },
}

export function FlowApp({ variant = 'mobile', onOpenClassic }: { variant?: 'mobile' | 'desktop'; onOpenClassic?: () => void }) {
  const { settings, save, reset, persisted } = useFlowSettings()
  const { data, setups, now, connection, errorMessage, isLoading, isValidating, slow, retry } = useFlow(settings)
  const [screen, setScreen] = usePersistedState('flow-screen', 'trend')
  const [symbol, setSymbol] = usePersistedState('flow-symbol', 'BTCUSDT')
  const [detail, setDetail] = useState<EvaluatedSetup | null>(null)

  const active = (NAV.some((n) => n.key === screen) ? screen : 'trend') as Screen
  const symbols = data?.symbols ?? []
  const sel = symbols.includes(symbol) ? symbol : (symbols[0] ?? symbol)

  const alerts = useFlowAlerts(setups, Boolean(data), settings, sel)

  // Keep the open detail sheet in sync with live data (e.g. a pending setup that confirms while open).
  const detailLive = useMemo(() => (detail ? (setups.find((s) => s.id === detail.id) ?? detail) : null), [detail, setups])

  const openChart = useCallback(
    (sym: string) => {
      setSymbol(sym)
      setScreen('charts')
      setDetail(null)
    },
    [setSymbol, setScreen],
  )
  const viewFromPopup = (s: EvaluatedSetup) => {
    alerts.dismiss()
    setDetail(s)
  }

  const pendingCount = setups.filter((s) => s.status === 'PENDING').length
  const activeSignals = setups.filter((s) => s.status === 'CONFIRMED' && s.active).length
  const flow = data?.flow[sel]
  const price = data?.prices[sel]
  const conn = CONN[connection]

  // Re-evaluate the "popup" when settings change scope etc. — nothing to do; refs handled in hook.
  useEffect(() => {
    if (!NAV.some((n) => n.key === screen)) setScreen('trend')
  }, [screen, setScreen])

  const nav = (
    <nav
      className={cn(
        'border-border bg-sidebar shrink-0 border-t',
        variant === 'desktop' ? 'order-first border-t-0 border-b' : 'pb-[env(safe-area-inset-bottom)]',
      )}
      aria-label="Sections"
    >
      <ul className={cn('mx-auto grid grid-cols-5', variant === 'desktop' && 'max-w-2xl')}>
        {NAV.map((n) => {
          const badge = n.key === 'signals' ? activeSignals : n.key === 'setups' ? pendingCount : 0
          const on = active === n.key
          return (
            <li key={n.key} className="min-w-0">
              <button
                type="button"
                onClick={() => setScreen(n.key)}
                aria-current={on ? 'page' : undefined}
                className={cn('relative flex h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5', on ? 'text-primary' : 'text-muted-foreground')}
              >
                {n.icon}
                <span className="max-w-full truncate text-[10px] leading-none font-semibold">{n.label}</span>
                {badge > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute top-1.5 left-1/2 ml-2 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold">{badge > 99 ? '99+' : badge}</span>
                ) : null}
                {on ? <span className="bg-primary absolute inset-x-3 top-0 h-0.5 rounded-b" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    <div className={cn('bg-background flex min-h-0 flex-col overflow-hidden', variant === 'mobile' ? 'h-dvh' : 'h-full')}>
      <header className="border-border bg-sidebar shrink-0 border-b px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <Activity className="text-primary size-5 shrink-0" />
          <label className="sr-only" htmlFor="flow-pair">
            Trading pair
          </label>
          <select
            id="flow-pair"
            value={sel}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={symbols.length === 0}
            className="border-border bg-secondary/50 h-11 min-w-0 flex-1 rounded-md border px-2 font-mono text-base font-bold outline-none"
          >
            {symbols.length === 0 ? <option value={sel}>{sel}</option> : null}
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className={cn('flex h-11 shrink-0 flex-col items-end justify-center rounded-md border px-2 font-mono leading-tight', conn.cls)} title={errorMessage ?? undefined}>
            <span className="flex items-center gap-1 text-[11px] font-bold">
              {connection === 'live' ? <span className="size-1.5 animate-pulse rounded-full bg-current" /> : connection === 'connecting' ? <Loader2 className="size-3 animate-spin" /> : <WifiOff className="size-3" />}
              {conn.label}
            </span>
            <span className="text-[10px] opacity-80">{data ? fmtTime(data.updatedAt) : '--:--:--'}</span>
          </div>
        </div>
      </header>

      {connection === 'offline' ? (
        <Banner tone="bear">You&apos;re offline. Showing the last data received; it will refresh automatically when the connection returns.</Banner>
      ) : connection === 'error' ? (
        <Banner tone="bear" action={<RetryButton onClick={retry} busy={isValidating} />}>
          Binance data unavailable ({errorMessage ?? 'unknown error'}). Nothing fake is shown{data ? ' — these are the last good values' : ''}. Retrying every few seconds.
        </Banner>
      ) : connection === 'stale' ? (
        <Banner tone="warn" action={<RetryButton onClick={retry} busy={isValidating} />}>
          Data is more than 60s old.
        </Banner>
      ) : slow && isValidating ? (
        <Banner tone="warn">Slow connection — still loading…</Banner>
      ) : null}

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className={cn('mx-auto w-full', variant === 'desktop' ? 'max-w-5xl' : 'max-w-3xl')}>
          {active === 'settings' ? (
            <SettingsScreen settings={settings} persisted={persisted} onSave={save} onReset={reset} onOpenClassic={onOpenClassic} />
          ) : isLoading && !data ? (
            <div className="text-muted-foreground flex flex-col items-center gap-3 p-10 font-mono text-sm">
              <Loader2 className="size-6 animate-spin" />
              Loading closed candles from Binance…
            </div>
          ) : !data && connection !== 'connecting' ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <WifiOff className="text-bear size-8" />
              <p className="text-sm font-semibold">Couldn&apos;t load market data</p>
              <p className="text-muted-foreground text-xs">{errorMessage ?? 'Check your connection.'}</p>
              <RetryButton onClick={retry} busy={isValidating} big />
            </div>
          ) : active === 'trend' ? (
            <MainTrendScreen symbol={sel} flow={flow} price={price?.p} change={price?.c} setups={setups} settings={settings} now={now} onOpen={setDetail} />
          ) : active === 'signals' ? (
            <SignalsScreen setups={setups} onOpen={setDetail} now={now} />
          ) : active === 'setups' ? (
            <SetupsScreen setups={setups} onOpen={setDetail} />
          ) : active === 'charts' ? (
            <ChartsScreen symbol={sel} settings={settings} />
          ) : null}
        </div>
      </main>

      {nav}

      <SignalPopup setup={alerts.current} more={alerts.more} onView={viewFromPopup} onDismiss={alerts.dismiss} />
      <DetailSheet setup={detailLive} onClose={() => setDetail(null)} onOpenChart={openChart} />
    </div>
  )
}

function Banner({ tone, children, action }: { tone: 'bear' | 'warn'; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] leading-snug', tone === 'bear' ? 'border-bear/30 bg-bear/10 text-bear' : 'border-warn/30 bg-warn/10 text-warn')} role="status">
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  )
}

function RetryButton({ onClick, busy, big }: { onClick: () => void; busy: boolean; big?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn('border-current/40 bg-background/40 flex shrink-0 items-center gap-1.5 rounded-md border font-semibold', big ? 'h-11 px-5 text-sm' : 'h-9 px-2.5 text-[11px]')}>
      <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} /> Retry
    </button>
  )
}
