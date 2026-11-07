// What a change to a round tells the group, once (src/lib/roundMoments.ts):
// the Final, a golfer's trophies, the turn and a lead change, each keyed so
// two phones crossing the same line send it once between them, and a score
// cleared and typed again fires nothing twice (audit 2026-10-24, 11 to 13).
// Same cases as BanditCore/Tests/RoundMomentsTests.swift.
import { register } from 'node:module'
import type { AppData, Round, RoundPlayer } from '../src/types.ts'

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

const { roundMoments, trophiesKey, FINAL_KEY } = await import('../src/lib/roundMoments.ts')
const { spectatorNews } = await import('../src/lib/spectate.ts')
const { wasAnnounced, markAnnounced, forgetAnnounced } = await import('../src/lib/announced.ts')

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const pass = a === e
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${pass ? '' : `\n        expected ${e}\n        actual   ${a}`}`)
}

const G = 'g1'
const TODAY = '2026-10-24'
const ids = ['matt', 'barry', 'pat', 'nader']
const data = (extra: Partial<AppData> = {}): AppData => ({
  players: ids.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), initials: id.slice(0, 2).toUpperCase(), handicap: 12, color: '#000' })),
  group: { id: G, name: 'Test', inviteCode: 'x', adminId: 'matt', memberIds: ids },
  courses: [],
  courseRatings: [],
  courseRankings: [],
  rounds: [],
  trips: [],
  bets: [],
  expenses: [],
  payments: [],
  currentUserId: 'matt',
  ...extra,
})
const card = (n: number, score = 5): (number | null)[] => [...Array<number>(n).fill(score), ...Array<null>(18 - n).fill(null)]
const rp = (playerId: string, holes: (number | null)[]): RoundPlayer => ({
  playerId,
  handicapSnapshot: 12,
  holes,
  gross: holes.every((h) => h != null) ? holes.reduce<number>((s, h) => s + (h ?? 0), 0) : null,
})
const round = (players: RoundPlayer[], extra: Partial<Round> = {}): Round => ({ id: 'live', groupId: G, date: TODAY, courseName: 'Split Rock Golf Course', players, ...extra })
const never = () => false
const keysOf = (ms: { keys: string[] }[]) => ms.flatMap((m) => m.keys).sort()

// 1. Two phones cross the line between them: Matt types Pat's 18th, Barry
//    his own, and only the reload shows the round final.
{
  const d = data()
  const was = round([rp('matt', card(18)), rp('barry', card(17)), rp('pat', card(17))])
  const mattSaved = round([rp('matt', card(18)), rp('barry', card(17)), rp('pat', card(18))])
  const both = round([rp('matt', card(18)), rp('barry', card(18)), rp('pat', card(18))])
  const own = roundMoments({ ...d, rounds: [mattSaved] }, was, mattSaved, TODAY, never)
  check("Matt's save: Pat's own trophies, no final", keysOf(own), [trophiesKey('pat', 'mine')])
  const loaded = roundMoments({ ...d, rounds: [both] }, mattSaved, both, TODAY, never)
  check('the reload: the final, and everyone\'s decided-by-others trophies', keysOf(loaded), [FINAL_KEY, trophiesKey('barry', 'everyone'), trophiesKey('barry', 'mine'), trophiesKey('matt', 'everyone'), trophiesKey('pat', 'everyone')])
  const final = loaded.find((m) => m.keys[0] === FINAL_KEY)!
  check('the final push: to the others, with the winner', [final.push?.toPlayerIds, final.push?.title], [['barry', 'pat', 'nader'], 'Final at Split Rock Golf Course'])
  check("Barry's trophies carry both keys and one push", loaded.find((m) => m.trophies?.playerId === 'barry')?.keys, [trophiesKey('barry', 'mine'), trophiesKey('barry', 'everyone')])
}

// 2. Already announced here: nothing fires twice, whatever the diff says.
{
  const d = data()
  const was = round([rp('matt', card(18)), rp('barry', card(17))])
  const now = round([rp('matt', card(18)), rp('barry', card(18))])
  const all = roundMoments({ ...d, rounds: [now] }, was, now, TODAY, never)
  const done = new Set(all.flatMap((m) => m.keys))
  check('every key announced: no moments', roundMoments({ ...d, rounds: [now] }, was, now, TODAY, (k) => done.has(k)).length, 0)
  // Barry's 18th cleared and typed again: his own trophies were announced
  // at the first close-out; only what nobody has sent is left.
  const cleared = round([rp('matt', card(18)), rp('barry', card(17))])
  const again = roundMoments({ ...d, rounds: [now] }, cleared, now, TODAY, (k) => k === trophiesKey('barry', 'mine') || k === FINAL_KEY)
  check("cleared and re-entered: Barry's own trophies and the final stay quiet", keysOf(again), [trophiesKey('barry', 'everyone'), trophiesKey('matt', 'everyone')])
}

// 3. A round logged whole after the fact: trophies, no Final (as before).
{
  const d = data()
  const logged = round([rp('matt', card(18)), rp('barry', card(18))])
  const ms = roundMoments({ ...d, rounds: [logged] }, undefined, logged, TODAY, never)
  check('logged whole: no final push', ms.some((m) => m.keys.includes(FINAL_KEY)), false)
  check('logged whole: both golfers close out with both scopes', keysOf(ms), [trophiesKey('barry', 'everyone'), trophiesKey('barry', 'mine'), trophiesKey('matt', 'everyone'), trophiesKey('matt', 'mine')])
  check('the sheet is for the golfer, the push for the others', ms.map((m) => [m.trophies?.playerId, m.push?.toPlayerIds]), [['matt', ['barry', 'pat', 'nader']], ['barry', ['barry', 'pat', 'nader']]])
}

// 4. The turn and a lead change carry keys; a guest never gets a trophy push.
{
  const d = data()
  const before = round([rp('barry', card(8, 4)), rp('pat', card(8, 5))])
  const turn = round([rp('barry', card(9, 4)), rp('pat', card(9, 5))])
  check('spectatorNews: the turn is keyed', spectatorNews(d, before, turn, TODAY).map((n) => n.key), ['turn'])
  const lead = round([rp('barry', [4, 5, 5, ...Array<null>(15).fill(null)]), rp('pat', [5, 4, 4, ...Array<null>(15).fill(null)])])
  const was = round([rp('barry', [4, 5, null, ...Array<null>(15).fill(null)]), rp('pat', [5, 4, null, ...Array<null>(15).fill(null)])])
  check('spectatorNews: a lead change is keyed by hole', spectatorNews(d, was, lead, TODAY).map((n) => n.key), ['lead:2'])
  check('roundMoments: an announced lead change stays quiet', roundMoments(d, was, lead, TODAY, (k) => k === 'lead:2').length, 0)
  const withGuest = data({ players: [...data().players, { id: 'guest', name: 'Guest', initials: 'G', handicap: 20, color: '#000', guest: true }] })
  const g = round([rp('matt', card(18)), rp('guest', card(18))])
  check('a guest earns no push', roundMoments({ ...withGuest, rounds: [g] }, undefined, g, TODAY, never).some((m) => m.trophies?.playerId === 'guest'), false)
}

// 5. The per-phone list.
{
  forgetAnnounced()
  check('announced: empty to start', wasAnnounced('r1', FINAL_KEY), false)
  markAnnounced('r1', FINAL_KEY)
  markAnnounced('r1', FINAL_KEY)
  check('announced: marked once, read back', wasAnnounced('r1', FINAL_KEY), true)
  check('announced: another round is its own', wasAnnounced('r2', FINAL_KEY), false)
  for (let i = 0; i < 70; i++) markAnnounced(`old-${i}`, 'turn')
  check('announced: the oldest rounds drop off', [wasAnnounced('r1', FINAL_KEY), wasAnnounced('old-69', 'turn')], [false, true])
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
