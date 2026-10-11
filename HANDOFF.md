# Bandit (repo and folder still "sandbagger"): handoff

Read this first. `README.md` and `SETUP.md` cover running and deploying it;
`../golf-app-handoff.md.txt` is the original brief. Personal app for Matt's golf group
(Matt, Nader, Barry, Pat), not CI work: no CI brand or house voice, trash-talk copy welcome.

## Current state, 2026-10-10

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
- Course branding (2026-10-10): `src/lib/courseBrands.ts` maps a course name to its logo
  (`public/logos/`, pulled from each course's own site) and hole-row colour. The scorecard,
  the live card, the course page and the course list use it; a course with no entry keeps the
  Sandbagger card. 40 of the 45 prod courses have one; Central, Dutcher, Overpeck, Hendricks
  Field and Weequahic publish no logo, and Eisenhower is colour only.
  Since 2026-10-10 (committed, not pushed) a brand can also be set in the app, no deploy:
  `courses.brand` jsonb ({logo, color, dark, wide, tall}) wins over the built-in list. Set on
  the course Edit card ("Logo and colour": Choose image, Paste, Colour), or by the scanner
  (`scan-card` v6 returns `brand.logoBox` + `brand.color`; an existing course reviews it in
  that section, a new one shows it in the scan card and takes it on Add).
  `src/lib/courseLogo.ts` trims, fades a light paper background to transparent, detects white
  artwork (`dark`) and picks swatches; files go to the public `course-logos` bucket at
  `<group_id>/<course_id>-<stamp>.png`. The store calls `syncStoredBrands` each render so
  `courseBrand(name)` stays a plain lookup. Untested on a phone: Paste (iOS shows its own
  Paste bubble), a real upload, and the scanner's logo box on a real card.
- "Generic AI" pass (2026-10-10): tracked all-caps eyebrow labels, the time-of-day greeting,
  the sparkline, the four-stat tile row, the left-border quote card, page stat subtitles,
  explainer captions and em dashes in copy all removed.
- Push only when Matt asks; Netlify credits run low, so batch changes into one push.
  `netlify.toml` skips the build when a push only touches `.github/`, `supabase/` or `*.md`;
  `[skip netlify]` in the head commit message skips any push outright.
- Keep-alive (2026-10-10): `.github/workflows/keepalive.yml` runs every 6 hours; `keepalive()`
  upserts the one row in `keepalive_heartbeat` (RLS on, no policies) and the job also reads
  `rounds` (empty for anon). Check with `select * from keepalive_heartbeat`. The old weekly
  read-only ping is the pattern that drew a pause warning on Process Mapper.

## Next actions

1. Confirm the course directory works on a real search (see item 10; read `course-lookup` logs if not).
2. `Attest` signatures live per phone in localStorage; sharing them needs a DB column.
3. Course logos in the app: built 2026-10-10 (see Current state). After the push, try it
   on a phone: paste a logo from a course site, and scan a real card.
4. GPS yardages from OpenStreetMap (golf=hole / golf=green): fetch once when a course is
   added, store in Supabase, never query Overpass live on the course (it was down on
   2026-10-10). Fallback: an "I'm on the green" button that pins a green for the group.
5. Dropped (Matt, 2026-10-10): the code-only Magic Link templates in
   `supabase/email-templates/` aren't needed; iOS autofills the code from the email.
6. iOS haptics trick (`buzz()` via a switch input) is untested on a real iPhone.

7. Redesign, rolled back 2026-10-10. The Claude Design pass (canvas
   https://claude.ai/artifact/2XSg6hhea91gscdJeUmm3s) was built on branch `redesign` (SF Pro,
   new tokens, capsule tab bar, tiles and sheets everywhere) for Home, Live scoring and Round
   detail. Matt preferred the deployed look, so branch `refresh` starts from main and keeps
   only the redesign's layout and features, in the original fonts and colours: per-tee
   yardages, the tee-coloured card with Index and Out/In, the live Hole view with the pad
   always up, Home's group-name title / live strip / season race, Round detail's logo over
   the scene. `refresh` was merged to main and pushed 2026-10-10 (5cb9729). `redesign` stays as a reference; don't merge it.
   Flat chosen 2026-10-10 (see Decisions). Branch `flat-preview` was the throwaway CSS
   comparison; it is superseded and can be deleted.
9. Per-tee yardages (2026-10-10): `CourseTee.holeYards`, `yardsFor()` picks the played tee's
   yards, `course-lookup` v3 (deployed) returns every tee's holes. Courses page "Every tee's
   yardage" pulls 16 courses a tap (35 requests a day); Matt taps it over a few days after
   the push.
8. Long term: a native SwiftUI app. Needs a Mac with Xcode (none on this Windows laptop) and
   the $99/yr Apple Developer Program for TestFlight. Supabase, the Edge Functions and the
   schema carry over unchanged; the TS logic in `src/lib` (bets, handicaps, money, ghost,
   badges) has to be ported to Swift. The design brief asks for native iOS idioms for this.
   Matt has no Mac as of 2026-10-10, so the web redesign comes first and the port waits. If a
   Mac stays out of reach, React Native + Expo (cloud iOS builds) is the fallback.

10. Course rename + directory search (live 2026-10-10, d0a5b48).
   - Rename on the course Edit card. `rename_course(old_slug, new_name)` in schema.sql
     (applied to prod 2026-10-10, tested in a rolled-back transaction) renames the course row
     and slug, every round's course_name, ratings, everyone's ranking slugs and home courses
     in one transaction. Onto a name with its own card: refused. Onto a name only rounds use:
     those rounds join this course (the confirm says so). The app mirrors it in
     `renameCourseIn` (`src/lib/courses.ts`); `currentSlug` keeps Back working onto pages
     addressed by the old slug.
   - Search: `course-lookup` v4 (deployed 2026-10-10) returns up to 25 and, when the full
     name finds nothing, searches its distinctive word once more (one extra request, flagged
     `broadened`). The app sorts results: same town as the course first, then the states
     the group plays in, most played first (`rankNearby` in `src/lib/courseLookup.ts`).
   - Still to do: one real search on a phone after the push (try "Centennial Golf Club").
     If it misses, read the `course-lookup` logs.

## Decisions not to reopen

- The app is called Bandit (Matt, 2026-10-10), renamed from Sandbagger: title, home-screen
  name, manifest, sign-in, Wrapped, share cards, Venmo notes, push fallback, email templates.
  The Sandbagger trophy and the SANDBAGGER stamp keep the word; it is the joke. The repo,
  folder, Netlify address (thesandbagger.netlify.app) and code names stay, since changing the
  address would break installed home screens and the sign-in links.

- Light theme only, Manrope, "Scorecard Clean". Dark mode and stylized fonts were rejected.
- Tabs (Matt, 2026-10-10): Home, Rounds, Log (raised centre), Standings (`/h2h`), You. Courses
  sit beside rounds under the Rounds tab (a Rounds | Courses switch at the top of both pages,
  replace-navigation); Trips have a section on Home and live under You, never a tab.
- Standings is the whole argument: 2026 / All-time chips scope everything; the Saddam as a
  band; the table with last-5 form squares, movement since the latest group round and run
  notes (counted in scope); money bars; your rivalries (grid behind Every matchup); records
  and the wall of shame; handicaps this year (hidden until someone's index has moved).
  The form squares are rounds against handicap (Matt, 2026-10-10): last five rounds, solo
  included, net vs par with the day's course handicap: beat it, within 3, 4+ over. Placings
  were tried first and dropped because they mean different things in a twosome and a
  foursome. Run notes and the drought record stay about wins.
- Putts (Matt, 2026-10-10): `round_players.putts int[]`. Undefined means the round never
  said, so the current golfer is tracked by default; an empty list is tracking turned off;
  18 entries is on. Entered with 0/1/2/3/4+ buttons under each tracking golfer on the Hole
  view ("Putts: You · Change" picks who), shown as a tiny row tucked under the golfer on
  both cards (`PuttsRow`; the corner-number version was tried and dropped), with Putting
  stats in Your game once 9 holes are in and the Flatstick and Four-Jack trophies (art in
  `trophyArtExtra.ts`, kept out of the generated file).
- 27-hole courses (Matt, 2026-10-10): `courses.nines` (jsonb list of nines: pars, men's 1-9
  handicaps, yards per tee) and `rounds.nines` (two names, front first). Everything that
  scores a round calls `courseForRound`, never `findCourse(round.courseName)`, so the
  pairing reaches cards, strokes, bets, stats, trophies and ghosts (ghosts only race the
  same pairing). Joined index: the longer nine (longest tee) takes the odd strokes; this
  reproduced Centennial's stored Meadows/Lakes index exactly. Rating/slope stay course
  level (cards don't print one per pairing). A round with no pairing is the first two
  nines. No course-editor UI for nines yet: Centennial was loaded from its card.
- Trophy art is the Claude Design handoff in `../design/sandbagger-trophies` (zip beside the
  repo): six shelf shapes, earned and locked. `src/lib/trophyArt.ts` is generated by
  `node scripts/make-trophy-art.mjs ../design/sandbagger-trophies .`; `Medal` draws it in
  React with the count and lock dots as HTML overlays. A new trophy needs an entry there
  (it falls back to its shelf shape with its mark until it has one).
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
- Copy reads like a person wrote it for four friends: no tracked all-caps labels (form labels,
  eyebrows, table heads are sentence case; only the scorecard grid's HOLE/PAR row and the
  rubber-stamp and cheer exclamations stay caps), no em dashes, no caption explaining what a
  control obviously does, no stat-summary subtitle under page titles. Home's title is the
  group's name, not a sentence; where you stand is the line under the season race.
- Live scoring keeps the number pad, always up on the Hole view; its last key reads Next hole.
  The hole row (Hole view and every card) is the colour of the tees being played, falling
  back to the course colour. The card scrolls sideways with names pinned, Out after 9.
- Live round on Home is the near-black strip (yellow Live, score thru N, white Hole N
  button, yellow progress line). Matt rejected a big tile, a yellow strip and a white card.
- Round detail: with the podium showing, no "X won" line; the trash talk sits under it.
- Flat, not tiles (Matt, 2026-10-10, after a side-by-side): `Card` in `components/ui.tsx` is
  an edge-to-edge section of the page (`.sb-section`: past the gutter, a hairline above and
  below, no corners, shadow or fill; tinted ones keep their tint). Pass `tile` only where a
  box is the point: sign-in, setup, the error splash, boxes inside the bet editor. The live
  strip, the season race, hero banners, photos and scenes stay as they are. Stacked cards
  sit flush (no space-y) so they share one line. Sticky table cells inside a section are
  `bg-paper`, not `bg-card`. Matt found rounded tiles everywhere looked "designed in PPT".
- Home: the trip in play is a row under More (scene thumbnail, votes or days out, a Vote
  nudge), not a big card; the score you owe sits under Recent rounds.
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
- `course.upsert` writes the whole row (`courseRow` sends every column), so anything that
  rebuilds a Course must start from the existing one. `saveCourse` dropped `nines` until
  2026-10-10 (any scorecard save on Centennial would have wiped its three nines); it now
  spreads `existing` first. A new course column needs adding to `courseRow` and the load map.
- Course brands match on the course slug by regex, first match first, so a facility's
  specific courses (Bethpage Black) sit above the facility (Bethpage). Logos with white
  artwork need `dark: true` or they vanish on white; long wordmarks need `wide: true` or
  they shrink to nothing in the square list tiles.
- Money arithmetic is integer cents with remainder cents spread across the first sharers.
- No ffmpeg: media work uses WebCodecs + mp4-muxer in the browser pane
  (`../marketing-video/`). pdf-parse reads the trip PDFs (`new PDFParse({data}).getText()`).
