'use client'

import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { notificationSupport } from '@/hooks/use-flow-alerts'
import { DEFAULT_FLOW_SETTINGS, sanitizeSettings, type FlowSettings } from '@/lib/flow-types'
import { Collapsible, NumField, SelectField, Toggle } from './ui'

export function SettingsScreen({
  settings,
  persisted,
  onSave,
  onReset,
  onOpenClassic,
}: {
  settings: FlowSettings
  persisted: boolean
  onSave: (s: FlowSettings) => FlowSettings
  onReset: () => void
  onOpenClassic?: () => void
}) {
  const [draft, setDraft] = useState<FlowSettings>(settings)
  const [msg, setMsg] = useState<string | null>(null)
  const [perm, setPerm] = useState<ReturnType<typeof notificationSupport>>('default')

  useEffect(() => setPerm(notificationSupport()), [])
  useEffect(() => setDraft(settings), [settings])

  const set = <K extends keyof FlowSettings>(k: K, v: FlowSettings[K]) => {
    setMsg(null)
    setDraft((d) => ({ ...d, [k]: v }))
  }
  const dirty = JSON.stringify(sanitizeSettings(draft)) !== JSON.stringify(settings)

  const save = () => {
    const clean = onSave(draft)
    setDraft(clean)
    const changed = JSON.stringify(clean) !== JSON.stringify(draft)
    setMsg(changed ? 'Saved — some values were adjusted to valid ranges (e.g. ribbon periods must increase).' : persisted ? 'Saved.' : 'Applied for this session only (browser storage is unavailable).')
  }

  const toggleBrowserNotif = async (v: boolean) => {
    if (!v) return set('browserNotif', false)
    if (typeof Notification === 'undefined') {
      setMsg('This browser does not support notifications.')
      return
    }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPerm(result)
    if (result === 'granted') set('browserNotif', true)
    else setMsg('Notification permission was not granted — allow it in your browser/site settings to use this.')
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <Collapsible title="MA Ribbon" subtitle={`3M EMA ${draft.ribFast}/${draft.ribMid}/${draft.ribSlow} · ${draft.requireRibbon ? 'required' : 'optional'}`}>
        <Toggle label="Require ribbon alignment" hint="Fast > mid > slow for LONG (reverse for SHORT) at the 3M confirmation candle." checked={draft.requireRibbon} onChange={(v) => set('requireRibbon', v)} />
        <NumField label="Fast EMA" value={draft.ribFast} onChange={(v) => set('ribFast', v)} min={2} max={100} />
        <NumField label="Mid EMA" value={draft.ribMid} onChange={(v) => set('ribMid', v)} min={3} max={150} />
        <NumField label="Slow EMA" value={draft.ribSlow} onChange={(v) => set('ribSlow', v)} min={4} max={200} />
      </Collapsible>

      <Collapsible title="Supertrend" subtitle={`ATR ${draft.stPeriod} × ${draft.stMult} (1M, 3M, 5M)`}>
        <NumField label="ATR period" value={draft.stPeriod} onChange={(v) => set('stPeriod', v)} min={2} max={50} />
        <NumField label="Multiplier" value={draft.stMult} onChange={(v) => set('stMult', v)} min={0.5} max={10} step={0.1} />
      </Collapsible>

      <Collapsible title="VIDYA" subtitle={`len ${draft.vidyaLen} · momentum ${draft.vidyaMom} · ${draft.requireVidya ? 'required' : 'optional'}`}>
        <Toggle label="Require VIDYA alignment" hint="1M close on the signal side of a rising (LONG) / falling (SHORT) VIDYA." checked={draft.requireVidya} onChange={(v) => set('requireVidya', v)} />
        <NumField label="VIDYA length" value={draft.vidyaLen} onChange={(v) => set('vidyaLen', v)} min={2} max={100} />
        <NumField label="Momentum (CMO) length" value={draft.vidyaMom} onChange={(v) => set('vidyaMom', v)} min={2} max={100} />
        <p className="text-muted-foreground text-[11px] leading-snug">Standard CMO-based VIDYA. This is not a port of the TradingView &quot;Volumatic VIDYA&quot; script (its source isn&apos;t part of this project).</p>
      </Collapsible>

      <Collapsible title="ADX & volume filters" subtitle={`ADX ${draft.requireAdx ? `≥ ${draft.adxMin}` : 'off'} · Volume ${draft.requireVolume ? `≥ ${draft.volMin}×` : 'off'}`}>
        <Toggle label="Require ADX" hint="ADX(14) on the 3M confirmation candle." checked={draft.requireAdx} onChange={(v) => set('requireAdx', v)} />
        <NumField label="Minimum ADX" value={draft.adxMin} onChange={(v) => set('adxMin', v)} min={0} max={60} />
        <Toggle label="Require volume" hint="3M volume ÷ average of the previous 20 three-minute bars." checked={draft.requireVolume} onChange={(v) => set('requireVolume', v)} />
        <NumField label="Minimum volume ratio (×)" value={draft.volMin} onChange={(v) => set('volMin', v)} min={0} max={10} step={0.1} />
      </Collapsible>

      <Collapsible title="Main trend" subtitle={draft.mainTrendRule === 'st5' ? '5M Supertrend' : '5M Supertrend + EMA99'}>
        <SelectField
          label="Trend rule"
          value={draft.mainTrendRule}
          onChange={(v) => set('mainTrendRule', v)}
          options={[
            { value: 'st5', label: '5M Supertrend' },
            { value: 'st5_ema99', label: '5M ST + EMA99' },
          ]}
        />
        <Toggle label="Require main-trend agreement" hint="LONG needs BULLISH, SHORT needs BEARISH. MIXED never agrees." checked={draft.requireMainTrend} onChange={(v) => set('requireMainTrend', v)} />
      </Collapsible>

      <Collapsible title="Setup expiry" subtitle={`3M must flip within ${draft.expiryMin} min · active ${draft.activeMin} min`}>
        <NumField label="Max wait for 3M flip (min)" hint="Setup is cancelled if the 3M hasn't flipped by then." value={draft.expiryMin} onChange={(v) => set('expiryMin', v)} min={3} max={120} />
        <NumField label="Signal active for (min)" hint="After this a confirmed signal moves to Historical." value={draft.activeMin} onChange={(v) => set('activeMin', v)} min={1} max={240} />
      </Collapsible>

      <Collapsible title="Notifications" subtitle={`${draft.popups ? 'Popups on' : 'Popups off'} · grade ≥ ${draft.minGrade}`}>
        <Toggle label="In-app popups" hint="Only for fully CONFIRMED entries. Pending setups never pop up." checked={draft.popups} onChange={(v) => set('popups', v)} />
        <Toggle
          label="Browser notifications"
          hint={perm === 'unsupported' ? 'Not supported in this browser.' : perm === 'denied' ? 'Blocked in browser settings.' : 'Needs permission. iPhone: only after “Add to Home Screen”. Works while the app is open or in the background.'}
          checked={draft.browserNotif && perm === 'granted'}
          disabled={perm === 'unsupported' || perm === 'denied'}
          onChange={(v) => void toggleBrowserNotif(v)}
        />
        <Toggle label="Sound" hint="Short chime on a confirmed entry (browsers may need one tap on the page first)." checked={draft.sound} onChange={(v) => set('sound', v)} />
        <SelectField
          label="Minimum grade"
          value={draft.minGrade}
          onChange={(v) => set('minGrade', v)}
          options={[
            { value: 'A', label: 'A only' },
            { value: 'B', label: 'B and above' },
            { value: 'C', label: 'C and above' },
            { value: 'D', label: 'All grades' },
          ]}
        />
        <SelectField
          label="Alert scope"
          value={draft.alertScope}
          onChange={(v) => set('alertScope', v)}
          options={[
            { value: 'all', label: 'All scanned pairs' },
            { value: 'selected', label: 'Selected pair only' },
          ]}
        />
      </Collapsible>

      {onOpenClassic ? (
        <button type="button" onClick={onOpenClassic} className="border-border bg-card flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center text-sm font-semibold">
          <Monitor className="size-4 shrink-0" /> Open classic desktop terminal (journal, bot, ribbon table)
        </button>
      ) : null}

      <div className="bg-background/95 border-border sticky bottom-0 -mx-3 mt-1 flex flex-col gap-1.5 border-t px-3 py-2 backdrop-blur">
        {msg ? <p className="text-xs" role="status">{msg}</p> : !persisted ? <p className="text-warn text-xs">Browser storage is unavailable — settings won&apos;t be remembered after closing.</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={!dirty} className="bg-primary text-primary-foreground h-12 flex-1 rounded-md text-sm font-bold disabled:opacity-40">
            {dirty ? 'Save settings' : 'Saved'}
          </button>
          <button
            type="button"
            onClick={() => {
              onReset()
              setDraft(DEFAULT_FLOW_SETTINGS)
              setMsg('Defaults restored.')
            }}
            className="border-border bg-secondary h-12 rounded-md border px-4 text-sm font-semibold"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  )
}
