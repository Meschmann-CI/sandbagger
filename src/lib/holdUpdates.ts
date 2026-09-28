import { useEffect } from 'react'

// A form open inline on a page (a bet, an itinerary item, a trip cost)
// holds back the app reloading itself for a new version, which would
// throw away whatever had been typed. Each editor calls useHoldUpdates()
// while it's on screen; useNewVersion asks updatesHeld() before reloading.

let holds = 0

export const updatesHeld = () => holds > 0

export function useHoldUpdates() {
  useEffect(() => {
    holds++
    return () => {
      holds--
    }
  }, [])
}
