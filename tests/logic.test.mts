// Exercises the game logic in src/lib without a browser: the bets, the
// course and tee lookups, ghosts and the trophy counts.
//
//   node tests/logic.test.mts
//
// Nothing here touches window, localStorage or Supabase: bets.ts,
// courses.ts, ghost.ts and badges.ts only pull in holes.ts, stats.ts and
// the types, so no stubs are needed. Same shape as outbox.test.mts: plain
// checks, one process, exit code says whether it passed.

import { register } from 'node:module'
import type { AppData, Bet, Course, Round, RoundPlayer } from '../src/types.ts'

// The lib files import each other the Vite way ('./holes', no extension).
// Node's loader wants the extension, so a resolve hook tries '.ts' first.
// Registered before the dynamic imports below, which is why they are not
// static ones at the top.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\\.[a-z]+$/i.test(specifier)) {
    try { return await next(specifier + '.ts', context) } catch {}
  }
  return next(specifier, context)
}`),
)

const { calcMatchPlay, calcNassau, calcSkins } = await import('../src/lib/bets.ts')
const { courseForRound, teeFor } = await import('../src/lib/courses.ts')
const { ghostOptions } = await import('../src/lib/ghost.ts')
const { badgesFor } = await import('../src/lib/badges.ts')
const { roundPatch, applyScorePatch, CLEARED } = await import('../src/lib/scorePatch.ts')
const { roundBetSettlements } = await import('../src/lib/settlements.ts')
const { trophiesFrom, trophyPushTitle, trophyWhy } = await import('../src/lib/trophyMoments.ts')
const { isBooked, sortBookings, findRound, bookedRounds, teeTimeLabel, teeTimeInput } = await import('../src/lib/bookings.ts')

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const pass = a === e
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${pass ? '' : `\n        expected ${e}\n        actual   ${a}`}`)
}

// --- fixtures ---
const G = 'g1'
const rp = (playerId: string, holes: (number | null)[], handicapSnapshot = 10): RoundPlayer => ({
  playerId,
  handicapSnapshot,
  holes,
  gross: holes.some((h) => h != null) ? holes.reduce<number>((s, h) => s + (h ?? 0), 0) : null,
})
const fours = (...overrides: [number, number][]) => {
  const card = Array<number>(18).fill(4)
  for (const [hole, score] of overrides) card[hole] = score
  return card
}
const round = (id: string, date: string, players: RoundPlayer[], extra: Partial<Round> = {}): Round => ({
  id,
  groupId: G,
  date,
  courseName: 'Test Links',
  players,
  ...extra,
})
const data = (extra: Partial<AppData> = {}): AppData => ({
  players: [],
  group: { id: G, name: 'Test', inviteCode: 'x', adminId: 'me', memberIds: [] },
  courses: [],
  courseRatings: [],
  courseRankings: [],
  rounds: [],
  trips: [],
  bets: [],
  expenses: [],
  payments: [],
  currentUserId: 'me',
  ...extra,
})
const cents = (n: number) => Math.round(n * 100)
const sumCents = (results: { amount: number }[]) => results.reduce((s, r) => s + cents(r.amount), 0)
const amount = (results: { playerId: string; amount: number }[], id: string) => results.find((r) => r.playerId === id)?.amount ?? 0

// 1. Winner-take-all skins, three tied leaders on a $5 pot: whole cents,
//    the odd cent to the first leaders, and the lot nets to zero.
{
  const r = round('wta', '2026-06-01', [
    rp('a', fours([0, 3])),
    rp('b', fours([1, 3])),
    rp('c', fours([2, 3])),
    rp('d', fours()),
  ])
  const out = calcSkins(r, ['a', 'b', 'c', 'd'], 5, false, undefined, true)
  check('WTA skins: pot nets to zero in cents', sumCents(out.results), 0)
  check('WTA skins: first leaders take the odd cents', [amount(out.results, 'a'), amount(out.results, 'b'), amount(out.results, 'c')], [1.67, 1.67, 1.66])
  check('WTA skins: the loser antes the stake', amount(out.results, 'd'), -5)
}

