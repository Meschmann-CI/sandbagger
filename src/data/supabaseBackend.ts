import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Bet, Course, CourseRanking, CourseRating, Expense, Group, Payment, Player, Round, Trip } from '../types'
import type { Backend, Change } from './backend'
import { RetryLater } from './outbox'
import type { RoundField } from '../lib/scorePatch'

// Maps between the app's camelCase shapes and the snake_case tables in
// supabase/schema.sql. Rounds keep their player scores in a child table;
// trip itineraries and options stay as JSONB because they're edited as a
// unit and carry nested photos and reviews.

const num = (v: unknown) => (v == null ? 0 : Number(v))

function toPlayer(row: any): Player {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    handicap: num(row.handicap),
    homeCourse: row.home_course ?? undefined,
    color: row.color,
    email: row.email ?? undefined,
    venmo: row.venmo ?? undefined,
    guest: row.is_guest || undefined,
    mutedRounds: row.muted_rounds?.length ? row.muted_rounds : undefined,
    chirpsOff: row.chirps_off ?? undefined,
    bag: Array.isArray(row.bag) && row.bag.length ? row.bag : undefined,
  }
}

function toTrip(row: any): Trip {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    status: row.status,
    location: row.location ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    note: row.note ?? undefined,
    attendeeIds: row.attendee_ids ?? [],
    createdById: row.created_by ?? '',
    chosenOptionId: row.chosen_option_id ?? undefined,
    options: row.options ?? [],
    itinerary: row.itinerary ?? [],
    cover: row.cover || undefined,
    stories: row.stories ?? undefined,
  }
}

const tripRow = (t: Trip) => ({
  id: t.id,
  group_id: t.groupId,
  name: t.name,
  status: t.status,
  location: t.location ?? null,
  start_date: t.startDate ?? null,
  end_date: t.endDate ?? null,
  note: t.note ?? null,
  attendee_ids: t.attendeeIds,
  created_by: t.createdById || null,
  chosen_option_id: t.chosenOptionId ?? null,
  options: t.options,
  itinerary: t.itinerary,
  cover: t.cover ?? null,
  stories: t.stories ?? null,
})

const courseRow = (c: Course) => ({
  id: c.id,
  group_id: c.groupId,
  name: c.name,
  slug: c.slug,
  pars: c.pars,
  stroke_index: c.strokeIndex ?? null,
  rating: c.rating ?? null,
  slope: c.slope ?? null,
  tees: c.tees ?? null,
  town: c.town ?? null,
  yards: c.yards ?? null,
  yards_tee: c.yardsTee ?? null,
  nines: c.nines ?? null,
  brand: c.brand ?? null,
})

const courseRatingRow = (r: CourseRating) => ({
  id: r.id,
  group_id: r.groupId,
  course_slug: r.courseSlug,
  course_name: r.courseName,
  player_id: r.playerId,
  overall: r.overall,
  aspects: r.aspects ?? {},
  note: r.note ?? null,
  rated_on: r.date,
})

const toCourseRating = (row: any): CourseRating => ({
  id: row.id,
  groupId: row.group_id,
  courseSlug: row.course_slug,
  courseName: row.course_name,
  playerId: row.player_id,
  overall: num(row.overall),
  aspects: row.aspects && Object.keys(row.aspects).length ? row.aspects : undefined,
  note: row.note ?? undefined,
  date: row.rated_on,
})

const courseRankingRow = (r: CourseRanking) => ({
  player_id: r.playerId,
  group_id: r.groupId,
  slugs: r.slugs,
  updated_at: new Date().toISOString(),
})

// A round's own fields (src/lib/scorePatch.ts) to their columns, for a
// patch that writes only what changed.
const ROUND_COLUMNS: Record<RoundField, string> = {
  date: 'played_on',
  courseName: 'course_name',
  tee: 'tee',
  tripId: 'trip_id',
  notes: 'notes',
  saddamOnTheLine: 'saddam',
  ghosts: 'ghosts',
  photos: 'photos',
  nines: 'nines',
  greenFee: 'green_fee',
  teeTime: 'tee_time',
  bookedById: 'booked_by',
}

