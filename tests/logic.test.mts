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

const { calcMatchPlay, calcNassau, calcNassauMatch, calcSkins, calcVegas, calcWolf, settleFromCard, vegasNumber, nth, calcRabbit, calcSnake, calcSixes, calcStableford, stablefordPoints, calcBbb, calcJunk, calcHammer } = await import('../src/lib/bets.ts')
const { betStatus } = await import('../src/lib/betText.ts')
const { cardOf } = await import('../src/lib/holes.ts')
const { courseForRound, teeFor } = await import('../src/lib/courses.ts')
const { ghostOptions } = await import('../src/lib/ghost.ts')
const { badgesFor } = await import('../src/lib/badges.ts')
const { roundPatch, applyScorePatch, CLEARED } = await import('../src/lib/scorePatch.ts')
const { roundBetSettlements } = await import('../src/lib/settlements.ts')
const { liveLines, cardSlice, leadStory, atTheTurn, spectatorNews } = await import('../src/lib/spectate.ts')
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

// 12. Match-play Nassau with presses. Holes as A sees them: B wins the 1st
//     and 2nd (A 2 down, so the auto press starts on the 3rd), A the 3rd,
//     B the 5th; A wins the 10th and 11th (B 2 down, auto press from the
//     12th), B the 12th, 13th and 14th (2 down in that press: the press
//     from the 14th, already made by hand, answers it). Another press by
//     hand from the 16th. Everything else halved.
{
  const card = (wins: number[]) => fours(...wins.map((h): [number, number] => [h, 3]))
  const a = rp('a', card([2, 9, 10]))
  const b = rp('b', card([0, 1, 4, 11, 12, 13]))
  const play = { format: 'match' as const, autoPress: 2, presses: [{ hole: 13, byId: 'a' }, { hole: 15, byId: 'a' }] }
  const out = calcNassauMatch(round('nm', '2026-06-01', [a, b]), ['a', 'b'], 10, false, undefined, play)
  check('match nassau: every leg read out in order', out.detail, [
    'Takes the front 2&1|b',
    'The press from the 3rd halved.',
    'Takes the back 1 up|b',
    'Takes the press from the 12th 3&2|b',
    'Takes the press from the 14th 1 up|b',
    'The press from the 16th halved.',
    'Takes the eighteen 3&2|b',
  ])
  check('match nassau: five bets won at $10', [amount(out.results, 'a'), amount(out.results, 'b')], [-50, 50])
  check('match nassau: final once every leg is decided', out.computable, true)

  const off = calcNassauMatch(round('nm0', '2026-06-01', [a, b]), ['a', 'b'], 10, false, undefined, { format: 'match' })
  check('match nassau, no presses: front, back and eighteen only', [amount(off.results, 'b'), off.detail.length], [30, 3])

  // Six holes in, a press by hand on the 7th still to start.
  const part = (c: number[]) => c.map((x, i) => (i < 6 ? x : null))
  const live = calcNassauMatch(
    round('nm1', '2026-06-01', [rp('a', part(card([2]))), rp('b', part(card([0, 1, 4])))]),
    ['a', 'b'], 10, false, undefined, { format: 'match', autoPress: 2, presses: [{ hole: 6 }] },
  )
  check('match nassau live: where every leg stands', live.detail, [
    '2 up on the front thru 6|b',
    'The press from the 3rd all square thru 6.',
    'The press from the 7th is on.',
    '2 up on the eighteen thru 6|b',
  ])
  check('match nassau live: nothing paid, still live', [amount(live.results, 'b'), live.computable], [0, false])
  check('match nassau: one on one only', calcNassauMatch(round('nm2', '2026-06-01', [a, b, rp('c', fours())]), ['a', 'b', 'c'], 10, false).computable, false)

  const bet = { id: 'x', roundId: 'nm', type: 'nassau' as const, name: 'N', stake: 10, results: [{ playerId: 'a', amount: 0 }, { playerId: 'b', amount: 0 }], net: false, nassau: play }
  check('settleFromCard: a match-play Nassau settles as one', amount(settleFromCard(bet, round('nm', '2026-06-01', [a, b]))!.results, 'b'), 50)
  check('settleFromCard: a game it does not know keeps its results', settleFromCard({ ...bet, type: 'zzz' as never }, round('nm', '2026-06-01', [a, b])), null)
}

