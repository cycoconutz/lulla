import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSelectedChild } from '../../hooks/useChildren'
import {
  allEventTypes,
  saveSettings,
  updateChild,
  upsertHousehold,
} from '../../domain/repositories'
import type { EventType, Settings } from '../../domain/types'
import { db } from '../../db/schema'
import { listChildren } from '../../domain/repositories'
import { exportBackup, importBackup, downloadJson } from '../../db/exportImport'
import { eventsForChild } from '../../domain/repositories'
import { downloadCsv } from '../../db/exportImport'
import { requestNotificationPermission, notify, scheduleRemindersForChild } from '../../domain/reminders'
import { Segmented } from '../../components/ui/Segmented'

const ACTIVITY_LABELS: Record<EventType, string> = {
  feeding: '🍼 Feeding',
  sleep: '😴 Sleep',
  diaper: '🧷 Diapers',
  routine: '🧸 Routines',
  medication: '💊 Medicine',
  vaccine: '💉 Vaccines',
  milestone: '✨ Milestones',
  memory: '📷 Memories',
}

export function SettingsPage() {
  const { selected } = useSelectedChild()
  const children = useLiveQuery(listChildren, [], [])
  const settings = useLiveQuery(async () => {
    const [row] = await db.settings.toArray()
    return row
  }, [])
  const household = useLiveQuery(async () => (await db.household.toArray())[0], [])
  const [caregiverInput, setCaregiverInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings && selected) void scheduleRemindersForChild(settings, selected.id)
  }, [settings, selected])

  if (!settings) return null

  const set = (patch: Partial<Settings>) => saveSettings({ ...settings, ...patch })

  const toggleActivity = (t: EventType) => {
    const on = settings.enabledActivities.includes(t)
    set({ enabledActivities: on ? settings.enabledActivities.filter((x) => x !== t) : [...settings.enabledActivities, t] })
  }

  const csvExport = async () => {
    if (!selected) return
    const all = await eventsForChild(selected.id!)
    downloadCsv(all, selected.name)
  }

  const backup = async () => {
    downloadJson(await exportBackup(), `lulla-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const onImportFile = async (f: File | null) => {
    if (!f) return
    const text = await f.text()
    try {
      const payload = JSON.parse(text)
      const count = await importBackup(payload)
      notify('Lulla', `Imported ${count} records.`)
      window.location.hash = '#/'
    } catch {
      notify('Lulla', 'Import failed — not a valid Lulla backup.')
    }
  }

  const eraseAll = async () => {
    if (!window.confirm('Erase ALL Lulla data on this device? This cannot be undone.')) return
    await Promise.all([
      db.household.clear(),
      db.children.clear(),
      db.events.clear(),
      db.measurements.clear(),
      db.medicalRecords.clear(),
      db.parentEntries.clear(),
      db.photos.clear(),
      db.settings.clear(),
    ])
    window.location.hash = '#/onboarding'
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <section className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Units</h2>
        <div className="flex items-center justify-between gap-3">
          <Segmented
            value={settings.unitsVolume}
            onChange={(v) => set({ unitsVolume: v })}
            options={[
              { value: 'oz', label: 'oz' },
              { value: 'ml', label: 'ml' },
            ]}
          />
          <Segmented
            value={settings.unitsWeight}
            onChange={(v) => set({ unitsWeight: v })}
            options={[
              { value: 'lb', label: 'lb / in' },
              { value: 'kg', label: 'kg / cm' },
            ]}
          />
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">What you track</h2>
        <div className="flex flex-wrap gap-1.5">
          {allEventTypes.map((t) => (
            <button key={t} onClick={() => toggleActivity(t)} className={`chip ${settings.enabledActivities.includes(t) ? 'chip-on' : 'opacity-40'}`}>
              {ACTIVITY_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Reminders</h2>
        <div className="space-y-2">
          {settings.reminders.map((r) => (
            <label key={r.id} className="flex items-center justify-between rounded-xl bg-sand px-3 py-2.5">
              <span className="text-sm font-bold">
                {r.label} <span className="text-muted">· every {r.intervalHours}h</span>
              </span>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) =>
                  set({
                    reminders: settings.reminders.map((x) =>
                      x.id === r.id ? { ...x, enabled: e.target.checked } : x,
                    ),
                  })
                }
                className="h-5 w-5 accent-[#b98a2c]"
              />
            </label>
          ))}
        </div>
        <button
          onClick={() =>
            void requestNotificationPermission().then((ok) =>
              notify(ok ? 'Lulla' : 'Lulla', ok ? 'Notifications enabled! 🔔' : 'Notifications were blocked by the browser.'),
            )
          }
          className="btn-outline mt-3 w-full"
        >
          🔔 Enable notifications
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Reminders fire while Lulla is open in a tab (web apps can’t ring like an alarm clock). They nudge you
          {settings.reminders.find((r) => r.enabled && r.intervalHours > 2) ? ' every few hours' : ''} after the last log
          of each activity.
        </p>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Care team</h2>
        <p className="mb-2 text-xs text-muted">
          Caregiver names are stored so you can see who logged what in history.
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(household?.caregivers ?? []).map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={caregiverInput}
            onChange={(e) => setCaregiverInput(e.target.value)}
            placeholder="Add caregiver"
            className="flex-1 rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-bold outline-none focus:border-gold"
          />
          <button
            onClick={async () => {
              const names = caregiverInput.split(',').map((s) => s.trim()).filter(Boolean)
              const combined = [...new Set([...(household?.caregivers ?? []), ...names])]
              await upsertHousehold({ name: household?.name ?? 'Our family', caregivers: combined })
              setCaregiverInput('')
            }}
            className="btn-gold !py-2.5"
          >
            Add
          </button>
        </div>
      </section>

      {children.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Children</h2>
          <ul className="space-y-2">
            {children.map((c) => (
              <li key={c.id} className="rounded-xl bg-sand p-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.avatarColor }} />
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => updateChild({ ...c, name: e.target.value.trim() || c.name })}
                    className="flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-bold outline-none focus:bg-white"
                  />
                  <span className="text-xs text-muted">{c.sex}</span>
                </div>
                <input
                  type="date"
                  defaultValue={c.birthDate}
                  onBlur={(e) => updateChild({ ...c, birthDate: e.target.value || c.birthDate })}
                  className="mt-1 rounded-lg bg-white px-2 py-1 text-xs font-bold outline-none"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wider text-muted">Your data</h2>
        <div className="space-y-2">
          <button onClick={() => void csvExport()} className="btn-outline w-full">
            Export {selected?.name ?? ''} as CSV
          </button>
          <button onClick={() => void backup()} className="btn-outline w-full">
            Full backup (JSON)
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-outline w-full">
            Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => void eraseAll()}
            className="w-full rounded-2xl border-2 border-rose-deep/40 px-4 py-3 text-sm font-bold text-rose-deep transition active:scale-[0.98]"
          >
            Erase everything on this device
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-1 text-sm font-extrabold uppercase tracking-wider text-muted">About</h2>
        <p className="text-xs leading-relaxed text-muted">
          Lulla is a local-first baby & parent tracker: your data lives in this browser, never leaves it, and there are no
          ads, no accounts, and no trackers. It is a personal reimplementation of common baby-tracker features and is not
          affiliated with any existing tracker app. Not medical advice.
        </p>
        <p className="mt-2 text-xs font-bold text-ink/70">Lulla v{__APP_VERSION__}</p>
      </section>
    </div>
  )
}