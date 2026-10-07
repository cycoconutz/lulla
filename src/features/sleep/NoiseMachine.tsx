import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { db } from '../../db/schema'
import { getSettings, normalizeSettings, saveSettings } from '../../domain/repositories'
import {
  NOISE_FADE_MINUTES,
  NOISE_SOUNDS,
  defaultNoiseSettings,
  isNoisePlaying,
  playNoise,
  rescheduleNoiseFade,
  setNoiseVolume,
  stopNoise,
  subscribeNoise,
} from '../../domain/noise'
import type { NoiseSettings } from '../../domain/noise'
import { Segmented } from '../../components/ui/Segmented'
import { Volume2 } from 'lucide-react'

const FADE_LABELS: Record<number, string> = { 0: 'Off', 15: '15m', 30: '30m', 60: '1h' }

// Runs at module level so the fade timer can call it without a component ref.
async function quietAfterFade(): Promise<void> {
  try {
    const [row] = await db.settings.toArray()
    if (!row) return
    await saveSettings({ ...row, noise: { ...defaultNoiseSettings(), ...row.noise, enabled: false } })
  } catch {
    // writing the off state is best-effort
  }
}

export function NoiseMachine() {
  const settings = useLiveQuery(async () => {
    const [row] = await db.settings.toArray()
    return row ? normalizeSettings(row) : undefined
  }, [])
  const playing = useSyncExternalStore(subscribeNoise, isNoisePlaying, () => false)
  const noise = settings?.noise ?? defaultNoiseSettings()

  useEffect(() => {
    // A reloaded tab has no audio until the user gestures, but the checkbox was
    // left on. Try to restore playback; if the browser blocks it, reflect the
    // silent reality in the checkbox.
    if (!settings || !settings.noise?.enabled || isNoisePlaying()) return
    const row = settings
    const sound = settings.noise
    let alive = true
    void playNoise({ ...sound, onFadeEnd: quietAfterFade }).then((ok) => {
      if (!ok && alive) void saveSettings({ ...row, noise: { ...sound, enabled: false } })
    })
    return () => {
      alive = false
    }
  }, [settings])

  if (!settings) return null

  const update = (patch: Partial<NoiseSettings>) => {
    void (async () => {
      // Read the current row at call time so two quick edits cannot clobber
      // each other with the render-time snapshot.
      const row = await getSettings()
      const base = row.noise ?? defaultNoiseSettings()
      const next = { ...base, ...patch }
      await saveSettings({ ...row, noise: next })
      if (patch.enabled === true) {
        const ok = await playNoise({ ...next, onFadeEnd: quietAfterFade })
        if (!ok) await saveSettings({ ...row, noise: { ...next, enabled: false } })
      } else if (patch.enabled === false) {
        stopNoise(0.6)
      } else if (patch.sound !== undefined && playing) {
        void playNoise({ ...next, onFadeEnd: quietAfterFade })
      } else if (patch.volume !== undefined && playing) {
        setNoiseVolume(next.volume)
      } else if (patch.fadeMinutes !== undefined && playing) {
        rescheduleNoiseFade(next.fadeMinutes, quietAfterFade)
      }
    })()
  }

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">
          <Volume2 className="h-4 w-4" aria-hidden /> Noise machine
        </h2>
        <label className="flex items-center gap-2 text-xs font-bold">
          <span className={noise.enabled ? 'text-ink' : 'text-muted'}>{noise.enabled ? 'On' : 'Off'}</span>
          <input
            type="checkbox"
            checked={noise.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="h-5 w-5 accent-gold"
            aria-label="Noise machine on or off"
          />
        </label>
      </div>
      <div className={`space-y-4 ${noise.enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="flex flex-wrap gap-2">
          {NOISE_SOUNDS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!noise.enabled}
              aria-pressed={noise.sound === s.id}
              onClick={() => update({ sound: s.id })}
              className={`chip ${noise.sound === s.id ? 'chip-on' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-muted">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(noise.volume * 100)}
            onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
            className="w-full accent-gold"
            aria-label="Noise volume"
            disabled={!noise.enabled}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-bold text-muted">Auto-stop</p>
          <Segmented
            size="sm"
            value={String(noise.fadeMinutes)}
            onChange={(v) => update({ fadeMinutes: Number(v) })}
            options={NOISE_FADE_MINUTES.map((m) => ({ value: String(m), label: FADE_LABELS[m] }))}
            disabled={!noise.enabled}
          />
        </div>
        {playing && (
          <p className="flex items-center gap-2 text-xs font-bold text-gold-deep">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-deep" />
            </span>
            Playing{noise.fadeMinutes > 0 ? ` · stops in ${FADE_LABELS[noise.fadeMinutes]}` : ''}
          </p>
        )}
      </div>
    </section>
  )
}