const roundRow = (r: Round) => ({
  id: r.id,
  group_id: r.groupId,
  played_on: r.date,
  course_name: r.courseName,
  tee: r.tee ?? null,
  trip_id: r.tripId ?? null,
  notes: r.notes ?? null,
  saddam: r.saddamOnTheLine ?? null,
  ghosts: r.ghosts ?? null,
  photos: r.photos ?? null,
  nines: r.nines ?? null,
  // Written only when set, so a plain round saves the same with or
  // without the booked-rounds columns (supabase/apply-2026-10-22-booked-rounds.sql).
  green_fee: r.greenFee ?? null,
  ...(r.teeTime ? { tee_time: r.teeTime } : {}),
  ...(r.bookedById ? { booked_by: r.bookedById } : {}),
})

const expenseRow = (e: Expense) => ({
  id: e.id,
  trip_id: e.tripId,
  description: e.description,
  amount: e.amount,
  category: e.category,
  paid_by: e.paidById,
  shared_by: e.sharedByIds,
  spent_on: e.date ?? null,
})

const paymentRow = (p: Payment) => ({
  id: p.id,
  trip_id: p.tripId ?? null,
  round_id: p.roundId ?? null,
  from_player: p.fromId,
  to_player: p.toId,
  amount: p.amount,
  paid_on: p.date ?? null,
})

const betRow = (b: Bet) => ({
  id: b.id,
  round_id: b.roundId,
  type: b.type,
  name: b.name,
  stake: b.stake,
  results: b.results,
  manual: b.manual ?? false,
  net: b.net ?? null,
  winner_take_all: b.winnerTakeAll ?? false,
  // The game's setup (match-play Nassau, wolf, Vegas). Left out of the
  // row until a bet has one, so saves keep working on a database that
  // hasn't had apply-2026-10-23-more-bets.sql yet.
  ...(betGame(b) ? { game: betGame(b) } : {}),
})

// Which of a bet's fields holds its game setup, by type.
const GAME_FIELD = { nassau: 'nassau', wolf: 'wolf', vegas: 'vegas', sixes: 'sixes', bbb: 'bbb', junk: 'junk', hammer: 'hammer' } as const
const betGame = (b: Bet) => {
  const field = GAME_FIELD[b.type as keyof typeof GAME_FIELD]
  return field ? b[field] : undefined
}
// A stored setup only comes back when it has the shape its game needs, so
// a half-written one leaves the bet on its stored results.
const gameFromRow = (type: string, g: any): Partial<Bet> => {
  if (!g || typeof g !== 'object') return {}
  if (type === 'nassau') return g.format === 'match' ? { nassau: g } : {}
  if (type === 'wolf') return Array.isArray(g.order) ? { wolf: { order: g.order, picks: Array.isArray(g.picks) ? g.picks : [] } } : {}
  if (type === 'vegas') return Array.isArray(g.teams) ? { vegas: g } : {}
  if (type === 'sixes') return Array.isArray(g.order) ? { sixes: { order: g.order } } : {}
  if (type === 'bbb') return { bbb: { picks: Array.isArray(g.picks) ? g.picks : [] } }
  if (type === 'junk') return { junk: { kinds: Array.isArray(g.kinds) ? g.kinds : [], claims: Array.isArray(g.claims) ? g.claims : [] } }
  if (type === 'hammer') {
    return Array.isArray(g.teams)
      ? { hammer: { teams: g.teams, limit: typeof g.limit === 'number' ? g.limit : 3, holes: Array.isArray(g.holes) ? g.holes : [] } }
      : {}
  }
  return {}
}

export class NoPlayerError extends Error {
  email: string | null
  groupExists: boolean
  constructor(email: string | null, groupExists: boolean) {
    super('No player profile for this account')
    this.email = email
    this.groupExists = groupExists
  }
}