// 2. A golfer removed from the round after the bet was placed is not charged.
{
  const r = round('gone', '2026-06-01', [rp('a', fours([0, 3])), rp('b', fours())])
  const skins = calcSkins(r, ['a', 'b', 'c'], 5, false)
  check('skins: removed golfer owes nothing', amount(skins.results, 'c'), 0)
  check('skins: winner collects from the golfers who played', [amount(skins.results, 'a'), amount(skins.results, 'b')], [5, -5])
  check('skins: nets to zero', sumCents(skins.results), 0)

  const nassau = calcNassau(r, ['a', 'b', 'c'], 5, false)
  check('nassau: removed golfer owes nothing', amount(nassau.results, 'c'), 0)
  // Hole 1 wins the front and the eighteen; the back is all fours, halved.
  check('nassau: two segments won, one stake each', [amount(nassau.results, 'a'), amount(nassau.results, 'b')], [10, -10])
  check('nassau: nets to zero', sumCents(nassau.results), 0)

  const wta = calcSkins(r, ['a', 'b', 'c'], 5, false, undefined, true)
  check('WTA skins: removed golfer does not ante', amount(wta.results, 'c'), 0)
  check('WTA skins: pot is only the players who played', [amount(wta.results, 'a'), amount(wta.results, 'b')], [5, -5])

  const match = calcMatchPlay(r, ['a', 'b'], 5, false)
  check('match play: nets to zero', sumCents(match.results), 0)
}

// 3. Nassau net with no stroke index: 16.9 and 17.0 on identical cards is a
//    tie on every segment, not three wins for the 17.0.
{
  const r = round('nassau', '2026-06-01', [rp('a', fours(), 16.9), rp('b', fours(), 17.0)])
  const out = calcNassau(r, ['a', 'b'], 5, true)
  check('nassau net, no index: every segment halved', out.detail.filter((d) => d.includes('halved')).length, 3)
  check('nassau net, no index: nobody pays', [amount(out.results, 'a'), amount(out.results, 'b')], [0, 0])
}

// 4. teeFor matches a course tee named "White Tees" however the round typed it.
{
  const course = {
    id: 'c1',
    groupId: G,
    name: 'Test Links',
    slug: 'test links',
    pars: Array(18).fill(4),
    rating: 72.0,
    slope: 130,
    tees: [{ name: 'White Tees', rating: 70.1, slope: 125 }],
  } as Course
  check('teeFor: "white" finds "White Tees"', teeFor(course, 'white'), { rating: 70.1, slope: 125 })
  check('teeFor: "White Tees" finds "White Tees"', teeFor(course, 'White Tees'), { rating: 70.1, slope: 125 })
  check('teeFor: "Whites" finds "White Tees"', teeFor(course, 'Whites'), { rating: 70.1, slope: 125 })
  check('teeFor: unknown tee falls back to the course default', teeFor(course, 'blue'), { rating: 72, slope: 130 })
}

// 5. courseForRound on a 27-hole course where one nine's tee has no holeYards.
{
  const nine = (n: number) => Array(9).fill(n)
  const course = {
    id: 'c27',
    groupId: G,
    name: 'Three Nines',
    slug: 'three nines',
    pars: Array(18).fill(4),
    nines: [
      { name: 'Meadows', pars: nine(4), strokeIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9], tees: [{ name: 'White' }] },
      { name: 'Lakes', pars: nine(5), strokeIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9], tees: [{ name: 'White', holeYards: nine(400) }] },
      { name: 'Woods', pars: nine(3), strokeIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9], tees: [{ name: 'White', holeYards: nine(300) }] },
    ],
  } as unknown as Course
  let threw: string | null = null
  let joined: Course | undefined
  try {
    joined = courseForRound(data({ courses: [course] }), { courseName: 'Three Nines', nines: ['Meadows', 'Lakes'], tee: 'white' })
  } catch (err) {
    threw = (err as Error).message
  }
  check('courseForRound: a tee without holeYards does not throw', threw, null)
  check('courseForRound: the pairing still joins', joined?.pars, [...nine(4), ...nine(5)])
  check('courseForRound: the nine without yards is the shorter one, so takes the evens', joined?.strokeIndex?.slice(0, 2), [2, 4])
}

// 6. Ghost options only offer complete cards.
{
  const today = round('today', '2026-06-10', [rp('me', Array(18).fill(null))])
  const full = round('full', '2026-05-01', [rp('me', fours())])
  const partial = round('partial', '2026-05-20', [rp('me', [5, 5])])
  const options = ghostOptions(data({ rounds: [today, full, partial] }), today, 'me')
  check('ghostOptions: the two-hole card is left out', options.map((o) => o.round.id), ['full'])
  check('ghostOptions: a lone option is not starred', options[0]?.best, false)
}

// 7. skinsWon reads one bet, not the concatenation of overlapping bets.
{
  const r = round('skins', '2026-06-01', [rp('me', fours([0, 3])), rp('b', fours())])
  const bet = (id: string): Bet => ({
    id,
    roundId: r.id,
    type: 'skins',
    name: 'Skins',
    stake: 5,
    net: false,
    results: [
      { playerId: 'me', amount: 5 },
      { playerId: 'b', amount: -5 },
    ],
  })
  const three = data({ rounds: [r], bets: [bet('s1'), bet('s2'), bet('s3')] })
  const sweep = badgesFor(three, 'me', '2026-10-11').find((b) => b.key === 'sweep')
  check('skinsWon: one skin in three overlapping bets is one skin', sweep?.earned, false)

  const r3 = round('skins3', '2026-06-02', [rp('me', fours([0, 3], [5, 3], [9, 3])), rp('b', fours())])
  const one = data({ rounds: [r3], bets: [{ ...bet('s4'), roundId: r3.id }] })
  const sweep3 = badgesFor(one, 'me', '2026-10-11').find((b) => b.key === 'sweep')
  check('skinsWon: three skins in one bet is a sweep', sweep3?.earned, true)
}

