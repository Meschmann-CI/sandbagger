import { Fragment, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { BetType } from '../types'
import { GAME_CARDS_CSS, gameCard } from '../lib/gameCards'

// The rules of a game as a parlor card: one drawing, the title, seven
// rules, and a button to put the game on the round. Opens from the games
// menu ("See how it works") and from the "?" on a bet already placed.

const SERIF = "ui-serif, 'New York', Georgia, serif"

/** "**the stake**" in a rule reads bold. */
function Rule({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))}
    </>
  )
}

const CORNER = 'M3 25C3 12 12 3 25 3M7 25C7 15 15 7 25 7M12 15c3-2 6 1 4 4-2 2-5 0-3-2'

export function GameCardSheet({
  type,
  onClose,
  onAdd,
  added,
}: {
  type: BetType
  onClose: () => void
  /** Puts the game on the round; leave it out where it is on already. */
  onAdd?: () => void
  /** Already picked on the menu: the button takes it off instead. */
  added?: boolean
}) {
  const card = gameCard(type)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!card) return null

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`${card.title}, the rules`}>
      <style>{GAME_CARDS_CSS}</style>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 animate-[fade_0.2s_ease-out]" />
      <div className="sheet-up absolute inset-x-0 bottom-0 mx-auto max-h-[94dvh] max-w-md overflow-y-auto rounded-t-3xl bg-paper px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between">
          <span className="w-16" />
          <div className="h-1.5 w-10 rounded-full bg-line-strong" />
          <button type="button" onClick={onClose} className="w-16 py-2 text-right text-body font-bold text-green">
            Done
          </button>
        </div>

        <div className="relative mt-2 rounded-md border-2 border-forest bg-[#F3EAD4] p-[5px]">
          <div className="flex flex-col items-center gap-4 rounded-[3px] border border-forest px-[18px] pb-6 pt-[22px] text-ink">
            {[false, true].map((flip) => (
              <svg
                key={String(flip)}
                width="28"
                height="28"
                viewBox="0 0 28 28"
                aria-hidden="true"
                className={`absolute top-3 ${flip ? 'right-3 -scale-x-100' : 'left-3'}`}
              >
                <path d={CORNER} fill="none" stroke="#1C4632" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            ))}

            <div className="aspect-[4/3] w-full max-w-[320px]" dangerouslySetInnerHTML={{ __html: card.svg }} />

            <svg width="100%" height="16" viewBox="0 0 300 16" aria-hidden="true">
              <path d="M0 8h116M184 8h116" fill="none" stroke="#1C4632" strokeWidth="1.2" />
              <path d="M116 8c9-5 19-5 28 0-9 5-19 5-28 0zM184 8c-9-5-19-5-28 0 9 5 19 5 28 0z" fill="#1C4632" />
              <path d="M146 8l4-4 4 4-4 4z" fill="#F6C744" stroke="#1C4632" strokeWidth="1" />
            </svg>

            <div className="flex flex-col items-center gap-1.5 text-center">
              <h2
                style={{ fontFamily: SERIF }}
                className={`m-0 font-black uppercase leading-none tracking-[2px] text-forest ${card.title.length > 12 ? 'text-[32px]' : card.title.length > 7 ? 'text-[36px]' : 'text-[50px]'}`}
              >
                {card.title}
              </h2>
              <p style={{ fontFamily: SERIF }} className="m-0 text-[17px] font-medium italic leading-snug text-ink-dim">
                {card.subtitle.split('\n').map((line, i) => (
                  <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </p>
            </div>

            <ol className="mt-1 flex w-full list-none flex-col gap-3 p-0">
              {card.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-3 text-[15.5px] leading-[1.42]">
                  <span className="-mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest text-[13px] font-extrabold text-on-forest">
                    {i + 1}
                  </span>
                  <span>
                    <Rule text={rule} />
                  </span>
                </li>
              ))}
            </ol>

            {card.note && <p className="m-0 w-full text-[13px] leading-snug text-ink-faint">{card.note}</p>}

            <div className="mt-2.5 flex w-full items-center gap-2.5">
              <div className="h-px flex-1 bg-forest opacity-45" />
              <span className="text-[11px] font-bold tracking-[3px] text-forest">GENTLEMANLY WAGERS</span>
              <div className="h-px flex-1 bg-forest opacity-45" />
            </div>
          </div>
        </div>

        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className={`mt-4 h-[52px] w-full rounded-full text-[17px] font-bold ${
              added ? 'border-[1.5px] border-line-strong bg-card text-ink-dim' : 'bg-green text-white'
            }`}
          >
            {added ? `Take ${card.title} off this round` : `Add ${card.title} to this round`}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