export function makeSupabaseBackend(client: SupabaseClient, playerId: string, groupId: string): Backend {
  const guard = (error: { message: string; code?: string; status?: number; statusCode?: string | number } | null, what: string) => {
    if (!error) return
    // A stale token is not a refusal of this write: PostgREST answers
    // PGRST301 ("JWT expired") and storage answers 401. The outbox keeps
    // the change and retries once the session is refreshed.
    const stale =
      error.code === 'PGRST301' ||
      error.code === 'PGRST302' ||
      error.status === 401 ||
      String(error.statusCode ?? '') === '401' ||
      /\bjwt\b|expired/i.test(error.message)
    if (stale) throw new RetryLater(`${what}: ${error.message}`)
    throw new Error(`${what}: ${error.message}`)
  }

  // supabase-js sends a request with the anon key when the session is
  // gone (the token expired while the phone slept and the refresh failed),
  // and row-level security then refuses it with the same message a bad row
  // gets. Check first so the outbox queues the write instead of dropping
  // it. getSession refreshes an expired token itself when it can.
  const requireSession = async () => {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new RetryLater('Not signed in right now; the change is saved on this phone and will be sent once the session is back')
  }

  // A delete blocked by row-level security comes back as success with zero
  // rows touched, not as an error — so the row silently survives while the
  // screen shows it gone. Ask for the deleted ids and treat none as failure.
  const removeRow = async (table: string, id: string, what: string) => {
    const { data: gone, error } = await client.from(table).delete().eq('id', id).select('id')
    guard(error, what)
    if (!gone || gone.length === 0) {
      throw new Error(`${what}: nothing was deleted (you may not have permission)`)
    }
  }

  return {
    cloud: true,

    async load(): Promise<AppData> {
      const [
        groupRes,
        playersRes,
        coursesRes,
        ratingsRes,
        rankingsRes,
        tripsRes,
        roundsRes,
        roundPlayersRes,
        betsRes,
        expensesRes,
        paymentsRes,
        chirpsRes,
      ] = await Promise.all([
        client.from('groups').select('*').eq('id', groupId).single(),
        client.from('players').select('*').eq('group_id', groupId).order('created_at'),
        client.from('courses').select('*').eq('group_id', groupId).order('name'),
        client.from('course_ratings').select('*').eq('group_id', groupId),
        client.from('course_rankings').select('*').eq('group_id', groupId),
        client.from('trips').select('*'),
        client.from('rounds').select('*').order('played_on'),
        client.from('round_players').select('*'),
        client.from('bets').select('*'),
        client.from('expenses').select('*'),
        client.from('payments').select('*'),
        // The last two days only: chirps are for the round being watched.
        client.from('chirps').select('*').gte('created_at', new Date(Date.now() - 2 * 86_400_000).toISOString()).order('created_at'),
      ])

      guard(groupRes.error, 'Loading group')
      guard(playersRes.error, 'Loading players')
      guard(coursesRes.error, 'Loading courses')
      guard(ratingsRes.error, 'Loading course ratings')
      guard(rankingsRes.error, 'Loading course rankings')
      guard(tripsRes.error, 'Loading trips')
      guard(roundsRes.error, 'Loading rounds')
      guard(roundPlayersRes.error, 'Loading scores')

      const scoresByRound = new Map<string, Round['players']>()
      for (const rp of roundPlayersRes.data ?? []) {
        const list = scoresByRound.get(rp.round_id) ?? []
        list.push({
          playerId: rp.player_id,
          gross: rp.gross,
          handicapSnapshot: num(rp.handicap_snapshot),
          holes: rp.holes ?? undefined,
          putts: rp.putts ?? undefined,
          selfHoles: rp.self_holes?.some(Boolean) ? rp.self_holes : undefined,
        })
        scoresByRound.set(rp.round_id, list)
      }
      // The table has no order of its own, and Postgres hands back a row it
      // has just updated after the others, so every saved score used to
      // reshuffle the card on everyone else's phone mid-round (Matt,
      // 2026-10-24). Roster order, the same on every device.
      const rosterIndex = new Map((playersRes.data ?? []).map((p: any, i: number) => [p.id, i]))
      for (const list of scoresByRound.values()) {
        list.sort((a, b) => (rosterIndex.get(a.playerId) ?? 999) - (rosterIndex.get(b.playerId) ?? 999))
      }

      const players = (playersRes.data ?? []).map(toPlayer)
      const group: Group = {
        id: groupRes.data.id,
        name: groupRes.data.name,
        inviteCode: groupRes.data.invite_code,
        adminId: (playersRes.data ?? []).find((p: any) => p.is_admin)?.id ?? playerId,
        // Guests are never members, whatever is_member defaulted to.
        memberIds: (playersRes.data ?? []).filter((p: any) => p.is_member && !p.is_guest).map((p: any) => p.id),
        saddamAward: groupRes.data.saddam_award ?? undefined,
      }

      return {
        players,
        group,
        currentUserId: playerId,
        courses: (coursesRes.data ?? []).map((c: any) => ({
          id: c.id,
          groupId: c.group_id,
          name: c.name,
          slug: c.slug,
          pars: c.pars ?? [],
          strokeIndex: c.stroke_index ?? undefined,
          rating: c.rating != null ? Number(c.rating) : undefined,
          slope: c.slope != null ? Number(c.slope) : undefined,
          tees: Array.isArray(c.tees) && c.tees.length ? c.tees : undefined,
          town: c.town ?? undefined,
          yards: Array.isArray(c.yards) && c.yards.length ? c.yards : undefined,
          yardsTee: c.yards_tee ?? undefined,
          nines: Array.isArray(c.nines) && c.nines.length >= 2 ? c.nines : undefined,
          brand: c.brand && typeof c.brand.color === 'string' ? c.brand : undefined,
        })),
        courseRatings: (ratingsRes.data ?? []).map(toCourseRating),
        courseRankings: (rankingsRes.data ?? []).map((r: any) => ({
          playerId: r.player_id,
          groupId: r.group_id,
          slugs: r.slugs ?? [],
        })),
        trips: (tripsRes.data ?? []).map(toTrip),
        rounds: (roundsRes.data ?? []).map((r: any) => ({
          id: r.id,
          groupId: r.group_id,
          date: r.played_on,
          courseName: r.course_name,
          tee: r.tee ?? undefined,
          tripId: r.trip_id ?? undefined,
          notes: r.notes ?? undefined,
          saddamOnTheLine: r.saddam ?? undefined,
          ghosts: Array.isArray(r.ghosts) && r.ghosts.length ? r.ghosts : undefined,
          photos: Array.isArray(r.photos) && r.photos.length ? r.photos : undefined,
          nines: Array.isArray(r.nines) && r.nines.length === 2 ? (r.nines as [string, string]) : undefined,
          teeTime: r.tee_time ?? undefined,
          bookedById: r.booked_by ?? undefined,
          greenFee: r.green_fee?.payerId ? { payerId: r.green_fee.payerId, amount: num(r.green_fee.amount) } : undefined,
          players: scoresByRound.get(r.id) ?? [],
        })),
        bets: (betsRes.data ?? []).map((b: any) => ({
          id: b.id,
          roundId: b.round_id,
          type: b.type,
          name: b.name,
          stake: num(b.stake),
          results: b.results ?? [],
          manual: b.manual || undefined,
          net: b.net ?? undefined,
          winnerTakeAll: b.winner_take_all || undefined,
          ...gameFromRow(b.type, b.game),
        })),
        expenses: (expensesRes.data ?? []).map((e: any) => ({
          id: e.id,
          tripId: e.trip_id,
          description: e.description,
          amount: num(e.amount),
          category: e.category,
          paidById: e.paid_by,
          sharedByIds: e.shared_by ?? [],
          date: e.spent_on ?? undefined,
        })),
        payments: (paymentsRes.data ?? []).map((p: any) => ({
          id: p.id,
          tripId: p.trip_id ?? undefined,
          roundId: p.round_id ?? undefined,
          fromId: p.from_player,
          toId: p.to_player,
          amount: num(p.amount),
          date: p.paid_on ?? undefined,
        })),
        // Not guarded: before supabase/apply-2026-10-23-spectate.sql there is
        // no chirps table, and that mustn't stop the app loading.
        chirps: chirpsRes.error
          ? []
          : (chirpsRes.data ?? []).map((c: any) => ({
              id: c.id,
              roundId: c.round_id,
              fromId: c.from_player,
              toId: c.to_player,
              text: c.text,
              at: c.created_at,
            })),
      }
    },

    async apply(change: Change) {
      await requireSession()
      switch (change.kind) {
        case 'round.upsert': {
          const r = change.round
          guard((await client.from('rounds').upsert({ ...roundRow(r), created_by: playerId })).error, 'Saving round')
          // Upsert the score rows rather than clearing and reinserting
          // them. Four phones share one card on the course, and a
          // delete-then-insert briefly empties the round — a concurrent
          // save from another phone lands in that window and the row it
          // wrote is gone.
          if (r.players.length) {
            guard(
              (
                await client.from('round_players').upsert(
                  r.players.map((rp) => ({
                    round_id: r.id,
                    player_id: rp.playerId,
                    gross: rp.gross,
                    handicap_snapshot: rp.handicapSnapshot,
                    holes: rp.holes ?? null,
                    putts: rp.putts ?? null,
                  })),
                  { onConflict: 'round_id,player_id' },
                )
              ).error,
              'Saving scores',
            )
          }
          // Drop only golfers actually taken off the round, so a save
          // never removes someone another phone just added.
          const keep = r.players.map((rp) => rp.playerId)
          const prune = client.from('round_players').delete().eq('round_id', r.id)
          guard(
            (await (keep.length ? prune.not('player_id', 'in', `(${keep.join(',')})`) : prune)).error,
            'Removing golfers from round',
          )
          return
        }
        case 'round.patch': {
          const { round: r, roundChanged, scores, removed } = change.patch
          const changed = change.patch.changed ?? []
          if (roundChanged && changed.length) {
            // Only the columns this save changed, so a stale copy of the
            // rest (photos, the fee) stays out of the write.
            const row = roundRow(r) as Record<string, unknown>
            const partial = Object.fromEntries(changed.map((k) => [ROUND_COLUMNS[k], ROUND_COLUMNS[k] in row ? row[ROUND_COLUMNS[k]] : null]))
            guard((await client.from('rounds').update(partial).eq('id', r.id)).error, 'Saving round')
          } else if (roundChanged) {
            guard((await client.from('rounds').upsert({ ...roundRow(r), created_by: playerId })).error, 'Saving round')
          }
          if (scores.length) {
            const merged = await client.rpc('merge_round_scores', { p_round: r.id, p_scores: scores })
            if (merged.error) {
              // Before the function exists (supabase/apply-2026-10-22-merge-scores.sql),
              // fall back to writing just the golfers this save touched.
              if (merged.error.code !== 'PGRST202') guard(merged.error, 'Saving scores')
              const touched = r.players.filter((rp) => scores.some((s) => s.playerId === rp.playerId))
              guard(
                (
                  await client.from('round_players').upsert(
                    touched.map((rp) => ({
                      round_id: r.id,
                      player_id: rp.playerId,
                      gross: rp.gross,
                      handicap_snapshot: rp.handicapSnapshot,
                      holes: rp.holes ?? null,
                      putts: rp.putts ?? null,
                    })),
                    { onConflict: 'round_id,player_id' },
                  )
                ).error,
                'Saving scores',
              )
            }
          }
          if (removed.length) {
            guard(
              (await client.from('round_players').delete().eq('round_id', r.id).in('player_id', removed)).error,
              'Removing golfers from round',
            )
          }
          return
        }
        case 'round.delete': {
          // The round's photos live in the bucket under its folder;
          // deleting the row alone would strand them there forever.
          const folder = `${groupId}/${change.id}`
          const { data: files } = await client.storage.from('round-photos').list(folder)
          if (files && files.length) {
            await client.storage.from('round-photos').remove(files.map((f) => `${folder}/${f.name}`))
          }
          await removeRow('rounds', change.id, 'Deleting round')
          return
        }
        case 'course.upsert': {
          // The row is keyed by id, but the app keys a course by its slug
          // (saveCourse reuses the local course with the same slug, so
          // "add the same course twice by name" edits one course). Two
          // phones adding the same course offline each mint their own id,
          // and a rename moves the slug on the server (rename_course) while
          // a queued save still carries the old one. Upserting on
          // (group_id, slug) with a different id tried to rewrite the
          // primary key (course_maps points at it); upserting on id alone
          // would create a duplicate slug or revert a rename. So look the
          // course up both ways first:
          //  - a row with this id exists: write into it, but keep the
          //    server's name and slug (only rename_course may change them,
          //    and it already updated rounds and ratings to match);
          //  - no row with this id but one with this slug: that is the
          //    same course added from another phone; merge into its id.
          // After that the upsert is on the primary key and the
          // (group_id, slug) unique index only ever rejects a real clash.
          const c = change.course
          const [byIdRes, bySlugRes] = await Promise.all([
            client.from('courses').select('id, name, slug').eq('id', c.id).maybeSingle(),
            client.from('courses').select('id, name, slug').eq('group_id', c.groupId).eq('slug', c.slug).maybeSingle(),
          ])
          guard(byIdRes.error, 'Saving course')
          guard(bySlugRes.error, 'Saving course')
          const byId = byIdRes.data as { id: string; name: string; slug: string } | null
          const bySlug = bySlugRes.data as { id: string; name: string; slug: string } | null
          const row = byId ? { ...courseRow(c), name: byId.name, slug: byId.slug } : bySlug ? { ...courseRow(c), id: bySlug.id } : courseRow(c)
          guard((await client.from('courses').upsert(row)).error, 'Saving course')
          return
        }
        case 'course.delete':
          await removeRow('courses', change.id, 'Deleting course')
          return
        case 'course.rename':
          // In the database, since it rewrites other golfers' ratings and lists.
          guard(
            (await client.rpc('rename_course', { old_slug: change.oldSlug, new_name: change.name })).error,
            'Renaming course',
          )
          return
        case 'courseRating.upsert':
          guard(
            (
              await client
                .from('course_ratings')
                .upsert(courseRatingRow(change.rating), { onConflict: 'group_id,course_slug,player_id' })
            ).error,
            'Saving rating',
          )
          return
        case 'courseRating.delete':
          await removeRow('course_ratings', change.id, 'Deleting rating')
          return
        case 'courseRanking.upsert':
          guard(
            (await client.from('course_rankings').upsert(courseRankingRow(change.ranking), { onConflict: 'player_id' })).error,
            'Saving your order',
          )
          return
        case 'bet.upsert':
          guard((await client.from('bets').upsert(betRow(change.bet))).error, 'Saving bet')
          return
        case 'bet.results':
          guard((await client.from('bets').update({ results: change.results }).eq('id', change.id)).error, 'Saving bet')
          return
        case 'bet.delete':
          await removeRow('bets', change.id, 'Deleting bet')
          return
        case 'trip.upsert':
          guard((await client.from('trips').upsert(tripRow(change.trip))).error, 'Saving trip')
          return
        case 'trip.delete':
          await removeRow('trips', change.id, 'Deleting trip')
          return
        case 'trip.vote':
          // Toggled inside the database so simultaneous votes don't
          // overwrite each other. See toggle_trip_vote in schema.sql.
          guard(
            (await client.rpc('toggle_trip_vote', { trip_id: change.tripId, option_id: change.optionId })).error,
            'Saving vote',
          )
          return
        case 'player.upsert': {
          const p = change.player
          guard(
            (
              await client.from('players').upsert({
                id: p.id,
                group_id: groupId,
                name: p.name,
                initials: p.initials,
                handicap: p.handicap,
                home_course: p.homeCourse ?? null,
                color: p.color,
                email: p.email ?? null,
                venmo: p.venmo ?? null,
                is_guest: p.guest ?? false,
                // Written only when set, so a save works before the spectator columns exist.
                ...(p.mutedRounds ? { muted_rounds: p.mutedRounds } : {}),
                ...(p.chirpsOff != null ? { chirps_off: p.chirpsOff } : {}),
                // Written only when set, so a save works before apply-2026-10-30-bag.sql.
                ...(p.bag ? { bag: p.bag } : {}),
              })
            ).error,
            'Saving golfer',
          )
          return
        }
        case 'player.delete':
          // Keep their history; just drop them from the roster.
          guard((await client.from('players').update({ is_member: false }).eq('id', change.id)).error, 'Removing golfer')
          return
        case 'expense.upsert':
          guard((await client.from('expenses').upsert(expenseRow(change.expense))).error, 'Saving cost')
          return
        case 'expense.delete':
          await removeRow('expenses', change.id, 'Deleting cost')
          return
        case 'payment.upsert':
          guard((await client.from('payments').upsert(paymentRow(change.payment))).error, 'Saving payback')
          return
        case 'chirp.add': {
          const c = change.chirp
          guard(
            (await client.from('chirps').insert({ id: c.id, round_id: c.roundId, from_player: c.fromId, to_player: c.toId, text: c.text })).error,
            'Sending chirp',
          )
          return
        }
        case 'payment.delete':
          await removeRow('payments', change.id, 'Deleting payback')
          return
        case 'group.upsert':
          guard(
            (
              await client
                .from('groups')
                .update({ name: change.group.name, saddam_award: change.group.saddamAward ?? null })
                .eq('id', groupId)
            ).error,
            'Saving group',
          )
          return
        // Local-only concerns.
        case 'session.currentUser':
        case 'reset':
          return
      }
    },

    subscribe(onRemoteChange: () => void) {
      const channel = client
        .channel('sandbagger-sync')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => onRemoteChange())
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}

// Resolves the signed-in user to a player row, claiming one that was
// created for their email before they had an account.
export async function resolveMyPlayer(client: SupabaseClient) {
  const { data: claimed, error } = await client.rpc('claim_my_player')
  if (error) throw new Error(`Signing in: ${error.message}`)

  if (!claimed) {
    const { data: auth } = await client.auth.getUser()
    const { count } = await client.from('groups').select('id', { count: 'exact', head: true })
    throw new NoPlayerError(auth.user?.email ?? null, (count ?? 0) > 0)
  }

  const { data: row, error: rowError } = await client.from('players').select('id, group_id').eq('id', claimed).single()
  if (rowError) throw new Error(`Loading profile: ${rowError.message}`)
  return { playerId: row.id as string, groupId: row.group_id as string }
}
