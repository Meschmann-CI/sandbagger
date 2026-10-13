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
  Since 2026-10-10 (live, 0f024a5) a brand can also be set in the app, no deploy:
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

- Design polish (2026-10-11, merged to main and pushed): explainer captions
  trimmed; forest kept for the big moments (season race, You header, Saddam, Log button),
  picked chips are ink via `chip()` and view switches are the iOS `Segmented` in
  `components/ui.tsx`; podium 2nd/3rd sand; Round detail actions are a row of round buttons
  with short labels; the number pad is keys (par key labelled, haptic tick); Rounds and
  Courses have one control row (filter / view as a title-row pill, Add course a round +);
  tab icons fill when active; Wrapped banner is a twilight scene (`CourseScene frame="horizon"`);
  white-tee bands shaded via `bandFill`; Card view golfers in a flat strip; bigger record
  numbers. Delights: live wind on the hole map (`lib/liveWind.ts`, Open-Meteo current, live
  rounds only) and a note plus box ring when another phone posts a score.
- Hole-map runs (2026-10-11): "Get them" lives in `lib/mapJobs.ts`, outside the Courses page,
  so it keeps going across screens; the queue is saved on the phone and resumes at launch
  (`resumeMaps` in Shell); it holds app updates while running. Matt reported the old version
  stopping when he changed screens.

- Audit (2026-10-11, branch `audit-fixes` off main, not pushed): `AUDIT-2026-10-11.md` is
  the full report. Fixed on the branch: the app no longer reboots on every resume and
  hourly token refresh (App.tsx boots on the user id, not the session object); the trip
  page no longer crashes on an unscored round; an `ErrorBoundary` under Shell's Outlet
  catches a page throw (keyed by route); `sw.js` v4 only caches `/assets/`, `/logos/`,
  `/splash/` and static files, so the 10-minute version probe no longer fills Cache
  Storage, and a non-OK navigation never becomes the offline shell; `scan-card` v7 and
  `course-lookup` v5 (both deployed) require a player row via `claim_my_player`, not just
  a Supabase account, and scan-card returns a CORS-clean 502 when the Anthropic call
  fails. Cleanup: dead files and exports removed, PuttsRow on `text-caption`, empty-value
  glyph is `–` everywhere, README/SETUP brought up to date, eight merged branches and
  `flat-preview` deleted. `faces` was left alone on purpose (Matt undecided).
  Applied to prod by Matt through the SQL editor the same day (the MCP migration call is
  blocked in auto mode): `supabase/apply-2026-10-11.sql`, storage listing policies scoped
  to the group and the four sign-in actions revoked from `public, anon` (verified). When
  `faces` merges, its `player_photos_read` policy in schema.sql needs the same
  `to authenticated` + folder scope (prod already has it).
  Second pass the same day (`audit-fixes-2`, the "worth fixing soon" list): the outbox
  keeps a write whose token expired (`RetryLater` from `supabaseBackend.guard` and a
  `requireSession` check before every write; 401 / PGRST301 / "JWT expired" are
  retryable); `course.upsert` looks the row up by id and by slug first and upserts on the
  primary key (a row that exists keeps the server's name and slug, so a queued save can't
  undo a rename; a same-slug row from another phone is merged); the logo editor removes
  the old file only after `whenSettled()` says the write landed; bets pay only golfers
  still on the round, Nassau net with no stroke index rounds the course handicap first,
  winner-take-all skins split in integer cents; `teeFor` normalises both sides with
  `teeKey`; a nine's tee without `holeYards` no longer throws; `badgesFor` takes a `year`
  so Wrapped only lists the season's trophies; `skinsWon` is per bet (max); ghost options
  need a complete card; the wind resets when the key goes null; HoleEntry flushes a
  pending commit on unmount, writes on exit only when dirty, nulls a gross whose card is
  no longer complete, and shows an error when "I'm on the green" can't save;
  `link-preview` checks the caller's origin, refuses private hosts and IP literals, walks
  redirects by hand and streams the body to the 400 KB cap. `npm test` now runs
  `tests/outbox.test.mts` and `tests/logic.test.mts` (55 checks).

## Next actions

-1. Native iPhone push: live on the server side since 2026-10-13. Matt pasted the
   `apns_tokens` SQL (verified: table, RLS, one policy) and set APNS_KEY, APNS_KEY_ID
   (88XKTYV55K), APNS_TEAM_ID (Z689MA24A3) and APNS_BUNDLE_ID (com.eschmann.bandit);
   `notify` v9 is deployed (sends web push as before, plus APNs; tolerates a key pasted
   with literal \n). Not yet exercised end to end: the first real check is a round
   logged while a TestFlight phone has notifications on. If nothing arrives, read the
   `notify` logs; a bad key fails quietly in `apnsJwt`.
