# Sandbagger: handoff

Read this first. `README.md` and `SETUP.md` cover running and deploying it;
`../golf-app-handoff.md.txt` is the original brief. Personal app for Matt's golf group
(Matt, Nader, Barry, Pat), not CI work: no CI brand or house voice, trash-talk copy welcome.

## Current state, 2026-10-08

- Live at https://thesandbagger.netlify.app (Netlify team "CI", auto-deploys on push). Repo
  `Meschmann-CI/sandbagger`, rooted here so the trip PDFs in `../Past Trips Details/` stay out.
  Supabase project `ebukktjspbgzwnaxobfg`, prod group id `e1110873-844a-49c8-9d81-de83e482d8d3`.
- Vite + React + TS + Tailwind v4, hash routing. Dual mode off `isCloudMode` in
  `src/lib/supabase.ts`: no `.env.local` = localStorage demo, credentials = magic-link auth +
  Postgres. One store (`src/data/store.tsx`) over a `Backend` interface; optimistic updates.
- Both design reviews (2026-09-26) are fully built: forest/cream tokens, named text scale,
  drawn icons, course scenes, Saddam handover, trophies (79), Wrapped with Matt's own song,
  ghost rounds, scorecard scanner, course directory, view transitions, auto-update on resume.
- Edge Functions in `supabase/functions/`: `notify` (push, secret VAPID_PRIVATE_KEY),
  `scan-card` (claude-opus-5, secret `sandbag-api-key`), `course-lookup` (GolfCourseAPI, secret
  `GOLFCOURSE_API_KEY`, added by Matt 2026-09-26, not yet exercised by a real search).
- Unpushed as of the last note: 6e1623f (auto-update on resume). Push only when Matt asks;
  Netlify credits run low, so batch changes into one push.

## Next actions

1. Confirm the course directory works on a real search (read `course-lookup` logs if not).
2. `Attest` signatures live per phone in localStorage; sharing them needs a DB column.
3. Prod has a duplicate "Kissena Golf Course" (0 rounds) beside "Kissena Park Golf Course".
4. Magic Link email templates: Matt pastes the code-only versions from
   `supabase/email-templates/` into Authentication > Emails > Templates (no MCP tool for that).
5. iOS haptics trick (`buzz()` via a switch input) is untested on a real iPhone.

## Decisions not to reopen

- Light theme only, Manrope, "Scorecard Clean". Dark mode and stylized fonts were rejected.
- Tabs: Home, Rounds, Log (raised centre), Courses, You. Trips are reached from Home and You,
  not a tab. Standings page is `/h2h`.
- The Saddam is minimal everywhere except Standings: one small badge beside the holder on Home.
- Do not add more forest/green surfaces; reach for scenes, sky, sand, cream. Recent-round tiles
  stay small (124px).
- Venmo Pay/Request stay Venmo blue with the Venmo mark.
- Trophy names are Matt's, raunchy on purpose. Keep them.
- Wrapped music is Matt's own recording (`public/wrapped-song.m4a`). A copyrighted melody was
  declined; do not reintroduce one.
- Use the named text scale (text-caption … text-hero), never `text-[Npx]`; section titles in
  sentence case; `BackButton` from `components/Nav.tsx`, never a literal "← Back";
  `useLogSheet().open`, never `navigate('/log')`; new inline editors call `useHoldUpdates()`.
- `src/data/seed.ts` ships in the public bundle and holds fictional demo data only. Never put
  real trip details (door codes, confirmations) back in it.

## Traps

- Supabase's built-in mailer caps at 2 emails/hour and the rate-limit field is locked until
  custom SMTP exists. Brevo SMTP is configured and the limit raised to 30/h. Magic links from a
  Gmail sender via Brevo land in Gmail spam; tell new golfers. "Check your email" never proves
  delivery; Brevo's transactional logs do.
- Edge Functions called from the browser must handle OPTIONS and return CORS headers; push
  notifications silently never sent until 2026-09-25 for that reason.
- Supabase upsert checks both insert and update policies; `trips_insert` must use the same
  attendee predicate as `trips_update`.
- Netlify env vars are inlined at build time; changing them needs a redeploy.
- `../Launch Golf App.bat` runs cloud mode against prod; local testing through it writes real
  data. It also collides with the preview server on 5173.
- Pushing: the auto-mode classifier refuses a command chain containing `git push`. Commit,
  then run `git push origin main` alone once Matt asks. Verify with `git ls-remote origin main`
  and by curling the hashed bundle for a new UI string; one of Matt's own pushes did not land.
- Money arithmetic is integer cents with remainder cents spread across the first sharers.
- No ffmpeg: media work uses WebCodecs + mp4-muxer in the browser pane
  (`../marketing-video/`). pdf-parse reads the trip PDFs (`new PDFParse({data}).getText()`).
