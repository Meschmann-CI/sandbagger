import { useEffect, useState } from 'react'
import type { AppData, Round } from '../types'
import { findCourse } from './courses'

// The day you played: what the weather actually was, so a round's scene
// can be painted with it (clouds, rain, how hard the flag flaps) and the
// round page can say "58°F, wind 21 mph". Months later, "the rain round"
// still looks like the rain round.
//
// Open-Meteo is free and needs no key. The course's town is geocoded
// once, then the day's weather is looked up: the forecast API covers the
// last three months, the archive API everything older. Both answers are
// cached on the phone, and a past day's weather never changes, so each
// round costs two requests once, ever.

export type Sky = 'clear' | 'cloudy' | 'rain' | 'snow'

export interface DayWeather {
  sky: Sky
  windy: boolean
  tempF: number
  windMph: number
  /** "Clear", "Overcast", "Rain", "Showers", … */
  label: string
}

const CACHE = 'sandbagger-weather-v1'
type Cache = Record<string, DayWeather | 'none'>

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Cache
  } catch {
    return {}
  }
}
function writeCache(key: string, value: DayWeather | 'none') {
  try {
    const c = readCache()
    c[key] = value
    localStorage.setItem(CACHE, JSON.stringify(c))
  } catch {
    // private mode: it just asks again next time
  }
}

// WMO weather codes, as Open-Meteo reports them.
function describe(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: 'clear', label: 'Clear' }
  if (code <= 2) return { sky: 'clear', label: 'Mostly clear' }
  if (code === 3) return { sky: 'cloudy', label: 'Overcast' }
  if (code === 45 || code === 48) return { sky: 'cloudy', label: 'Fog' }
  if (code >= 51 && code <= 57) return { sky: 'rain', label: 'Drizzle' }
  if (code >= 61 && code <= 67) return { sky: 'rain', label: 'Rain' }
  if (code >= 71 && code <= 77) return { sky: 'snow', label: 'Snow' }
  if (code >= 80 && code <= 82) return { sky: 'rain', label: 'Showers' }
  if (code >= 85 && code <= 86) return { sky: 'snow', label: 'Snow showers' }
  if (code >= 95) return { sky: 'rain', label: 'Thunderstorms' }
  return { sky: 'cloudy', label: 'Cloudy' }
}

const geoMemo = new Map<string, Promise<{ lat: number; lon: number } | null>>()
function geocode(place: string) {
  const key = place.trim().toLowerCase()
  if (!geoMemo.has(key)) {
    // "Queens, NY" → search "Queens", prefer a US hit.
    const name = place.split(',')[0].trim()
    geoMemo.set(
      key,
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { results?: { latitude: number; longitude: number; country_code?: string }[] } | null) => {
          const hit = j?.results?.find((x) => x.country_code === 'US') ?? j?.results?.[0]
          return hit ? { lat: hit.latitude, lon: hit.longitude } : null
        })
        .catch(() => null),
    )
  }
  return geoMemo.get(key)!
}

async function lookup(place: string, date: string): Promise<DayWeather | null> {
  const at = await geocode(place)
  if (!at) return null
  const daysAgo = (Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000
  if (daysAgo < 0) return null
  const host = daysAgo < 85 ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive'
  const q = new URLSearchParams({
    latitude: String(at.lat),
    longitude: String(at.lon),
    start_date: date,
    end_date: date,
    daily: 'weather_code,temperature_2m_max,wind_speed_10m_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
  })
  const r = await fetch(`${host}?${q}`)
  if (!r.ok) return null
  const j = (await r.json()) as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; wind_speed_10m_max?: number[] } }
  const code = j.daily?.weather_code?.[0]
  const temp = j.daily?.temperature_2m_max?.[0]
  const wind = j.daily?.wind_speed_10m_max?.[0]
  if (code == null || temp == null || wind == null) return null
  const d = describe(code)
  return { ...d, tempF: Math.round(temp), windMph: Math.round(wind), windy: wind >= 17 }
}

/** Where a round was, for the weather: the course's town, or the trip's location. */
export function placeFor(data: AppData, round: Round): string | null {
  const town = findCourse(data, round.courseName)?.town
  if (town) return town
  const trip = round.tripId ? data.trips.find((t) => t.id === round.tripId) : undefined
  return trip?.location || null
}

const inflight = new Map<string, Promise<DayWeather | null>>()

/** The weather on the day of a round, once it's known. Null while loading or when there's no place to look up. */
export function useRoundWeather(data: AppData, round: Round | undefined): DayWeather | null {
  const place = round ? placeFor(data, round) : null
  const key = place && round ? `${place.toLowerCase()}|${round.date}` : null
  const [weather, setWeather] = useState<DayWeather | null>(() => {
    const hit = key ? readCache()[key] : undefined
    return hit && hit !== 'none' ? hit : null
  })
  useEffect(() => {
    if (!key || !place || !round) return
    const hit = readCache()[key]
    if (hit) {
      setWeather(hit === 'none' ? null : hit)
      return
    }
    let live = true
    if (!inflight.has(key)) {
      inflight.set(
        key,
        lookup(place, round.date)
          .then((w) => {
            // Only a definite answer is cached; a failed request is tried again later.
            if (w) writeCache(key, w)
            return w
          })
          .catch(() => null),
      )
    }
    inflight.get(key)!.then((w) => live && setWeather(w))
    return () => {
      live = false
    }
  }, [key, place, round])
  return weather
}