// 13. Wolf, $1, tee order a b c d, five holes in. 1st: a takes b and they
//     win. 2nd: b goes lone and wins (double). 3rd: c goes blind and
//     loses (triple). 4th: d takes a, halved. 5th: no call yet.
{
  const five = (c: number[]) => c.map((x, i) => (i < 5 ? x : null))
  const r = round('wolf', '2026-06-01', [
    rp('a', five(fours([0, 3]))),
    rp('b', five(fours([1, 3]))),
    rp('c', five(fours([2, 5]))),
    rp('d', five(fours())),
  ])
  const play = { order: ['a', 'b', 'c', 'd'], picks: ['b', 'lone', 'blind', 'a', null] }
  const out = calcWolf(r, ['a', 'b', 'c', 'd'], 1, false, undefined, play)
  check('wolf: partners, lone and blind pay as they should', ['a', 'b', 'c', 'd'].map((id) => amount(out.results, id)), [2, 10, -12, 0])
  check('wolf: nets to zero', sumCents(out.results), 0)
  check('wolf: the story of the round', out.detail, [
    '4 holes played.',
    'Went lone on the 2nd and won|b',
    'Went blind on the 3rd and lost|c',
    '1 hole halved.',
    'No call yet on the 5th.',
  ])
  check('wolf: four golfers only', calcWolf(r, ['a', 'b', 'c'], 1, false, undefined, play).computable, false)
  // A partner who is the wolf, or not in the bet, is no call at all.
  const bad = calcWolf(r, ['a', 'b', 'c', 'd'], 1, false, undefined, { order: ['a', 'b', 'c', 'd'], picks: ['a', 'zz'] })
  check('wolf: a call that names nobody waits', bad.detail[0], 'No wolf call on the 1st, 2nd, 3rd, 4th and 5th yet.')
}

