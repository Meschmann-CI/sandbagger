// Handing a settle-up off to Venmo.
//
// Nothing is linked and no account is connected. A Venmo handle is just
// a public username, so all this does is build the URL that opens Venmo
// with the other golfer, the amount, and a note already filled in. The
// person still reviews and sends it themselves, inside Venmo.
//
// The https form is deliberate over the venmo:// scheme. On an iPhone
// it's a universal link, so it opens the app when it's installed and
// falls back to the website when it isn't. The custom scheme just fails
// silently instead, which would look like a broken button.

/** Whatever they pasted, reduced to the bare username. */
export function normalizeVenmo(raw: string): string {
  return raw
    .trim()
    // A pasted profile URL, with or without the scheme in front of it.
    .replace(/^(https?:\/\/)?(www\.)?venmo\.com\/(u\/)?/i, '')
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 30)
}

export const venmoProfile = (handle: string) => `https://venmo.com/u/${encodeURIComponent(handle)}`

export type VenmoAction = 'pay' | 'charge'

/**
 * `pay` sends them money, `charge` asks them for it. The note is what
 * shows up in the Venmo feed, so it says where the number came from.
 */
export function venmoLink(handle: string, amount: number, note: string, txn: VenmoAction = 'pay'): string {
  const params = [
    `txn=${txn}`,
    `recipients=${encodeURIComponent(handle)}`,
    `amount=${amount.toFixed(2)}`,
    `note=${encodeURIComponent(note)}`,
    // Settling up between friends isn't for the public feed.
    'audience=private',
  ].join('&')
  return `https://venmo.com/?${params}`
}
