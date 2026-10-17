'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_FLOW_SETTINGS, sanitizeSettings, type FlowSettings } from '@/lib/flow-types'

const KEY = 'flow-settings-v1'
const EVT = 'flow-settings-changed'

function read(): FlowSettings {
  try {
    const raw = window.localStorage.getItem(KEY)
    return sanitizeSettings(raw ? (JSON.parse(raw) as Partial<FlowSettings>) : null)
  } catch {
    return DEFAULT_FLOW_SETTINGS
  }
}

export function useFlowSettings() {
  const [settings, setSettings] = useState<FlowSettings>(DEFAULT_FLOW_SETTINGS)
  const [persisted, setPersisted] = useState(true)

  useEffect(() => {
    setSettings(read())
    const sync = () => setSettings(read())
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const save = useCallback((next: FlowSettings) => {
    const clean = sanitizeSettings(next)
    setSettings(clean)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(clean))
      setPersisted(true)
      window.dispatchEvent(new Event(EVT))
    } catch {
      // Private mode / storage disabled: settings still apply for this session, just not remembered.
      setPersisted(false)
    }
    return clean
  }, [])

  const reset = useCallback(() => save(DEFAULT_FLOW_SETTINGS), [save])

  return { settings, save, reset, persisted }
}

/** Small persisted string (selected pair, last screen). Safe if storage is unavailable. */
export function usePersistedState(key: string, initial: string) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key)
      if (v) setValue(v)
    } catch {}
  }, [key])
  const set = useCallback(
    (v: string) => {
      setValue(v)
      try {
        window.localStorage.setItem(key, v)
      } catch {}
    },
    [key],
  )
  return [value, set] as const
}
