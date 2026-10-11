// A golfer's putts as a tiny row tucked under their scores, the way a
// paper card has a putts line: the front nine, Out, the back nine, In and
// the total, in the same columns as the scores above. One-putts are green,
// three or more red, and the twos stay quiet so the holes that matter show.
// The live card and a round's card both draw it.

const sum = (xs: (number | null)[], from: number, to: number) => xs.slice(from, to).reduce<number>((s, x) => s + (x ?? 0), 0)

export function PuttsRow({ putts }: { putts: (number | null)[] }) {
  const hole = (i: number) => {
    const x = putts[i]
    return (
      <td
        key={i}
        className={`pb-1.5 text-center text-caption font-semibold leading-none tabular-nums ${
          x == null ? 'text-ink-faint/50' : x <= 1 ? 'text-green' : x >= 3 ? 'text-flag' : 'text-ink-faint'
        }`}
      >
        {x ?? '·'}
      </td>
    )
  }
  const total = (from: number, to: number, key: string, strong = false) => (
    <td key={key} className={`pb-1.5 text-center text-caption font-bold leading-none tabular-nums ${strong ? 'text-ink-dim' : 'text-ink-faint'}`}>
      {sum(putts, from, to) || ''}
    </td>
  )
  return (
    <tr className="border-b border-line last:border-0">
      <td className="sticky left-0 z-20 bg-paper pb-1.5 pl-[42px] text-left text-caption font-semibold leading-none text-ink-faint">Putts</td>
      {Array.from({ length: 9 }, (_, i) => hole(i))}
      {total(0, 9, 'out')}
      {Array.from({ length: 9 }, (_, i) => hole(i + 9))}
      {total(9, 18, 'in')}
      {total(0, 18, 'tot', true)}
    </tr>
  )
}
