import type { TrophyArt } from './trophyArt'

// Artwork for trophies added after the Claude Design handoff, in its
// system (shelf shape, numeral, small caps line). Kept apart from
// trophyArt.ts so regenerating that file from the handoff can't drop them.
export const EXTRA_TROPHY_ART: Record<string, TrophyArt> = {
  flatstick: { shelf: 'brag', num: '<30', sub: 'PUTTS' },
  fourjack: { shelf: 'nobody', num: '4', sub: 'PUTTS' },
}
