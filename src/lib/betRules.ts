import type { Bet, BetType, NassauPlay, VegasPlay } from '../types'

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
  opts: { net?: boolean; winnerTakeAll?: boolean; nassau?: NassauPlay; vegas?: VegasPlay } = {},
): BetRules {
  const { net, winnerTakeAll, nassau, vegas } = opts

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
          'Tie a hole and nobody wins it. The skin carries onto the next one, and they keep stacking until somebody wins a hole outright and takes the whole pile.',
          winnerTakeAll
            ? 'Winner takes all: everyone antes the stake into one pot, and whoever holds the most skins at the end takes it. A tie for most splits the pot.'
            : 'Per skin: every skin pays the stake from each of the other players, so a hole carrying two pushes pays three stakes a head. No separate end-of-round kitty.',
          'Skins still carrying after the 18th die unclaimed. Nobody gets them.',
          strokes('the low course handicap'),
        ],
      }
    case 'nassau':
      if (nassau?.format === 'match') {
        const auto = nassau.autoPress && nassau.autoPress > 0 ? nassau.autoPress : 0
        return {
          title: 'Nassau, match play',
          lines: [
            'Three matches between two golfers at the same stake: the front nine, the back nine, and the full eighteen.',
            'Each is match play: win a hole to go one up, tie it and it is halved. Most holes up takes that match; all square and nobody pays on it.',
            'A match closes early when the lead is bigger than the holes left in it, "3&2" on a nine.',
            'A press is a new bet at the same stake from that hole to the end of the nine. Press from the live card whenever you like.',
            auto
              ? `Presses are automatic at ${auto} down: whenever a golfer goes ${auto} down in any bet on a nine, the nine or a press, a new press starts on the next hole. Each bet sets off one press.`
              : 'No automatic presses on this one. They only happen when somebody calls one.',
            'Presses run on the nines only, never on the eighteen.',
            strokes('the difference between the two course handicaps'),
          ],
        }
      }
      return {
        title: 'Nassau',
        lines: [
          'Three separate bets at the same stake: the front nine, the back nine, and the full eighteen.',
          'Lowest total wins each one, and each pays the stake from every other player. Win all three and you collect three times.',
          'A tied segment is halved and nobody pays on it.',
          strokes('each golfer’s own course handicap'),
        ],
      }
    case 'match':
      return {
        title: 'Match play',
        lines: [
          'One on one, hole by hole. Win a hole and you go one up; tie it and the hole is halved, which moves nothing.',
          'Most holes up at the end takes the stake. All square after eighteen and nobody pays.',
          'The match closes early the moment the lead is bigger than the holes left. A 3-up lead with 2 to play is "3&2", and it ends there.',
          'Dormie means the lead exactly equals the holes left: the leader can’t lose from there, only be caught.',
          strokes('the difference between the two course handicaps'),
        ],
      }
    case 'wolf':
      return {
        title: 'Wolf',
        lines: [
          'Four golfers. The wolf rotates in tee order, one hole each, so the first two in the order are wolf again on the 17th and 18th.',
          'After the drives the wolf picks a partner, and it is two against two, best ball. Each golfer on the winning side takes the stake from one on the losing side.',
          'Or the wolf goes lone: one against three, best ball against the wolf, for double the stake with each of the other three.',
          'Blind wolf is going lone before anybody has hit, for triple the stake with each of the other three.',
          'A tied hole pushes and nothing moves. A hole waits until the wolf’s call is in.',
          strokes('the low course handicap'),
        ],
      }
    case 'vegas':
      return {
        title: 'Vegas',
        lines: [
          'Two against two. On each hole a team puts its two scores side by side, low first: a 4 and a 5 make 45, a 4 and a 10 make 410.',
          'The lower number wins the difference in points. The stake is per point, so keep it small.',
          'Each golfer on the losing team pays the points times the stake to one on the winning team, settled on the total at the end.',
          vegas?.birdieFlip === false
            ? 'No birdie flip on this one.'
            : 'Birdie flip: a team that makes a birdie turns the other team’s number round, high first, so 45 becomes 54. Birdies on both teams cancel out.',
          net === false
            ? 'Gross: raw scores, nobody gets a stroke.'
            : 'Net: strokes come off the low course handicap, hardest holes first, and birdies count net. The gold dots on the scorecard show who gets one where.',
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

/** The rules sheet for a saved bet, read off its own settings. */
export const rulesFor = (bet: Bet) =>
  betRules(bet.type, { net: bet.net, winnerTakeAll: bet.winnerTakeAll, nassau: bet.nassau, vegas: bet.vegas })
