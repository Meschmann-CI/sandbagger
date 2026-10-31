// Randomised money review for every Bandit game (audit 2026-10-24). npm test runs
// 150 rounds a game; by hand: node tests/random-bets.test.mts [rounds-per-game] [seed-offset]
import { register } from 'node:module'

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

const LIB = new URL('../src/lib/', import.meta.url).pathname
const bets: any = await import(LIB + 'bets.ts')
const courses: any = await import(LIB + 'courses.ts')
const holesLib: any = await import(LIB + 'holes.ts')
const settlements: any = await import(LIB + 'settlements.ts')

const N = Number(process.argv[2] ?? 3000)
const OFFSET = Number(process.argv[3] ?? 0)

// mulberry32
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GAMES = ['skins', 'skinsWTA', 'nassau', 'nassauMatch', 'match', 'wolf', 'vegas', 'rabbit', 'snake', 'sixes', 'stableford', 'bbb', 'junk', 'hammer', 'custom'] as const
type Game = (typeof GAMES)[number]

const failures: Record<string, { seed: number; why: string; input: any }[]> = {}
const fail = (game: string, seed: number, why: string, input: any) => {
  ;(failures[game] ??= []).push({ seed, why, input })
}
const ran: Record<string, number> = {}

function shuffle<T>(r: () => number, xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const STAKES = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 2.5, 5, 7.5, 10, 20, 0.01, 3.33]

function makeCourse(r: () => number, data: any) {
  const kind = r()
  const nineIndex = () => shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9])
  const pars9 = () => Array.from({ length: 9 }, () => pick(r, [3, 4, 4, 4, 5]))
  const yards9 = (base: number) => Array.from({ length: 9 }, () => base + Math.floor(r() * 150))
  const common = { id: 'c', groupId: 'g', name: 'Rand Links', slug: 'rand links' }
  let course: any
  if (kind < 0.25) {
    // 27 holes: three nines, two played, round names them (or not).
    const names = ['Meadows', 'Lakes', 'Woods']
    course = {
      ...common,
      pars: Array(18).fill(4),
      strokeIndex: shuffle(r, Array.from({ length: 18 }, (_, i) => i + 1)),
      rating: r() < 0.7 ? 70 + r() * 5 : undefined,
      slope: r() < 0.7 ? 110 + Math.floor(r() * 35) : undefined,
      tees: r() < 0.5 ? [{ name: 'White', rating: 69 + r() * 4, slope: 115 + Math.floor(r() * 25) }] : undefined,
      nines: names.map((name) => ({
        name,
        pars: pars9(),
        strokeIndex: r() < 0.9 ? nineIndex() : undefined,
        tees: [{ name: 'White', holeYards: r() < 0.85 ? yards9(300) : undefined }, { name: 'Blue', holeYards: yards9(330) }],
      })),
    }
    if (course.rating === undefined) course.slope = undefined
    if (course.slope === undefined) course.rating = undefined
  } else if (kind < 0.35) {
    course = undefined
  } else if (kind < 0.5) {
    // pars only, no index
    course = { ...common, pars: [...pars9(), ...pars9()] }
  } else if (kind < 0.6) {
    // partial pars / partial index
    const pars = [...pars9(), ...pars9()] as (number | null)[]
    const si = shuffle(r, Array.from({ length: 18 }, (_, i) => i + 1)) as (number | null)[]
    pars[Math.floor(r() * 18)] = null
    si[Math.floor(r() * 18)] = null
    course = { ...common, pars, strokeIndex: si }
  } else {
    course = {
      ...common,
      pars: [...pars9(), ...pars9()],
      strokeIndex: shuffle(r, Array.from({ length: 18 }, (_, i) => i + 1)),
      rating: r() < 0.7 ? 68 + r() * 7 : undefined,
      slope: undefined as number | undefined,
      tees: r() < 0.5 ? [{ name: 'White Tees', rating: 69 + r() * 4, slope: 115 + Math.floor(r() * 25) }, { name: 'Red', rating: 66, slope: 110, gender: 'F' }] : undefined,
    }
    if (course.rating !== undefined) course.slope = 100 + Math.floor(r() * 45)
  }
  if (course) data.courses = [course]
  return course
}