0. Audit follow-ups (2026-10-11): all done except the three faces-only items
   (sticky Avatar failure, EXIF orientation, EditGolfer deleting the old photo before the
   row lands), which wait on the `faces` decision. The hygiene list at the bottom of
   `AUDIT-2026-10-11.md` (nine inline editors without `useHoldUpdates`, Wrapped's
   `text-[Npx]`, Attest's UTC date, link-preview DNS rebinding) is still open.
1. Done: the directory search worked on Matt's phone (2026-10-10).
2. `Attest` signatures live per phone in localStorage; sharing them needs a DB column.
3. Course logos in the app: built 2026-10-10 (see Current state). After the push, try it
   on a phone: paste a logo from a course site, and scan a real card.
4. GPS and hole maps: live 2026-10-10 (0a5a19c). See "Hole maps and GPS"
   under Decisions. After the push: Matt taps "Get them" under Courses > Ratings (Hole maps
   card) to pull every course, then tries distances on a real round.
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
8. The native SwiftUI port is under way (since 2026-10-11, on the Mac) in
   `../bandit-swift/`, GitHub `Meschmann-CI/bandit` (private). Its README "State" section
   is the port's state document. `BanditCore` ports all of `src/lib` with the logic tests;
   the app has the shell, every tab, cloud mode against the same Supabase project, trophy
   art, scenes and logos, the live card and the bets editor. New logic in `src/lib` has to
   land in `BanditCore` too, or the two apps settle the same bet differently. The web app
   stays live and is the design reference for the port.

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
- Tabs (Matt, 2026-10-12, replacing 2026-10-10): Home, Rounds, Log (centre), Trips, You, on a
  floating pill (white at 92% over a blur, after Matt found 70% too see-through; soft shadow, a light green pill behind the current tab, Log a
  small forest circle in the middle). Matt picked it from three looks (flat, floating with Log
  beside, this); his 2026-10-10 walk-back was the round-everything restyle, not the bar, so only
  the bar is rounded and pages keep their flat sections. Standings (`/h2h`) leaves the tab bar:
  it opens from Home's season card and a row under You. Both apps have it (web: `Shell.tsx`,
  2026-10-12). Courses sit beside rounds under the Rounds tab (a Rounds | Courses switch at the
  top of both pages, replace-navigation).