// 14. Vegas, 25 cents a point, a & b against c & d, par 4s. 1st: 45 v 44.
//     2nd: a birdies, so c & d's 45 flips to 54 against 36. 3rd: both of
//     c & d birdie, 44 v 33. a & b end up 6 points.
{
  const pars4: Course = { id: 'v', groupId: G, name: 'V', slug: 'v', pars: Array(18).fill(4) }
  const three = (c: number[]) => c.map((x, i) => (i < 3 ? x : null))
  const r = round('vegas', '2026-06-01', [
    rp('a', three(fours([1, 3]))),
    rp('b', three(fours([0, 5], [1, 6]))),
    rp('c', three(fours([1, 5], [2, 3]))),
    rp('d', three(fours([2, 3]))),
  ])
  const teams: [string[], string[]] = [['a', 'b'], ['c', 'd']]
  const out = calcVegas(r, ['a', 'b', 'c', 'd'], 0.25, false, pars4, { teams, birdieFlip: true })
  check('vegas: points times the stake, each', ['a', 'b', 'c', 'd'].map((id) => amount(out.results, id)), [1.5, 1.5, -1.5, -1.5])
  check('vegas: the read-out', out.detail, ['3 holes played.', 'Up 6 points|a+b', '2 birdie flips.'])
  const flat = calcVegas(r, ['a', 'b', 'c', 'd'], 0.25, false, pars4, { teams, birdieFlip: false })
  check('vegas without the flip: c & d up 3', [amount(flat.results, 'c'), flat.detail[1]], [0.75, 'Up 3 points|c+d'])
  check('vegas numbers: low first, a ten stays whole, flipped high first', [vegasNumber([5, 4], false), vegasNumber([4, 10], false), vegasNumber([4, 10], true)], [45, 410, 104])
  check('vegas: the teams have to split the four', calcVegas(r, ['a', 'b', 'c', 'd'], 0.25, false, pars4, { teams: [['a', 'b'], ['a', 'c']] }).detail, ['Pick the two teams.'])
  const names: Record<string, string> = { a: 'Al', b: 'Bo', c: 'Cy', d: 'Di' }
  check('bet lines: a team reads as both names', betStatus(out.detail, (id) => names[id]), '3 holes played. · Al & Bo up 6 points · 2 birdie flips.')
  check('ordinals', [1, 2, 3, 4, 11, 12, 13, 21, 22].map(nth), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
}

// 15. Rabbit, $1, three golfers. a wins the 1st and catches it; b and c
//     tie the 2nd (nothing moves); b wins the 3rd outright and sets it
//     loose; c wins the 5th and catches it, and holds it at the turn. a
//     wins the 10th and it runs loose to the end.
{
  const r = round('rabbit', '2026-06-01', [rp('a', fours([0, 3], [9, 3])), rp('b', fours([1, 3], [2, 3])), rp('c', fours([1, 3], [4, 3]))])
  const out = calcRabbit(r, ['a', 'b', 'c'], 1, false)
  check('rabbit: the front paid to whoever held it at the turn', ['a', 'b', 'c'].map((id) => amount(out.results, id)), [-1, -1, 2])
  check('rabbit: the story', out.detail, ['Took the front|c', 'Nobody held it at the 18th.'])
  const five = (c: number[]) => c.map((x, i) => (i < 5 ? x : null))
  const live = calcRabbit(round('rabbit1', '2026-06-01', r.players.map((p) => ({ ...p, holes: five(cardOf(p)) }))), ['a', 'b', 'c'], 1, false)
  check('rabbit live: who holds it', [live.detail, amount(live.results, 'c')], [['Holds the rabbit since the 5th|c'], 0])
  // Loose at the turn, so the front rides; b catches it on the 13th and keeps it.
  const r2 = round('rabbit2', '2026-06-01', [rp('a', fours([0, 3])), rp('b', fours([1, 3], [12, 3])), rp('c', fours())])
  const out2 = calcRabbit(r2, ['a', 'b', 'c'], 1, false)
  check('rabbit: a riding front pays at the 18th', [['a', 'b', 'c'].map((id) => amount(out2.results, id)), out2.detail], [[-2, 4, -2], ['Nobody held it at the turn. The front rides to the 18th.', 'Took the back and the front|b']])
}

// 16. Snake, $1. a three-putts the 1st; on the 5th b three-putts and c
//     four-putts, so c takes it (more putts); a three-putts the 11th and
//     holds it. Four three-putts in the pot, paid by a to each of the others.
{
  const putts = (bad: [number, number][]) => {
    const p = Array<number>(18).fill(2)
    for (const [h, n] of bad) p[h] = n
    return p
  }
  const r = round('snake', '2026-06-01', [
    { ...rp('a', fours()), putts: putts([[0, 3], [10, 3]]) },
    { ...rp('b', fours()), putts: putts([[4, 3]]) },
    { ...rp('c', fours()), putts: putts([[4, 4]]) },
  ])
  const out = calcSnake(r, ['a', 'b', 'c'], 1)
  check('snake: the last to three-putt pays the pot to each', ['a', 'b', 'c'].map((id) => amount(out.results, id)), [-8, 4, 4])
  check('snake: the read-out', out.detail, ['Holds the snake since the 11th|a', '4 three-putts in the pot.'])
  const tie = calcSnake(round('snake2', '2026-06-01', [{ ...rp('f', fours([0, 5])), putts: putts([[0, 3]]) }, { ...rp('g', fours([0, 6])), putts: putts([[0, 3]]) }]), ['f', 'g'], 1)
  check('snake: level putts, the higher score takes it', tie.detail[0], 'Holds the snake since the 1st|g')
  const none = calcSnake(round('snake3', '2026-06-01', [{ ...rp('f', fours()), putts: putts([]) }, rp('e', fours())]), ['f', 'e'], 1)
  check('snake: nothing yet, and who is not keeping putts', none.detail, ['No three-putts yet.', "Isn't keeping putts|e"])
}

// 17. Sixes, $1, order a b c d. a & b take holes 1-6 2&1 (a wins the 1st
//     and 2nd); b & d take 7-12 1 up (d wins the 7th); 13-18 halved.
{
  const r = round('sixes', '2026-06-01', [rp('a', fours([0, 3], [1, 3])), rp('b', fours()), rp('c', fours()), rp('d', fours([6, 3]))])
  const out = calcSixes(r, ['a', 'b', 'c', 'd'], 1, false, undefined, { order: ['a', 'b', 'c', 'd'] })
  check('sixes: three matches, read out', out.detail, ['Take holes 1 to 6 2&1|a+b', 'Take holes 7 to 12 1 up|b+d', 'Holes 13 to 18 halved.'])
  check('sixes: each winner from one loser', ['a', 'b', 'c', 'd'].map((id) => amount(out.results, id)), [0, 2, -2, 0])
  check('sixes: four only', calcSixes(r, ['a', 'b', 'c'], 1, false).computable, false)
}

// 18. Stableford, $1, par 4s, gross. a: a birdie, a double and pars (35);
//     b: all pars (36). One point apart.
{
  const pars4: Course = { id: 's', groupId: G, name: 'S', slug: 's', pars: Array(18).fill(4) }
  const r = round('stab', '2026-06-01', [rp('a', fours([0, 3], [1, 6])), rp('b', fours())])
  const out = calcStableford(r, ['a', 'b'], 1, false, pars4)
  check('stableford: settled on the point gap', [amount(out.results, 'a'), amount(out.results, 'b')], [-1, 1])
  check('stableford: the read-out', out.detail, ['18 holes counted.', '36 points|b', '35 points|a'])
  check('stableford: the points scale', [stablefordPoints(1, 4), stablefordPoints(2, 4), stablefordPoints(3, 4), stablefordPoints(5, 4), stablefordPoints(7, 4)], [5, 4, 3, 1, 0])
  check('stableford: needs pars', calcStableford(r, ['a', 'b'], 1, false).detail[0], "Stableford needs this course's pars. Add them from the Courses page.")
}

// 19. Bingo Bango Bongo, $1: a 2, b 1, c 2 points, settled pair by pair.
{
  const r = round('bbb', '2026-06-01', [rp('a', fours()), rp('b', fours()), rp('c', fours())])
  const out = calcBbb(r, ['a', 'b', 'c'], 1, { picks: [['a', 'a', 'b'], ['c', null, 'c'], null] })
  check('bbb: pair by pair', ['a', 'b', 'c'].map((id) => amount(out.results, id)), [1, -2, 1])
  check('bbb: the read-out', out.detail, ['2 holes scored.', '2 points|a', '2 points|c', '1 point|b'])
}

// 20. Junk, $1, par 4s, chippies not counted. a: a sandie (claimed twice,
//     counts once) and a birdie off the card; b: a greenie; c's chippie
//     doesn't count.
{
  const pars4: Course = { id: 'j', groupId: G, name: 'J', slug: 'j', pars: Array(18).fill(4) }
  const r = round('junk', '2026-06-01', [rp('a', fours([0, 3])), rp('b', fours()), rp('c', fours())])
  const play = {
    kinds: ['greenie', 'sandie', 'barkie', 'birdie'] as ('greenie' | 'sandie' | 'barkie' | 'birdie')[],
    claims: [
      { hole: 3, playerId: 'a', kind: 'sandie' as const },
      { hole: 3, playerId: 'a', kind: 'sandie' as const },
      { hole: 2, playerId: 'b', kind: 'greenie' as const },
      { hole: 5, playerId: 'c', kind: 'chippie' as const },
    ],
  }
  const out = calcJunk(r, ['a', 'b', 'c'], 1, pars4, play)
  check('junk: each point from each of the others', ['a', 'b', 'c'].map((id) => amount(out.results, id)), [3, 0, -3])
  check('junk: the read-out', out.detail, ['2 points: 1 sandie, 1 birdie|a', '1 point: 1 greenie|b'])
}

// 21. Hammer, $1, one on one, limit 3. 1st: hammered twice, a wins at x4.
//     2nd: b declines a hammer at x2, so a takes it at x2. 3rd: five
//     doublings asked, capped at three, b wins at x8. The rest halved.
{
  const r = round('hammer', '2026-06-01', [rp('a', fours([0, 3])), rp('b', fours([2, 3]))])
  const play = { teams: [['a'], ['b']] as [string[], string[]], limit: 3, holes: [{ doubles: 2, by: 0 as const }, { doubles: 1, by: 0 as const, conceded: 1 as const }, { doubles: 5 }] }
  const out = calcHammer(r, ['a', 'b'], 1, false, undefined, play)
  check('hammer: doubled, declined and capped', [amount(out.results, 'a'), amount(out.results, 'b')], [-2, 2])
  check('hammer: the read-out', out.detail, ['18 holes played.', 'Took the 1st at ×4|a', 'Took the 2nd when the hammer was declined|a', 'Took the 3rd at ×8|b', '15 holes halved.'])
  const four = round('hammer4', '2026-06-01', [rp('a', fours()), rp('b', fours()), rp('c', fours()), rp('d', fours())])
  check('hammer: four need sides', calcHammer(four, ['a', 'b', 'c', 'd'], 1, false).detail, ['Pick the two sides.'])
}

// 13. Spectator mode: the lead by gross, the slice, the turn, and who hears.
{
  const card = (...h: (number | null)[]) => [...h, ...Array(18 - h.length).fill(null)]
  const r = (holes: (number | null)[][], date = '2026-10-24') =>
    round('live', date, holes.map((h, k) => ({ playerId: ['barry', 'pat', 'nader'][k], handicapSnapshot: 10, gross: null, holes: h })))
  // Barry leads after 1, Pat ties on 2 (Barry keeps it), Pat goes ahead on 3.
  const story = leadStory(r([card(4, 5, 5), card(5, 4, 4), card(6, 6, 6)]))
  check('leadStory: a tie keeps the leader, going ahead takes it', [story.leaderId, story.changes], ['pat', [{ hole: 2, leaderId: 'pat', fromId: 'barry' }]])
  // Pat has hole 4 in, Barry doesn't yet: hole 4 doesn't count.
  check('leadStory: only holes everyone has', leadStory(r([card(4, 5, 5), card(5, 4, 4, 2), card(6, 6, 6)])).changes.length, 1)
  check('cardSlice: the last three anyone has', cardSlice(r([card(4, 5, 5, 4), card(5, 4)])), [1, 2, 3])
  check('liveLines: by gross, leader first', liveLines(data({}), r([card(5, 5), card(4, 4), card(6)])).map((l) => [l.playerId, l.thru]), [['pat', 2], ['barry', 2], ['nader', 1]])
  const nine = (v: number) => Array(9).fill(v)
  check('atTheTurn', [atTheTurn(r([card(...nine(4)), card(...nine(5).slice(0, 8))])), atTheTurn(r([card(...nine(4)), card(...nine(5))]))], [false, true])
  // Who hears: members not in the round, not muted, on the day.
  const d = data({ players: ['barry', 'pat', 'nader', 'matt', 'kim'].map((id) => ({ id, name: id, initials: id.slice(0, 2), handicap: 10, color: '#000', mutedRounds: id === 'kim' ? ['live'] : undefined })), group: { id: G, name: 'g', inviteCode: 'x', adminId: 'matt', memberIds: ['barry', 'pat', 'nader', 'matt', 'kim'] } })
  const before = r([card(4, 5), card(5, 4), card(6, 6)])
  const after = r([card(4, 5, 5), card(5, 4, 4), card(6, 6, 6)])
  const news = spectatorNews(d, before, after, '2026-10-24')
  check('spectatorNews: a lead change, to Matt only', news.map((n) => [n.title, n.toPlayerIds]), [['Lead change at Test Links', ['matt']]])
  check('spectatorNews: not on another day', spectatorNews(d, before, { ...after, date: '2026-10-20' }, '2026-10-24').length, 0)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
