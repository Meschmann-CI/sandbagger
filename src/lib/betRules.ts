import type { BetType } from '../types'

// House rules, in the app, where the argument happens. Every line here
// describes what the code actually does — if one of these stops being
// true, the settlement is the thing that's wrong, not the blurb.
//
// The lines change with the bet's own settings, so a skins bet set to
// winner-take-all explains a pot rather than per-skin payouts.

export interface BetRules {
  title: string
  lines: string[]
}

export function betRules(
  type: BetType,
  opts: { net?: boolean; winnerTakeAll?: boolean } = {},
): BetRules {
  const { net, winnerTakeAll } = opts

  // Handicaps come up in three of the four games and read the same way
  // in all of them, bar who the strokes are measured against.
  const strokes = (against: string) =>
    net === false
      ? 'Gross: raw scores, nobody gets a stroke.'
      : `Net: strokes come off ${against}, hardest holes first. The gold dots on the scorecard show who gets one where.`

  switch (type) {
    case 'skins':
      return {
        title: 'Skins',
        lines: [
          'Low score on a hole wins it. That hole is a skin.',
          'Tie a hole and nobody wins it — the skin carries onto the next one, and they keep stacking until somebody wins a hole outright and takes the whole pile.',
          winnerTakeAll
            ? 'Winner takes all: everyone antes the stake into one pot, and whoever holds the most skins at the end takes it. A tie for most splits the pot.'
            : 'Per skin: every skin pays the stake from each of the other players, so a hole carrying two pushes pays three stakes a head. No separate end-of-round kitty.',
          'Skins still carrying after the 18th die unclaimed. Nobody gets them.',
          strokes('the low course handicap'),
        ],
      }
    case 'nassau':
      return {
        title: 'Nassau',
        lines: [
          'Three separate bets at the same stake: the front nine, the back nine, and the full eighteen.',
          'Lowest total wins each one, and each pays the stake from every other player. Win all three and you collect three times.',
          'A tied segment is halved — nobody pays on it.',
          strokes('each golfer’s own course handicap'),
        ],
      }
    case 'match':
      return {
        title: 'Match play',
        lines: [
          'One on one, hole by hole. Win a hole and you go one up; tie it and the hole is halved, which moves nothing.',
          'Most holes up at the end takes the stake. All square after eighteen and nobody pays.',
          'The match closes early the moment the lead is bigger than the holes left — a 3-up lead with 2 to play is "3&2", and it ends there.',
          'Dormie means the lead exactly equals the holes left: the leader can’t lose from there, only be caught.',
          strokes('the difference between the two course handicaps'),
        ],
      }
    default:
      return {
        title: 'Custom bet',
        lines: [
          'A one-off: closest to the pin, longest drive, first to find the water, whatever you shook on.',
          'The card can’t judge it, so you pick the winner yourself.',
          'The winner collects the stake from each of the other players in the bet.',
        ],
      }
  }
}
