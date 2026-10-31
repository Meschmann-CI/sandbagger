import { useEffect } from 'react'

// A form open inline on a page (a bet, an itinerary item, a trip cost)
// holds back the app reloading itself for a new version, which would
// throw away whatever had been typed. Each editor calls useHoldUpdates()
// while it's on screen; useNewVersion asks updatesHeld() before reloading.

let holds = 0

export const updatesHeld = () => holds > 0

/** The same hold as an element, for a form that lives inside a bigger component: `<HoldUpdates />` next to the input. */
export function HoldUpdates() {
  useHoldUpdates()
  return null
}

/** The same hold for work outside React (pulling hole maps). Call the result to let go. */
export function holdUpdates(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
  }
}

export function useHoldUpdates() {
  useEffect(() => {
    holds++
    return () => {
      holds--
    }
  }, [])
}
