# Sandbagger

Golf trips, rivalries, and receipts. A trip HQ, lifetime rivalry ledger, and side-bet
tracker for a golf friend group.

## Two modes

The app decides at startup based on whether Supabase credentials are present:

- **Local mode** (no `.env.local`): everything lives in this browser's localStorage,
  preloaded with fictional sample data. No accounts, no network. Good for development and
  demos. Nothing real belongs in `src/data/seed.ts` — it ships in the JS bundle.
- **Cloud mode** (`.env.local` present): magic-link sign-in, shared Postgres database,
  live sync between everyone's phones.

See **[SETUP.md](SETUP.md)** for the walkthrough to switch it on.

## On the course

Cell service on a golf course is bad, so the app is built to survive it:

- **Installable.** Add it to a home screen and it opens like an app, with no
  browser chrome. The group is on iPhones, and iOS reads the `apple-touch-icon`
  in `index.html` rather than the manifest, so that link is the one that decides
  what the home screen shows. `npm run icons` regenerates the one icon Android
  needs and iOS ignores: a padded copy for launchers that crop to a circle.
- **Opens offline.** A service worker caches the app shell, its assets, and the
  font. Supabase reads are never cached — a stale leaderboard that looks live is
  worse than an honest failure.
- **Writes wait.** A score entered with no signal goes into a queue on the
  device and sends itself when the phone reconnects. The header says how many
  are waiting. `src/data/outbox.ts`, covered by `npm test`.

## Stack

- Vite + React + TypeScript, Tailwind CSS v4
- React Router (hash routing, so it deploys to any static host with zero config)
- Supabase (Postgres + auth) in cloud mode; localStorage otherwise
- Netlify hosting, plus one serverless function for booking-link photo previews

## Run locally

```
npm install
npm run dev
```

Or double-click `Launch Golf App.bat` in the parent folder.

## Deploy to Netlify

1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from GitHub → pick the repo. `netlify.toml` supplies
   the build settings.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables, or the
   deployed site runs in local mode.
4. In Supabase → Authentication → URL Configuration, set the Site URL and Redirect URL to
   your Netlify address, or sign-in links will point at localhost.

Two things only work once deployed:

- **Photo autofill from a booking link.** `netlify/functions/link-preview.js` fetches the
  page server-side and pulls its Open Graph image. Locally there's no function host, so
  the editor falls back to the photo picker.
- Course and venue icons load from favicons and work everywhere, deployed or not.

## Key files

- `src/types.ts` — the data model, mirroring `supabase/schema.sql`
- `supabase/schema.sql` — tables, sign-in helpers, and the row-level security rules that
  make private trips actually private. **Re-run this in the Supabase SQL editor after
  pulling** — it's safe to re-run, and trip voting needs the `toggle_trip_vote`
  function it adds.
- `src/data/outbox.ts` — the queue that holds writes until there's signal
- `public/sw.js` — the service worker, so the app opens with no network
- `src/data/backend.ts` — the change descriptors both backends understand
- `src/data/localBackend.ts` / `src/data/supabaseBackend.ts` — the two implementations
- `src/data/store.tsx` — one store over either backend; applies changes locally first,
  then pushes them
- `src/data/seed.ts` — fictional demo data; keep real details out, it's public
- `src/data/cloudSeed.ts` — copies the sample data into a fresh Supabase project,
  remapping ids to UUIDs
- `src/lib/stats.ts` — head-to-head records, leaderboard, the Saddam, trash-talk lines
- `src/lib/money.ts` — cost splitting and settle-up, all in integer cents
- `src/pages/LogRound.tsx` — the two-minute score entry flow