- Trips (Matt, 2026-10-12, both apps). The Trips tab has no painted scenes ("they start to feel
  repetitive and lose their appeal"): each booked trip still ahead is a forest ticket stub
  (countdown, where, when, first tee, rounds, a dashed tear, who's going, what's sorted),
  "Voting now" shows the race (a bar per destination by share of the people going, who hasn't
  voted), the archive is a timeline (year, town, rounds, total, champ). Scenes stay on each
  trip's own page. A trip can have its own cover photo (`trips.cover`) and each destination a
  photo (`options[].photo`), in the round-photos bucket under `<group>/trips/<trip>/`; locking
  in copies the winner's photo to the cover if there's none. Planning: "The vote" with the race
  per destination, the leader's pros and cons in two columns, the rest folded. Booked, before
  the end date: readiness strip (done or not; per-person flights aren't stored), where we're
  staying with the listing photo, getting there, schedule, leaderboard, costs, rounds. After it:
  champion card, photo mosaic and viewer, "The stories" (`trips.stories` jsonb; the note leads
  as the organizer's line; you can take back your own), rated items, costs and settle up, final
  standings, rounds, schedule, travel and housing. Both columns applied to prod 2026-10-12.
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
- Hole maps and GPS (Matt, 2026-10-10). A drawn map, not satellite (works with no signal,
  matches the scenes, no tile service). On the Hole view the drawn hole replaces the scene
  when the map has it, turned tee-at-bottom, with the distance chip on it (middle, then front
  and back); "Distances" asks for location once and is remembered per phone. Tap the drawing
  for the full map (`HoleMapSheet`): zoomed from you to the green when you're on the hole,
  whole hole from the tee otherwise; a target you drag anywhere shows yards to it and yards
  left, both live; bunker carries and water reach/carry near the line. Front/middle/back of
  the green only (the daily flag can't be known). "On the Nth tee? Go there" is offered,
  never automatic (one phone keeps the group's card). A hole OpenStreetMap lacks gets "I'm on
  the green": the spot is saved in the map's `marked` for everyone, distances only.
  Data: `src/lib/courseMap.ts` finds the course with Nominatim (outline preferred over a
  pin; tries the name with and without "golf"), pulls everything in its box from Overpass
  (three servers, two passes), picks the course's holes by `golf:course:name` / the ref
  prefix ("Black - 4") / the outline, and refuses holes whose pars disagree with the card
  (<80% of 6+): that's how Split Rock is kept from getting Pelham Bay's 18. Stored packed
  (decimetre deltas, about 25KB a course) in `course_maps` (own table, RLS by group; not on
  `courses`, which every phone reloads on each change), and on the phone per course played.
  "© OpenStreetMap" shows on every map (ODbL). A course's map is fetched on its own when it's
  added (Edit card or the Log sheet's directory pull) and the first time a round opens at a
  course with none (`autoFetchCourseMap`, once per course per phone; a busy server clears
  the flag so a later round retries). Candidate search: name and town, name, then the club's
  own words with and without the town ("bethpage golf course" finds the park that holds
  Blue/Green/Red/Yellow); up to three candidates, skipping any sharing no word with ours.
  The card check scores pars and hole lengths (line length within 12% or 30 yds of any tee).
  Dry run of the real code over all 44 courses, 2026-10-10 (nothing saved): mapped Ferry
  Point, Bethpage Black and Blue (Green/Red/Yellow go the same way), Brownson, Centennial
  (27), Clearview, Douglaston, Dunwoodie, Dyker, Forest Park, Haig Point, Hendricks (6
  greens), HHN, Hudson Hills, Kissena, Maple Moor, Marine Park, Middle Bay, Mohansic,
  Patriot Hills, Pelham Bay (11 greens), Saxon Woods, Silver Lake (17), Sprain Lake, Union
  Vale, Van Cortlandt (14). No usable map: Split Rock (OSM's 18 are Pelham's), La Tourette
  (8/12), River Vale (10/18), Putnam (7/18), Somers (9/18), Sea Pines and NYCC and Overpeck
  and Weequahic (greens, no hole numbers), Eisenhower x3 and Dutcher and Palm Beach (no
  holes). Harbor Links was cut off by a busy server (9/16 before the search fix). Somers and
  Putnam are worth a look: the right course may be numbered differently in OSM.
- `src/data/seed.ts` ships in the public bundle and holds fictional demo data only. Never put
  real trip details (door codes, confirmations) back in it.

## Traps

- auth-js fires `SIGNED_IN` with a new session object on every hidden -> visible
  transition and `TOKEN_REFRESHED` every hour. Never key an effect on the session object;
  key on `session.user.id` (App.tsx). Keying on the object rebooted the app on every
  resume until 2026-10-11.
- `revoke execute ... from anon` does nothing on its own: Supabase grants execute on every
  function to `public`, which `anon` inherits. Revoke from `public, anon` and grant back
  to `authenticated, service_role`. Leave `current_group_id`, `current_player_id` and
  `keepalive` open: RLS policies call the first two as the querying role, and the keep-alive
  Action reads `rounds` and calls `keepalive()` with the anon key.
- The service worker caches any same-origin GET it is told to. A probe with a unique
  query string (`?check=<ts>`) must be excluded or it adds a cache entry per call.
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
  rebuilds a Course must start from the existing one. Since 2026-10-11 it also keeps the
  server's `name` and `slug` when the row already exists: a rename only ever goes through
  `rename_course`. A course editor that wants to change the name must call that RPC.
- The lib files import each other extensionless (`'./holes'`), which Node's loader rejects
  outside Vite; `tests/logic.test.mts` registers a small resolve hook before importing. `saveCourse` dropped `nines` until
  2026-10-10 (any scorecard save on Centennial would have wiped its three nines); it now
  spreads `existing` first. A new course column needs adding to `courseRow` and the load map.
- Course brands match on the course slug by regex, first match first, so a facility's
  specific courses (Bethpage Black) sit above the facility (Bethpage). Logos with white
  artwork need `dark: true` or they vanish on white; long wordmarks need `wide: true` or
  they shrink to nothing in the square list tiles.
- Money arithmetic is integer cents with remainder cents spread across the first sharers.
- No ffmpeg: media work uses WebCodecs + mp4-muxer in the browser pane
  (`../marketing-video/`). pdf-parse reads the trip PDFs (`new PDFParse({data}).getText()`).