function makeCard(r: () => number, pars: (number | null)[], hcp: number): (number | null)[] {
  const shape = r()
  const full = Array.from({ length: 18 }, (_, i) => {
    const par = pars[i] ?? 4
    const extra = Math.max(0, Math.round((hcp / 18) * (0.5 + r())))
    const roll = r()
    const base = par + extra + (roll < 0.08 ? -1 : roll < 0.1 ? -2 : roll < 0.7 ? 0 : roll < 0.9 ? 1 : roll < 0.97 ? 2 : 4)
    return Math.max(1, base)
  }) as (number | null)[]
  if (shape < 0.45) return full
  if (shape < 0.7) {
    const n = Math.floor(r() * 19)
    return full.map((h, i) => (i < n ? h : null))
  }
  if (shape < 0.85) {
    // holes missing in the middle
    const out = [...full]
    const k = 1 + Math.floor(r() * 4)
    for (let i = 0; i < k; i++) out[Math.floor(r() * 18)] = null
    return out
  }
  if (shape < 0.92) return Array(18).fill(null)
  return full.map(() => (r() < 0.5 ? null : 4))
}

function makePutts(r: () => number, card: (number | null)[]): (number | null)[] | undefined {
  const k = r()
  if (k < 0.3) return undefined
  if (k < 0.4) return []
  return card.map((h) => (h == null || r() < 0.1 ? null : pick(r, [1, 2, 2, 2, 3, 3, 4, 5])))
}

const cents = (n: number) => Math.round(n * 100)

function checkOutcome(game: string, seed: number, out: any, removedIds: string[], ids: string[], input: any) {
  if (!out || !Array.isArray(out.results)) return fail(game, seed, 'no results', input)
  let sum = 0
  for (const res of out.results) {
    const a = res.amount
    if (typeof a !== 'number' || !Number.isFinite(a)) return fail(game, seed, `non-finite amount ${a} for ${res.playerId}`, input)
    if (Object.is(a, -0)) fail(game, seed, `negative zero for ${res.playerId}`, input)
    if (Math.abs(Math.round(a * 100) / 100 - a) > 1e-9) fail(game, seed, `fractional cents ${a} for ${res.playerId}`, input)
    sum += cents(a)
    if (removedIds.includes(res.playerId) && a !== 0) fail(game, seed, `removed golfer ${res.playerId} charged ${a}`, input)
    if (!ids.includes(res.playerId)) fail(game, seed, `stray id ${res.playerId}`, input)
  }
  if (sum !== 0) fail(game, seed, `does not net to zero: ${sum} cents`, input)
  for (const line of out.detail ?? []) if (typeof line !== 'string' || /undefined|NaN|null/.test(line)) fail(game, seed, `bad detail line ${line}`, input)
  const seen = new Set<string>()
  for (const res of out.results) {
    if (seen.has(res.playerId)) fail(game, seed, `duplicate result for ${res.playerId}`, input)
    seen.add(res.playerId)
  }
}