// 8. Wrapped badges scope to the year.
{
  const last = round('last', '2025-07-01', [rp('me', fours([0, 3]))]) // 71: broke 100 in 2025
  const thisYear = round('this', '2026-07-01', [rp('me', Array(18).fill(6))]) // 108
  const d = data({ rounds: [last, thisYear] })
  const allTime = badgesFor(d, 'me', '2026-10-11').find((b) => b.key === 'break100')
  const in2026 = badgesFor(d, 'me', '2026-10-11', '2026').find((b) => b.key === 'break100')
  check('badgesFor: Broke 100 is on the all-time shelf', allTime?.earned, true)
  check('badgesFor: Broke 100 is not in the 2026 year', in2026?.earned, false)
  const triple2026 = badgesFor(d, 'me', '2026-10-11', '2026').find((b) => b.key === 'triple')
  check('badgesFor: the 108 counts in 2026', [triple2026?.earned, triple2026?.roundId], [true, 'this'])
}

// 9. Rounds booked ahead stay out of the played rounds until a score lands.
{
  const booked = (id: string, date: string, teeTime: string) => round(id, date, [rp('me', Array(18).fill(null))], { teeTime, bookedById: 'me' })
  const played = round('played', '2026-10-01', [rp('me', fours())])
  check('isBooked: tee time and no scores', isBooked(booked('b', '2026-11-01', '8:10 AM')), true)
  check('isBooked: no tee time is a round waiting on scores', isBooked(round('w', '2026-11-01', [rp('me', Array(18).fill(null))])), false)
  const d = sortBookings(data({ rounds: [played, booked('b', '2026-11-01', '8:10 AM')] }))
  check('sortBookings: the booking leaves rounds', [d.rounds.map((r) => r.id), d.bookings?.map((r) => r.id)], [['played'], ['b']])
  check('findRound: finds a booking', findRound(d, 'b')?.id, 'b')
  const started = { ...d, bookings: d.bookings!.map((r) => ({ ...r, players: [rp('me', [4, ...Array(17).fill(null)])] })) }
  const moved = sortBookings(started)
  check('sortBookings: the first hole moves it across', [moved.rounds.map((r) => r.id).sort(), moved.bookings], [['b', 'played'], []])
  const order = bookedRounds(data({ bookings: [booked('c', '2026-11-02', '7:00 AM'), booked('b', '2026-11-01', '1:30 PM'), booked('a', '2026-11-01', '8:10 AM')] }))
  check('bookedRounds: soonest first, by tee time on the day', order.map((r) => r.id), ['a', 'b', 'c'])
  check('teeTimeLabel', [teeTimeLabel('08:10'), teeTimeLabel('13:05'), teeTimeLabel('00:30'), teeTimeLabel('12:00')], ['8:10 AM', '1:05 PM', '12:30 AM', '12:00 PM'])
  check('teeTimeInput', [teeTimeInput('8:10 AM'), teeTimeInput('1:05 PM'), teeTimeInput(undefined)], ['08:10', '13:05', '08:00'])
}

