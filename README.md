# Lulla 🌙

A calm, fast, local-first **parent and family tracker** for phones and desktops.

Lulla is an original app built from scratch (it is **not** affiliated with any
existing tracker app). It tracks feeding, sleep, diapers, routines and
milestones. Data is stored **on your device** (IndexedDB) and can optionally be
synced to your family's account. It is fully exportable and installable as a PWA.

> Lulla is a parenting aid, not medical advice.

## Features

- **Feeding** — breast (side + timer), bottle (formula/expressed), pumping, solids; one-tap logging and a live timer
- **Sleep** — start/stop timer, wake-window insights, nap and night history
- **Diapers** — wet/dirty/pee/poop counts, one-tap or detailed
- **Milestones** — age milestones and firsts in one list, with notes and photos
- **Routines** — day summaries and routine logging
- **Trends** — the last 7 days at a glance
- **Reminders** — best-effort local notifications
- **Family sync** — optional account (Neon Auth + Postgres) to share logs across devices
- **Data you own** — full JSON backup, CSV export, local-first storage, account deletion

## Tech

Vite + React 19 + TypeScript, Tailwind CSS v4, Dexie (IndexedDB), Recharts,
Zustand, distributed as an offline-capable PWA hosted on GitHub Pages.

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc
npm run lint       # eslint
npm run test       # vitest
npm run build      # production build (typecheck + vite build)
```

## Status

- **Now** — local-first PWA with optional family sync (Neon Postgres + Auth),
  exportable data, and in-app account deletion

## License

MIT. See [LICENSE](LICENSE).