for (const game of GAMES) {
  ran[game] = 0
  for (let n = 0; n < N; n++) {
    const seed = OFFSET + n * 31 + GAMES.indexOf(game) * 1_000_003
    const r = rng(seed)
    const data: any = { courses: [], rounds: [], bets: [], payments: [], players: [] }
    const stored = makeCourse(r, data)
    const needs = game === 'wolf' || game === 'vegas' || game === 'sixes' ? 4 : game === 'match' || game === 'nassauMatch' ? 2 : game === 'hammer' ? pick(r, [2, 4]) : 2 + Math.floor(r() * 4)
    const extra = r() < 0.3 ? 1 : 0 // a golfer on the round but not in the bet
    const count = needs + extra
    const allIds = ['matt', 'nader', 'barry', 'pat', 'kim', 'lee'].slice(0, count)
    const betIds = shuffle(r, allIds).slice(0, needs)
    const tee = pick(r, [undefined, 'white', 'White Tees', 'blue', 'Whites'])
    const nines = stored?.nines ? (r() < 0.7 ? [pick(r, ['Meadows', 'Lakes', 'Woods']), pick(r, ['Meadows', 'Lakes', 'Woods'])] : undefined) : undefined
    const roundBase = { id: 'r1', groupId: 'g', date: '2026-06-01', courseName: 'Rand Links', tee, nines }
    const course = courses.courseForRound(data, roundBase)
    const pars = courses.padded(course?.pars)
    const players = allIds.map((id) => {
      const hcp = Math.round((r() < 0.08 ? -3 + r() * 3 : r() * 42) * 10) / 10
      const card = makeCard(r, pars, Math.max(0, hcp))
      const putts = makePutts(r, card)
      return {
        playerId: id,
        handicapSnapshot: hcp,
        holes: card.some((h) => h != null) ? card : undefined,
        gross: card.every((h) => h != null) ? card.reduce((s: number, h) => s + (h as number), 0) : null,
        ...(putts ? { putts } : {}),
      }
    })
    // Randomly remove a golfer who is in the bet from the round.
    const removed: string[] = []
    if (r() < 0.25) {
      const gone = pick(r, betIds)
      removed.push(gone)
    }
    const round = { ...roundBase, players: players.filter((p) => !removed.includes(p.playerId)) }
    const stake = pick(r, STAKES)
    const useNet = r() < 0.6
    const order = shuffle(r, betIds)
    let out: any
    let bet: any = { id: 'b', roundId: 'r1', type: game, name: game, stake, net: useNet, results: betIds.map((id) => ({ playerId: id, amount: 0 })) }
    const input = { seed, game, stake, useNet, tee, nines, course: stored ? { pars: stored.pars, strokeIndex: stored.strokeIndex, rating: stored.rating, slope: stored.slope, tees: stored.tees, nines: stored.nines } : undefined, players, betIds, removed }
    try {
      switch (game) {
        case 'skins':
          out = bets.calcSkins(round, betIds, stake, useNet, course, false)
          bet.type = 'skins'
          break
        case 'skinsWTA':
          out = bets.calcSkins(round, betIds, stake, useNet, course, true)
          bet = { ...bet, type: 'skins', winnerTakeAll: true }
          break
        case 'nassau':
          out = bets.calcNassau(round, betIds, stake, useNet, course)
          break
        case 'nassauMatch': {
          const presses = Array.from({ length: Math.floor(r() * 4) }, () => ({ hole: Math.floor(r() * 20) - 1 }))
          const play = { format: 'match', autoPress: pick(r, [0, 1, 2, 3, undefined]), presses }
          input.play = play
          out = bets.calcNassauMatch(round, betIds, stake, useNet, course, play)
          bet = { ...bet, type: 'nassau', nassau: play }
          break
        }
        case 'match':
          out = bets.calcMatchPlay(round, betIds, stake, useNet, course)
          break
        case 'wolf': {
          const picks = Array.from({ length: 18 }, (_, h) => {
            const k = r()
            if (k < 0.15) return null
            if (k < 0.3) return 'lone'
            if (k < 0.4) return 'blind'
            if (k < 0.45) return 'nobody'
            const wolf = order[h % 4]
            return k < 0.5 ? wolf : pick(r, order.filter((id) => id !== wolf))
          })
          const play = { order: r() < 0.85 ? order : order.slice(0, 3), picks }
          input.play = play
          out = bets.calcWolf(round, betIds, stake, useNet, course, play)
          bet = { ...bet, wolf: play }
          break
        }
        case 'vegas': {
          const play = r() < 0.9 ? { teams: [[order[0], order[1]], [order[2], order[3]]], birdieFlip: r() < 0.6 } : { teams: [[order[0], order[1]], [order[1], order[3]]] }
          input.play = play
          out = bets.calcVegas(round, betIds, stake, useNet, course, play)
          bet = { ...bet, vegas: play }
          break
        }
        case 'rabbit':
          out = bets.calcRabbit(round, betIds, stake, useNet, course)
          break
        case 'snake':
          out = bets.calcSnake(round, betIds, stake)
          bet = { ...bet, net: false }
          break
        case 'sixes': {
          const play = { order }
          input.play = play
          out = bets.calcSixes(round, betIds, stake, useNet, course, play)
          bet = { ...bet, sixes: play }
          break
        }
        case 'stableford':
          out = bets.calcStableford(round, betIds, stake, useNet, course)
          break
        case 'bbb': {
          const picks = Array.from({ length: 18 }, () => (r() < 0.3 ? null : [0, 1, 2].map(() => (r() < 0.2 ? null : r() < 0.1 ? 'ghost' : pick(r, allIds)))))
          const play = { picks }
          input.play = play
          out = bets.calcBbb(round, betIds, stake, play)
          bet = { ...bet, net: false, bbb: play }
          break
        }
        case 'junk': {
          const kinds = shuffle(r, ['greenie', 'sandie', 'barkie', 'chippie', 'birdie']).slice(0, 1 + Math.floor(r() * 5))
          const claims = Array.from({ length: Math.floor(r() * 10) }, () => ({ hole: Math.floor(r() * 20) - 1, playerId: pick(r, [...allIds, 'ghost']), kind: pick(r, ['greenie', 'sandie', 'barkie', 'chippie', 'birdie']) }))
          const play = { kinds, claims }
          input.play = play
          out = bets.calcJunk(round, betIds, stake, course, play)
          bet = { ...bet, net: false, junk: play }
          break
        }
        case 'hammer': {
          const teams = needs === 2 ? [[order[0]], [order[1]]] : [[order[0], order[1]], [order[2], order[3]]]
          const limit = pick(r, [1, 2, 3, 4])
          const holes = Array.from({ length: 18 }, () => {
            const k = r()
            if (k < 0.4) return null
            const doubles = Math.floor(r() * 5)
            const by = pick(r, [0, 1, undefined])
            if (k < 0.55) return { doubles, by }
            if (k < 0.7) return { doubles, by, pending: by === 0 ? 1 : 0 }
            if (k < 0.85) return { doubles, by, conceded: pick(r, [0, 1]) }
            return { doubles }
          })
          const play = r() < 0.9 ? { teams, limit, holes } : undefined
          input.play = play
          out = bets.calcHammer(round, betIds, stake, useNet, course, play)
          bet = { ...bet, hammer: play }
          break
        }
        case 'custom':
          out = bets.calcCustom(betIds, r() < 0.9 ? pick(r, betIds) : null, stake)
          bet = { ...bet, net: undefined }
          break
      }
    } catch (err) {
      fail(game, seed, `threw: ${(err as Error).message}`, input)
      continue
    }
    ran[game]++
    checkOutcome(game, seed, out, game === "custom" ? [] : removed, betIds, input)
    // settleFromCard must agree with the direct call for card games.
    if (game !== 'custom') {
      const viaBet = bets.settleFromCard(bet, round, course)
      if (!viaBet) fail(game, seed, 'settleFromCard returned null for a card game', input)
      else if (JSON.stringify(viaBet.results) !== JSON.stringify(out.results)) fail(game, seed, 'settleFromCard disagrees with the direct call', { input, direct: out.results, via: viaBet.results })
    }
    // Stored results feed roundBetSettlements: that must net too, and stay finite.
    const d = { ...data, rounds: [round], bets: [{ ...bet, results: out.results }], payments: [] }
    const s = settlements.roundBetSettlements(d, round)
    for (const x of s) if (!Number.isFinite(x.amount) || x.amount <= 0) fail(game, seed, `settlement line ${JSON.stringify(x)}`, input)
  }
}

