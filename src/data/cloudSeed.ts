import type { SupabaseClient } from '@supabase/supabase-js'
import { seedData } from './seed'
import { AVATAR_COLORS } from './store'

// Copies the sample data into a fresh Supabase project. Seed ids like
// "p-alex" aren't UUIDs, so everything gets remapped on the way in.

const uuid = () => crypto.randomUUID()

export async function seedCloudGroup(
  client: SupabaseClient,
  opts: { groupId: string; ownerPlayerId: string; ownerName: string },
) {
  const { groupId, ownerPlayerId, ownerName } = opts
  const idMap = new Map<string, string>()

  // The person creating the group inherits one seed profile so the sample
  // history attaches to them instead of leaving them with an empty one.
  const firstName = ownerName.trim().split(/\s+/)[0]?.toLowerCase()
  const ownerSeed = seedData.players.find((p) => p.name.toLowerCase() === firstName) ?? seedData.players[0]
  if (ownerSeed) idMap.set(ownerSeed.id, ownerPlayerId)

  // --- Players ---
  const newPlayers = seedData.players.filter((p) => !idMap.has(p.id))
  newPlayers.forEach((p) => idMap.set(p.id, uuid()))
  if (newPlayers.length) {
    const { error } = await client.from('players').insert(
      newPlayers.map((p, i) => ({
        id: idMap.get(p.id),
        group_id: groupId,
        name: p.name,
        initials: p.initials,
        handicap: p.handicap,
        home_course: p.homeCourse ?? null,
        color: p.color || AVATAR_COLORS[i % AVATAR_COLORS.length],
      })),
    )
    if (error) throw new Error(`Adding golfers: ${error.message}`)
  }

  const pid = (id: string) => idMap.get(id) ?? null
  const pids = (ids: string[]) => ids.map((id) => idMap.get(id)).filter((x): x is string => !!x)

  // --- Trips ---
  seedData.trips.forEach((t) => idMap.set(t.id, uuid()))
  if (seedData.trips.length) {
    const { error } = await client.from('trips').insert(
      seedData.trips.map((t) => ({
        id: idMap.get(t.id),
        group_id: groupId,
        name: t.name,
        status: t.status,
        location: t.location ?? null,
        start_date: t.startDate ?? null,
        end_date: t.endDate ?? null,
        note: t.note ?? null,
        attendee_ids: pids(t.attendeeIds),
        created_by: pid(t.createdById) ?? ownerPlayerId,
        chosen_option_id: t.chosenOptionId ?? null,
        // Votes inside the options blob point at players too.
        options: t.options.map((o) => ({ ...o, votes: pids(o.votes) })),
        // Reviews inside itinerary items likewise.
        itinerary: t.itinerary.map((item) => ({
          ...item,
          reviews: item.reviews?.map((r) => ({ ...r, playerId: pid(r.playerId) })).filter((r) => r.playerId) ?? undefined,
        })),
      })),
    )
    if (error) throw new Error(`Adding trips: ${error.message}`)
  }

  // --- Rounds and scores ---
  seedData.rounds.forEach((r) => idMap.set(r.id, uuid()))
  if (seedData.rounds.length) {
    const { error } = await client.from('rounds').insert(
      seedData.rounds.map((r) => ({
        id: idMap.get(r.id),
        group_id: groupId,
        played_on: r.date,
        course_name: r.courseName,
        tee: r.tee ?? null,
        trip_id: r.tripId ? idMap.get(r.tripId) : null,
        notes: r.notes ?? null,
        created_by: ownerPlayerId,
      })),
    )
    if (error) throw new Error(`Adding rounds: ${error.message}`)

    const scores = seedData.rounds.flatMap((r) =>
      r.players
        .filter((rp) => idMap.has(rp.playerId))
        .map((rp) => ({
          round_id: idMap.get(r.id),
          player_id: idMap.get(rp.playerId),
          gross: rp.gross,
          handicap_snapshot: rp.handicapSnapshot,
          holes: rp.holes ?? null,
        })),
    )
    if (scores.length) {
      const { error: scoreError } = await client.from('round_players').insert(scores)
      if (scoreError) throw new Error(`Adding scores: ${scoreError.message}`)
    }
  }

  // --- Bets ---
  if (seedData.bets.length) {
    const { error } = await client.from('bets').insert(
      seedData.bets.map((b) => ({
        id: uuid(),
        round_id: idMap.get(b.roundId),
        type: b.type,
        name: b.name,
        stake: b.stake,
        results: b.results.map((res) => ({ ...res, playerId: pid(res.playerId) })).filter((res) => res.playerId),
      })),
    )
    if (error) throw new Error(`Adding bets: ${error.message}`)
  }

  // --- Money ---
  if (seedData.expenses.length) {
    const { error } = await client.from('expenses').insert(
      seedData.expenses.map((e) => ({
        id: uuid(),
        trip_id: idMap.get(e.tripId),
        description: e.description,
        amount: e.amount,
        category: e.category,
        paid_by: pid(e.paidById),
        shared_by: pids(e.sharedByIds),
        spent_on: e.date ?? null,
      })),
    )
    if (error) throw new Error(`Adding costs: ${error.message}`)
  }

  if (seedData.payments.length) {
    const { error } = await client.from('payments').insert(
      seedData.payments.map((p) => ({
        id: uuid(),
        trip_id: idMap.get(p.tripId),
        from_player: pid(p.fromId),
        to_player: pid(p.toId),
        amount: p.amount,
        paid_on: p.date ?? null,
      })),
    )
    if (error) throw new Error(`Adding paybacks: ${error.message}`)
  }
}
