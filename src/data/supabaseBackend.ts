import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, Bet, Course, Expense, Group, Payment, Player, Round, Trip } from '../types'
import type { Backend, Change } from './backend'

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
})

const courseRow = (c: Course) => ({
  id: c.id,
  group_id: c.groupId,
  name: c.name,
  slug: c.slug,
  pars: c.pars,
  stroke_index: c.strokeIndex ?? null,
})

const roundRow = (r: Round) => ({
  id: r.id,
  group_id: r.groupId,
  played_on: r.date,
  course_name: r.courseName,
  tee: r.tee ?? null,
  trip_id: r.tripId ?? null,
  notes: r.notes ?? null,
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
  trip_id: p.tripId,
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
})

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
  const guard = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message}`)
  }

  // A delete blocked by row-level security comes back as success with zero
  // rows touched, not as an error — so the row silently survives while the
  // screen shows it gone. Ask for the deleted ids and treat none as failure.
  const removeRow = async (table: string, id: string, what: string) => {
    const { data: gone, error } = await client.from(table).delete().eq('id', id).select('id')
    guard(error, what)
    if (!gone || gone.length === 0) {
      throw new Error(`${what}: nothing was deleted — you may not have permission`)
    }
  }

  return {
    cloud: true,

    async load(): Promise<AppData> {
      const [groupRes, playersRes, coursesRes, tripsRes, roundsRes, roundPlayersRes, betsRes, expensesRes, paymentsRes] =
        await Promise.all([
          client.from('groups').select('*').eq('id', groupId).single(),
          client.from('players').select('*').eq('group_id', groupId).order('created_at'),
          client.from('courses').select('*').eq('group_id', groupId).order('name'),
          client.from('trips').select('*'),
          client.from('rounds').select('*').order('played_on'),
          client.from('round_players').select('*'),
          client.from('bets').select('*'),
          client.from('expenses').select('*'),
          client.from('payments').select('*'),
        ])

      guard(groupRes.error, 'Loading group')
      guard(playersRes.error, 'Loading players')
      guard(coursesRes.error, 'Loading courses')
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
        })
        scoresByRound.set(rp.round_id, list)
      }

      const players = (playersRes.data ?? []).map(toPlayer)
      const group: Group = {
        id: groupRes.data.id,
        name: groupRes.data.name,
        inviteCode: groupRes.data.invite_code,
        adminId: (playersRes.data ?? []).find((p: any) => p.is_admin)?.id ?? playerId,
        memberIds: (playersRes.data ?? []).filter((p: any) => p.is_member).map((p: any) => p.id),
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
          players: scoresByRound.get(r.id) ?? [],
        })),
        bets: (betsRes.data ?? []).map((b: any) => ({
          id: b.id,
          roundId: b.round_id,
          type: b.type,
          name: b.name,
          stake: num(b.stake),
          results: b.results ?? [],
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
          tripId: p.trip_id,
          fromId: p.from_player,
          toId: p.to_player,
          amount: num(p.amount),
          date: p.paid_on ?? undefined,
        })),
      }
    },

    async apply(change: Change) {
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
        case 'round.delete':
          await removeRow('rounds', change.id, 'Deleting round')
          return
        case 'course.upsert':
          guard((await client.from('courses').upsert(courseRow(change.course), { onConflict: 'group_id,slug' })).error, 'Saving course')
          return
        case 'course.delete':
          await removeRow('courses', change.id, 'Deleting course')
          return
        case 'bet.upsert':
          guard((await client.from('bets').upsert(betRow(change.bet))).error, 'Saving bet')
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
