// Exercises the offline write queue without a browser.
//
//   npm test
//
// Worth having: this is the code that decides whether a score typed on
// the 14th green survives the walk back to the clubhouse, and every
// failure mode it handles is invisible until the day it matters. The
// checks run in sequence and share one queue on purpose — that is how
// the real thing is used.

// --- minimal browser stubs, installed before the module is imported ---
const store = new Map<string, string>()
const listeners: Record<string, (() => void)[]> = {}

;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
// Node defines navigator as a getter-only property, so replace the
// descriptor rather than assigning.
const net = { onLine: true }
Object.defineProperty(globalThis, 'navigator', { value: net, configurable: true, writable: true })
;(globalThis as any).window = {
  addEventListener: (ev: string, fn: () => void) => {
    ;(listeners[ev] ??= []).push(fn)
  },
}
;(globalThis as any).document = {
  addEventListener: (ev: string, fn: () => void) => {
    ;(listeners[ev] ??= []).push(fn)
  },
  visibilityState: 'visible',
}

const { withOutbox, outboxStatus, whenSettled, RetryLater } = await import('../src/data/outbox.ts')

// --- a backend we can break on demand ---
let mode: 'ok' | 'offline' | 'refuse' = 'ok'
const sent: string[] = []
const inner = {
  cloud: true,
  load: async () => ({}) as any,
  apply: async (change: any) => {
    if (mode === 'offline') throw new TypeError('Failed to fetch')
    if (mode === 'refuse') throw new Error('new row violates row-level security policy')
    sent.push(change.kind + ':' + (change.id ?? change.tripId ?? ''))
  },
}

const backend = withOutbox(inner as any)
const change = (kind: string, id: string) => ({ kind, id }) as any
const snap = {} as any

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const pass = a === e
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${pass ? '' : `\n        expected ${e}\n        actual   ${a}`}`)
}

// 1. Online writes go straight out and queue nothing.
await backend.apply(change('round.upsert', 'r1'), snap)
check('online write is sent immediately', sent, ['round.upsert:r1'])
check('nothing queued while online', outboxStatus().pending, 0)

// 2. A dropped connection queues instead of throwing.
mode = 'offline'
net.onLine = false
await backend.apply(change('round.upsert', 'r2'), snap)
await backend.apply(change('bet.upsert', 'b1'), snap)
check('offline writes are queued, not lost', outboxStatus().pending, 2)
check('nothing new reached the server', sent, ['round.upsert:r1'])

// 3. Reconnecting drains the queue in the order it went in.
mode = 'ok'
net.onLine = true
for (const fn of listeners['online'] ?? []) fn()
await new Promise((r) => setTimeout(r, 20))
check('queue drains on reconnect', outboxStatus().pending, 0)
check('replayed in order', sent, ['round.upsert:r1', 'round.upsert:r2', 'bet.upsert:b1'])

// 4. A genuine server rejection must surface, not retry forever.
mode = 'refuse'
let threw: string | null = null
try {
  await backend.apply(change('round.delete', 'r9'), snap)
} catch (err) {
  threw = (err as Error).message
}
check('server rejection propagates', threw, 'new row violates row-level security policy')
check('rejection is not queued', outboxStatus().pending, 0)

// 5. A queued change the server later refuses gets dropped, not stuck at
//    the front blocking everything behind it.
mode = 'offline'
net.onLine = false
await backend.apply(change('trip.upsert', 'bad'), snap)
await backend.apply(change('trip.upsert', 'good'), snap)
check('two queued', outboxStatus().pending, 2)

let call = 0
inner.apply = async (change: any) => {
  call++
  if (call === 1) throw new Error('permission denied')
  sent.push(change.kind + ':' + change.id)
}
net.onLine = true
for (const fn of listeners['online'] ?? []) fn()
await new Promise((r) => setTimeout(r, 20))
check('poisoned change does not block the queue', outboxStatus().pending, 0)
check('the good one still got through', sent.at(-1), 'trip.upsert:good')
check('and the failure is reported', outboxStatus().error, null)

// 6. A stale token is not a refusal. After a long sleep the phone is
//    online, the refresh hasn't happened yet, and the server answers 401 /
//    "JWT expired" or, with the anon key, an RLS error. The write itself is
//    fine; it has to wait for the session, not be dropped as poison.
let stale = true
inner.apply = async (change: any) => {
  if (stale) throw new Error('Saving round: JWT expired')
  sent.push(change.kind + ':' + change.id)
}
let threw401: string | null = null
try {
  await backend.apply(change('round.upsert', 'r401'), snap)
} catch (err) {
  threw401 = (err as Error).message
}
check('a 401 is not surfaced as a refusal', threw401, null)
check('a 401 is queued, not dropped', outboxStatus().pending, 1)

for (const fn of listeners['online'] ?? []) fn()
await new Promise((r) => setTimeout(r, 20))
check('still queued while the token is stale', outboxStatus().pending, 1)
check('and not reported as an error', outboxStatus().error, null)

stale = false
for (const fn of listeners['online'] ?? []) fn()
await new Promise((r) => setTimeout(r, 20))
check('sent once the session is back', sent.at(-1), 'round.upsert:r401')
check('queue empty after the retry', outboxStatus().pending, 0)

// 6b. The backend can say so explicitly (no session at all) with RetryLater.
inner.apply = async () => {
  throw new RetryLater('Not signed in right now')
}
let threwRetry: string | null = null
try {
  await backend.apply(change('bet.upsert', 'b401'), snap)
} catch (err) {
  threwRetry = (err as Error).message
}
check('RetryLater is not surfaced', threwRetry, null)
check('RetryLater is queued', outboxStatus().pending, 1)
inner.apply = async (change: any) => {
  sent.push(change.kind + ':' + change.id)
}
for (const fn of listeners['online'] ?? []) fn()
await new Promise((r) => setTimeout(r, 20))
check('RetryLater change drains later', sent.at(-1), 'bet.upsert:b401')

// 7. whenSettled waits for the write it was called after, and says whether
//    it landed. Cleanup that depends on a row (deleting the logo file the
//    old row pointed at) hangs off this.
let release: (() => void) | null = null
inner.apply = async (change: any) => {
  await new Promise<void>((r) => (release = r))
  sent.push(change.kind + ':' + change.id)
}
const pendingApply = backend.apply(change('course.upsert', 'c1'), snap)
let settledEarly = false
const settled = whenSettled().then((ok) => {
  settledEarly = true
  return ok
})
await new Promise((r) => setTimeout(r, 5))
check('whenSettled waits while a write is in flight', settledEarly, false)
release!()
await pendingApply
check('whenSettled resolves true once it landed', await settled, true)

inner.apply = async () => {
  throw new Error('permission denied')
}
let refusedMsg: string | null = null
try {
  await backend.apply(change('course.upsert', 'c2'), snap)
} catch (err) {
  refusedMsg = (err as Error).message
}
check('refusal still propagates', refusedMsg, 'permission denied')
check('whenSettled after an old refusal resolves true', await whenSettled(), true)
// Called right after the store call, the way CourseBrandEditor does it.
const refusedApply = backend.apply(change('course.upsert', 'c3'), snap).catch(() => {})
const duringRefusal = whenSettled()
await refusedApply
check('whenSettled reports false when that write was refused', await duringRefusal, false)

// 8. The queue survives a reload.
check('queue persisted to storage', typeof store.get('sandbagger-outbox-v1'), 'string')

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
