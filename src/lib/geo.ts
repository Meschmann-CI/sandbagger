// Points on the earth and the distance between them. Split out of
// courseMap.ts so the pure logic (suggest.ts, the tests) can measure
// without pulling in the map fetching and the Supabase client behind it.

/** [longitude, latitude], rounded to 6 places (about 10cm). */
export type LngLat = [number, number]

export const EARTH_R = 6371008.8
export const rad = (d: number) => (d * Math.PI) / 180
export const YARDS_PER_METRE = 1.0936133

/** Metres between two points. */
export function metres(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}
export const yards = (a: LngLat, b: LngLat) => Math.round(metres(a, b) * YARDS_PER_METRE)
