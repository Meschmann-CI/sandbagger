// Which of a round's moments this phone has already announced: the
// trophy sheet, the Final, the turn, a lead change. Kept so a score
// cleared and typed again fires nothing twice (audit 2026-10-24, item
// 13), and so a save seen through a reload from another phone counts the
// same as one made here (item 11). The server keeps the matching list
// across phones (round_events; Backend.claim), this one is per phone.

const KEY = 'sandbagger-announced-v1'
const KEEP_ROUNDS = 60

let memory: Record<string, string[]> | null = null

function read(): Record<string, string[]> {
  if (memory) return memory
  try {
    memory = typeof localStorage === 'undefined' ? {} : (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string[]>)
  } catch {
    memory = {}
  }
  return memory
}

function write(all: Record<string, string[]>) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage full or blocked: the in-memory copy still holds for this session.
  }
}

export const wasAnnounced = (roundId: string, key: string): boolean => read()[roundId]?.includes(key) ?? false

export function markAnnounced(roundId: string, key: string) {
  const all = read()
  const list = all[roundId] ?? (all[roundId] = [])
  if (!list.includes(key)) list.push(key)
  // Oldest rounds out, so a season of Sundays doesn't grow it forever.
  const ids = Object.keys(all)
  for (const id of ids.slice(0, Math.max(0, ids.length - KEEP_ROUNDS))) delete all[id]
  write(all)
}

/** Tests only. */
export function forgetAnnounced() {
  memory = {}
  write(memory)
}
