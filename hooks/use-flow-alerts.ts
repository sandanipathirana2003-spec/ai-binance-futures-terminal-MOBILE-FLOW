'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { gradeAtLeast, type EvaluatedSetup } from '@/lib/flow-eval'
import type { FlowSettings } from '@/lib/flow-types'

const SEEN_KEY = 'flow-seen-v1'
const MAX_SEEN = 600

function loadSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set<string>(arr) : null
  } catch {
    return null
  }
}

function saveSeen(s: Set<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(s).slice(-MAX_SEEN)))
  } catch {}
}

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Browsers may block audio until the user has interacted with the page — never fatal.
  }
}

async function systemNotify(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    // Android Chrome only allows notifications through a service worker registration.
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon-192.png' })
    else new Notification(title, { body, tag, icon: '/icon-192.png' })
  } catch {}
}

export function notificationSupport(): 'unsupported' | NotificationPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * Pops an entry alert ONLY for a setup that just became CONFIRMED (all required checks passed on a closed 3M candle).
 * Pending setups and early 1M flips never reach here. The first time the app ever runs, everything currently
 * confirmed is treated as already-seen so a page load doesn't fire a storm of old signals.
 */
export function useFlowAlerts(setups: EvaluatedSetup[], ready: boolean, settings: FlowSettings, selected: string) {
  const [queue, setQueue] = useState<EvaluatedSetup[]>([])
  const seen = useRef<Set<string> | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    if (!ready) return
    const s = settingsRef.current
    const confirmed = setups.filter((x) => x.status === 'CONFIRMED')
    if (seen.current === null) {
      const stored = loadSeen()
      if (stored === null) {
        seen.current = new Set(confirmed.map((x) => x.id))
        saveSeen(seen.current)
        return
      }
      seen.current = stored
    }
    const fresh = confirmed.filter((x) => x.active && !seen.current!.has(x.id))
    if (fresh.length === 0) return
    for (const x of fresh) seen.current.add(x.id)
    saveSeen(seen.current)

    const eligible = fresh.filter(
      (x) => gradeAtLeast(x.grade, s.minGrade) && (s.alertScope === 'all' || x.symbol === selectedRef.current),
    )
    if (eligible.length === 0) return
    if (s.popups) setQueue((q) => [...q, ...eligible])
    if (s.browserNotif) {
      for (const x of eligible) {
        void systemNotify(`CONFIRMED ${x.side} — ${x.symbol}`, `Grade ${x.grade} · main trend ${x.mainTrend} · close ${x.confirmPrice ?? ''}`, x.id)
      }
    }
    if (s.sound) chime()
  }, [setups, ready])

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), [])
  return { current: queue[0] ?? null, more: Math.max(0, queue.length - 1), dismiss }
}
