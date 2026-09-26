# Lulla 🌙

A calm, fast, local-first **baby & parent tracker** for phones and desktops.

Lulla is an original app built from scratch (it is **not** affiliated with any
existing tracker app). It tracks feeding, sleep, diapers, growth, routines,
milestones, and pregnancy/postpartum health — all stored **on your device**
(IndexedDB), fully exportable, and installable as a PWA.

> Lulla is a parenting aid, not medical advice. Always consult a pediatrician
> or health professional for questions about your child's or your own health.

## Features

- **Feeding** — breast (side + timer), bottle (formula/expressed), pumping, solids; one-tap logging and a live timer
- **Sleep** — start/stop timer, wake-window insights, nap and night history
- **Diapers** — wet/dirty/pee/poop counts, one-tap or detailed
- **Milestones** — age milestones and firsts in one list, with notes and photos
- **Health** — vaccines, medications and records
- **Growth** — weight / length / head charts against WHO percentile references
- **Routines** — day summaries and routine logging
- **Trends** — the last 7 days at a glance
- **Mom** — pregnancy, labor, and postpartum tracking
- **Reminders** — best-effort local notifications
- **Data you own** — full JSON backup, CSV export, local-first storage

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

## Roadmap

- **v1 (now)** — local-first MVP as a PWA on GitHub Pages
- **v2 (planned)** — optional account sync (Neon Postgres + Auth) so data
  follows you across devices while remaining exportable

## License

Private project.