'use client'

import { cn } from '@/lib/utils'
import type { EvaluatedSetup } from '@/lib/flow-eval'

/** In-app entry popup — shown ONLY for fully confirmed setups. */
export function SignalPopup({ setup, more, onView, onDismiss }: { setup: EvaluatedSetup | null; more: number; onView: (s: EvaluatedSetup) => void; onDismiss: () => void }) {
  if (!setup) return null
  const long = setup.side === 'LONG'
  const ok = (k: string) => (setup.checks?.find((c) => c.key === k)?.pass ? 'PASS' : 'FAIL')
  const dir = long ? 'BULLISH' : 'BEARISH'
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" role="alertdialog" aria-live="assertive" aria-label={`Confirmed ${setup.side} ${setup.symbol}`}>
      <div className={cn('bg-card pointer-events-auto w-full max-w-sm rounded-xl border-2 p-4 shadow-2xl', long ? 'border-bull' : 'border-bear')}>
        <p className={cn('font-mono text-base font-extrabold', long ? 'text-bull' : 'text-bear')}>
          CONFIRMED {setup.side} — {setup.symbol}
        </p>
        <pre className="mt-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
{`1M Supertrend: ${dir}
3M Supertrend: ${dir}
Main Trend: ${setup.mainTrend}
MA Ribbon: ${ok('ribbon')}
VIDYA: ${ok('vidya')}
Signal Grade: ${setup.grade ?? '—'}`}
        </pre>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onView(setup)} className="bg-primary text-primary-foreground h-11 flex-1 rounded-md text-sm font-bold">
            View details
          </button>
          <button type="button" onClick={onDismiss} className="border-border bg-secondary h-11 flex-1 rounded-md border text-sm font-semibold">
            Dismiss{more > 0 ? ` (+${more})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
