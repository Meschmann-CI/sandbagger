// Detail lines from the bet calculators end in "|<who>": one golfer's
// id, or a team's ids joined by "+". These read them out with the names
// in. A line whose golfer can't be found reads as its text alone.

type NameOf = (id: string) => string | undefined

/** "Pat", or "Matt & Nader" for a team; null when anyone is missing. */
export function whoIn(ref: string | undefined, nameOf: NameOf): string | null {
  if (!ref) return null
  const names = ref.split('+').map(nameOf)
  return names.every((n): n is string => !!n) ? names.join(' & ') : null
}

/** Name first, "Pat 2 up thru 14 · Matt & Nader up 23 points", for the round page and the live card. */
export function betStatus(detail: string[], nameOf: NameOf): string {
  return detail
    .map((line) => {
      const [text, ref] = line.split('|')
      const who = whoIn(ref, nameOf)
      return who ? `${who} ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text
    })
    .join(' · ')
}

/** "Takes it 3&2: Pat", one line each, for the bet editor. */
export function betDetailLines(detail: string[], nameOf: NameOf): string[] {
  return detail.map((line) => {
    const [text, ref] = line.split('|')
    const who = whoIn(ref, nameOf)
    return who ? `${text}: ${who}` : text
  })
}