// 10. Two phones scoring the same card merge instead of overwriting.
{
  const blank = (): (number | null)[] => Array(18).fill(null)
  const at = (card: (number | null)[], i: number, v: number | null) => card.map((h, k) => (k === i ? v : h))
  const base = round('shared', '2026-10-24', [
    { playerId: 'pat', handicapSnapshot: 12, gross: null, holes: undefined },
    { playerId: 'matt', handicapSnapshot: 16.9, gross: null, holes: undefined },
  ])
  // Matt's phone (signal) scores Pat on holes 1 and 2; Pat's phone, with no
  // signal and the old copy, scores himself on hole 3 and Matt on hole 1.
  const mattSaves = { ...base, players: [{ ...base.players[0], holes: at(at(blank(), 0, 4), 1, 5) }, base.players[1]] }
  const patSaves = { ...base, players: [{ ...base.players[0], holes: at(blank(), 2, 3) }, { ...base.players[1], holes: at(blank(), 0, 6) }] }
  const a = roundPatch(base, mattSaves)!
  const b = roundPatch(base, patSaves)!
  check('roundPatch: only what changed', [a.roundChanged, a.scores.map((s) => [s.playerId, s.holes])], [false, [['pat', { '0': 4, '1': 5 }]]])
  let server = base.players
  for (const patch of [a, b]) {
    server = server.map((rp) => {
      const s = patch.scores.find((x) => x.playerId === rp.playerId)
      return s ? applyScorePatch(rp, s) : rp
    })
  }
  check('merge: Pat keeps holes from both phones', server[0].holes?.slice(0, 3), [4, 5, 3])
  check('merge: Matt keeps his hole 1', server[1].holes?.[0], 6)
  // Clearing a hole and finishing a card.
  const cleared = applyScorePatch(server[0], { playerId: 'pat', handicapSnapshot: 12, holes: { '1': CLEARED } })
  check('merge: a cleared hole clears', cleared.holes?.slice(0, 3), [4, null, 3])
  const full = applyScorePatch(undefined, { playerId: 'pat', handicapSnapshot: 12, holes: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i), 4])) })
  check('merge: a full card sets the total', full.gross, 72)
  const putting = roundPatch(base, { ...base, players: [{ ...base.players[0], putts: at(blank(), 0, 2) }, base.players[1]] })!
  check('roundPatch: putts switched on', [putting.scores[0].puttsMode, putting.scores[0].putts], ['on', { '0': 2 }])
  check('merge: putts on', applyScorePatch(base.players[0], putting.scores[0]).putts?.slice(0, 2), [2, null])
  check('merge: putts said no', applyScorePatch(base.players[0], { playerId: 'pat', handicapSnapshot: 12, puttsMode: 'off' }).putts, [])
  const removed = roundPatch(base, { ...base, players: [base.players[0]], notes: 'rain' })!
  check('roundPatch: removed golfers and round fields', [removed.removed, removed.roundChanged, removed.scores], [['matt'], true, []])
}

// 11. Green fees one golfer covered: the others owe them a head.
{
  const r = round('fees', '2026-10-24', [rp('matt', fours()), rp('pat', fours()), rp('barry', fours())], { greenFee: { payerId: 'matt', amount: 85 } })
  const owed = (d: AppData) => roundBetSettlements(d, r).map((s) => [s.fromId, s.toId, s.amount]).sort()
  check('green fees: each of the others owes the payer', owed(data({ rounds: [r] })), [['barry', 'matt', 85], ['pat', 'matt', 85]])
  const paid = data({ rounds: [r], payments: [{ id: 'pay', roundId: 'fees', fromId: 'pat', toId: 'matt', amount: 85, date: '2026-10-24' }] })
  check('green fees: a payback clears it', owed(paid), [['barry', 'matt', 85]])
  const bet: Bet = { id: 'b', roundId: 'fees', type: 'custom', name: 'Skins', stake: 5, results: [{ playerId: 'barry', amount: -12 }, { playerId: 'matt', amount: 12 }] }
  check('green fees: net with the bets, one Venmo each', owed(data({ rounds: [r], bets: [bet] })), [['barry', 'matt', 97], ['pat', 'matt', 85]])
}

// 12. Trophies one round earned, and the one push per golfer.
{
  const old = round('t-old', '2026-05-01', [{ playerId: 'kim', handicapSnapshot: 21, gross: 97 }])
  const fresh = round('t-new', '2026-10-24', [{ playerId: 'kim', handicapSnapshot: 21, gross: 89 }])
  const won = trophiesFrom(data({ rounds: [old, fresh] }), 't-new', 'kim', '2026-10-24')
  check('trophiesFrom: Broke 90 is a first', won.find((t) => t.badge.key === 'break90')?.first, true)
  check('trophiesFrom: Broke 100 is a repeat, if it shows', won.find((t) => t.badge.key === 'break100')?.first ?? false, false)
  check('trophiesFrom: firsts lead', won.findIndex((t) => !t.first) === -1 || won.slice(won.findIndex((t) => !t.first)).every((t) => !t.first), true)
  const b = won.find((t) => t.badge.key === 'break90')!
  const s = { badge: { ...b.badge, key: 'snowman', label: 'Snowman', how: 'Make an 8 on any hole.', count: 3 }, first: false }
  check('push: one', trophyPushTitle('Barry', 'Split Rock', [b]), 'Barry earned Broke 90 at Split Rock')
  check('push: two', trophyPushTitle('Barry', 'Split Rock', [b, s]), 'Barry earned Broke 90 and Snowman at Split Rock')
  check('push: four', trophyPushTitle('Barry', 'Split Rock', [b, s, s, s]), 'Barry earned Broke 90 and 3 other trophies at Split Rock')
  check('why: a repeat', trophyWhy(s), "Make an 8 on any hole. That's 3.")
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