// ---- Targeted checks ----
const targeted: string[] = []
{
  // A. Three-decimal stake (the input allows "0.125").
  const r4 = { id: 'r', groupId: 'g', date: '2026-06-01', courseName: 'x', players: ['a', 'b', 'c', 'd'].map((id, i) => ({ playerId: id, handicapSnapshot: 10, gross: 72, holes: Array.from({ length: 18 }, (_, h) => (h === 0 && i === 0 ? 3 : 4)) })) }
  const out = bets.calcSkins(r4, ['a', 'b', 'c', 'd'], 0.125, false)
  const sum = out.results.reduce((s: number, x: any) => s + cents(x.amount), 0)
  targeted.push(`A. skins at a $0.125 stake nets to ${sum} cents (${JSON.stringify(out.results.map((x: any) => x.amount))})`)
  const j = bets.calcJunk(r4, ['a', 'b', 'c', 'd'], 0.125, undefined, { kinds: ['sandie'], claims: [{ hole: 0, playerId: 'a', kind: 'sandie' }] })
  targeted.push(`A. junk at a $0.125 stake nets to ${j.results.reduce((s: number, x: any) => s + cents(x.amount), 0)} cents`)
  // B. Zero stake and points games: negative zero?
  const z = bets.calcStableford(r4, ['a', 'b'], 0, false, { id: 'c', groupId: 'g', name: 'c', slug: 'c', pars: Array(18).fill(4) })
  targeted.push(`B. stableford at $0: amounts ${z.results.map((x: any) => (Object.is(x.amount, -0) ? '-0' : x.amount)).join(',')}`)
  // C. Nassau stroke play, net, no index, plus handicap: rounding of -0.5
  const plus = { ...r4, players: [{ ...r4.players[0], handicapSnapshot: -1 }, { ...r4.players[1], handicapSnapshot: 0 }] }
  const nz = bets.calcNassau(plus, ['a', 'b'], 5, true, { id: 'c', groupId: 'g', name: 'c', slug: 'c', pars: Array(18).fill(4) })
  targeted.push(`C. nassau net no index, +1 vs 0: ${JSON.stringify(nz.detail)} ${JSON.stringify(nz.results)}`)
  // D. Match-play Nassau presses: B wins 1 and 2 (A 2 down, auto press from 3). A wins 3..9. Front: A 5 up. Press from 3: A 7 up. Then back all halved.
  const cardA = Array.from({ length: 18 }, (_, h) => (h >= 2 && h <= 8 ? 3 : 4))
  const cardB = Array.from({ length: 18 }, (_, h) => (h <= 1 ? 3 : 4))
  const pr = { ...r4, players: [{ playerId: 'a', handicapSnapshot: 0, gross: 0, holes: cardA }, { playerId: 'b', handicapSnapshot: 0, gross: 0, holes: cardB }] }
  const po = bets.calcNassauMatch(pr, ['a', 'b'], 10, false, undefined, { format: 'match', autoPress: 2 })
  targeted.push(`D. presses: ${JSON.stringify(po.detail)} -> ${JSON.stringify(po.results)}`)
  // D2. A press from the 9th? Going 2 down after the 8th: press would start on the 9th (one hole).
  const cA = Array.from({ length: 18 }, (_, h) => (h === 6 || h === 7 ? 4 : 4))
  const cB = Array.from({ length: 18 }, (_, h) => (h === 6 || h === 7 ? 3 : 4))
  const p2 = bets.calcNassauMatch({ ...pr, players: [{ ...pr.players[0], holes: cA }, { ...pr.players[1], holes: cB }] }, ['a', 'b'], 10, false, undefined, { format: 'match', autoPress: 2 })
  targeted.push(`D2. 2 down after the 8th: ${JSON.stringify(p2.detail)}`)
  // D3. 2 down after the 9th: no press on the back from the front.
  const cB3 = Array.from({ length: 18 }, (_, h) => (h === 7 || h === 8 ? 3 : 4))
  const p3 = bets.calcNassauMatch({ ...pr, players: [{ ...pr.players[0], holes: cA }, { ...pr.players[1], holes: cB3 }] }, ['a', 'b'], 10, false, undefined, { format: 'match', autoPress: 2 })
  targeted.push(`D3. 2 down after the 9th: ${JSON.stringify(p3.detail)}`)
  // D4. manual press on hole 0 (duplicate of the front) and a duplicate manual press
  const p4 = bets.calcNassauMatch(pr, ['a', 'b'], 10, false, undefined, { format: 'match', presses: [{ hole: 0 }, { hole: 4 }, { hole: 4 }] })
  targeted.push(`D4. manual press on the 1st and twice on the 5th: ${JSON.stringify(p4.detail)} -> ${JSON.stringify(p4.results)}`)
  // E. Vegas: net scores with a stroke making 0 or a 10 flipped.
  const ten = { ...r4, players: r4.players.map((p, i) => ({ ...p, holes: p.holes.map((h, k) => (k === 0 ? (i === 2 ? 10 : i === 0 ? 3 : 4) : h)) })) }
  const vo = bets.calcVegas(ten, ['a', 'b', 'c', 'd'], 1, false, { id: 'c', groupId: 'g', name: 'c', slug: 'c', pars: Array(18).fill(4) }, { teams: [['a', 'b'], ['c', 'd']], birdieFlip: true })
  targeted.push(`E. vegas a birdie v a 10: ${JSON.stringify(vo.detail)} ${JSON.stringify(vo.results)} (expect first hole 34 v 104 = 70 points)`)
  targeted.push(`E. vegasNumber([0,4]) = ${bets.vegasNumber([0, 4], false)}, flipped ${bets.vegasNumber([0, 4], true)}; [10,10] = ${bets.vegasNumber([10, 10], false)}`)
  // F. Wolf rotation: holes 17 and 18 go to order[0] and order[1]
  targeted.push(`F. wolfOn 17th/18th: ${bets.wolfOn(['a', 'b', 'c', 'd'], 16)}, ${bets.wolfOn(['a', 'b', 'c', 'd'], 17)}`)
  // G. Stableford full handicap allocation sum on a 27-hole joined index
  const d27: any = { courses: [{ id: 'c', groupId: 'g', name: 'T', slug: 't', pars: Array(18).fill(4), rating: 72, slope: 130, nines: ['A', 'B', 'C'].map((name, i) => ({ name, pars: Array(9).fill(4), strokeIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9], tees: [{ name: 'White', holeYards: Array(9).fill(300 + i * 10) }] })) }] }
  const j27 = courses.courseForRound(d27, { courseName: 'T', nines: ['C', 'A'], tee: 'white' })
  const alloc = courses.strokesByHole(j27, courses.playingHandicap(j27, 36.8, 'white'))
  targeted.push(`G. 27-hole joined index ${JSON.stringify(j27.strokeIndex)}; 36.8 at 130 slope gives ${alloc.reduce((a: number, b: number) => a + b, 0)} strokes (course hcp ${courses.playingHandicap(j27, 36.8, 'white')})`)
  // H. Hammer pending hole judged at the hammered value
  const hr = { ...r4, players: [{ playerId: 'a', handicapSnapshot: 0, gross: 0, holes: Array(18).fill(4).map((h, i) => (i === 0 ? 3 : h)) }, { playerId: 'b', handicapSnapshot: 0, gross: 0, holes: Array(18).fill(4) }] }
  const ho = bets.calcHammer(hr, ['a', 'b'], 1, false, undefined, { teams: [['a'], ['b']], limit: 3, holes: [{ doubles: 1, by: 1, pending: 0 }] })
  targeted.push(`H. hammer thrown by b, unanswered, a wins the hole: ${JSON.stringify(ho.detail)} ${JSON.stringify(ho.results)}`)
  // I. Rabbit: holder wins again keeps it; another winner sets it loose; same golfer catches it back.
  // J. Removed golfer and a 4-player game: what results are stored.
  const wr = { ...r4, players: r4.players.slice(0, 3) }
  const wo = bets.calcWolf(wr, ['a', 'b', 'c', 'd'], 1, false, undefined, { order: ['a', 'b', 'c', 'd'], picks: ['b'] })
  targeted.push(`J. wolf with d removed: ${JSON.stringify(wo.detail)} results for ${wo.results.map((x: any) => x.playerId).join(',')}`)
  const so = bets.calcSkins(wr, ['a', 'b', 'c', 'd'], 1, false)
  targeted.push(`J. skins with d removed: results only for ${so.results.map((x: any) => x.playerId).join(',')} (d dropped from the bet once saved)`)
  // K. Green fee with payer not on the round / amount with 3 decimals
  const fee = settlements.roundBetSettlements({ rounds: [], bets: [], payments: [] }, { ...r4, greenFee: { payerId: 'zz', amount: 33.333 } })
  targeted.push(`K. green fee 33.333 by someone off the round: ${JSON.stringify(fee)}`)
}

console.log('rounds per game:', ran)
for (const [game, list] of Object.entries(failures)) {
  console.log(`\n### ${game}: ${list.length} failures`)
  const byWhy = new Map<string, any[]>()
  for (const f of list) byWhy.set(f.why.replace(/[\d.-]+/g, '#'), [...(byWhy.get(f.why.replace(/[\d.-]+/g, '#')) ?? []), f])
  for (const [why, fs] of byWhy) {
    console.log(`  ${why} x${fs.length}; first seed ${fs[0].seed}: ${fs[0].why}`)
    console.log('   input:', JSON.stringify(fs[0].input).slice(0, 1500))
  }
}
console.log('\n--- targeted ---')
for (const t of targeted) console.log(t)
console.log(Object.keys(failures).length ? '\nFAILURES' : '\nAll random checks passed.')
