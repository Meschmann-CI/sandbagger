import { supabase } from './supabase'
import type { CourseTee } from '../types'

// Reading a scorecard off a photo.
//
// The phone takes the picture, shrinks it, and hands it to the
// `scan-card` Edge Function, which asks Claude to transcribe what's
// printed into the shape the course editor already uses. Nothing here
// saves anything: the result pre-fills the editor, and the golfer reads
// it against the card before tapping Add. A wrong stroke index changes
// who gets a shot on which hole, so the review step isn't optional.

export interface ScannedHole {
  hole: number
  par: number | null
  strokeIndex: number | null
  yards: number | null
}

export interface ScannedCard {
  name: string | null
  town: string | null
  holes: ScannedHole[]
  tees: (CourseTee & { holeYards?: (number | null)[] })[]
  /** Anything the reader wasn't sure of, in its own words. */
  notes: string[]
}

export interface ScanResult {
  card: ScannedCard
  /** Checks the server ran on the numbers — pars that don't add up, an index with a gap. */
  warnings: string[]
}

export const scanSupported = () => !!supabase

// Bigger than the trip-photo resize: the small print on a card (a 17
// in the handicap row) needs the pixels. ~1600px long side is plenty
// for a phone shot of a card and keeps the upload under half a meg.
const MAX_DIM = 1600
const QUALITY = 0.82

async function shrink(file: File): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  if (!file.type.startsWith('image/')) throw new Error('That isn’t a photo')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' }
}

// The function answers a refusal with a plain-English reason in the
// body (over the daily cap, no scorecard in the photo); surface that
// rather than supabase-js's generic wrapper.
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Scanning needs the online app')
  const { data, error } = await supabase.functions.invoke<T>('scan-card', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.text === 'function') {
      try {
        const text = await ctx.text()
        const parsed = JSON.parse(text) as { error?: string }
        throw new Error(parsed.error || text || error.message)
      } catch (e) {
        if (e instanceof Error && e.message && !/JSON/.test(e.message)) throw e
      }
    }
    throw new Error(error.message || 'The scan didn’t come back')
  }
  if (!data) throw new Error('Nothing readable came back')
  return data
}

export async function scanCard(file: File): Promise<ScanResult> {
  const image = await shrink(file)
  const data = await invoke<ScanResult>({ ...image, mode: 'card' })
  if (!data.card) throw new Error('Nothing readable came back')
  return data
}

/** A row of handwritten scores off a filled-in card, as read. */
export interface ScannedScoreRow {
  name: string | null
  scores: (number | null)[]
  total: number | null
}

export interface ScoresResult {
  rows: ScannedScoreRow[]
  notes: string[]
  warnings: string[]
}

export async function scanScores(file: File): Promise<ScoresResult> {
  const image = await shrink(file)
  const data = await invoke<ScoresResult>({ ...image, mode: 'scores' })
  if (!Array.isArray(data.rows)) throw new Error('Nothing readable came back')
  return data
}

/**
 * Which tee to make the default from a scanned set: the men's White,
 * else whichever men's set is nearest 6,100 yards. Same rule as the
 * data import, so a scanned course and an imported one agree.
 */
export function defaultTee(tees: ScannedCard['tees']): CourseTee | undefined {
  const mens = tees.filter((t) => (t.gender ?? 'M') === 'M' && t.rating && t.slope)
  return (
    mens.find((t) => /^white/i.test(t.name)) ??
    [...mens].sort((a, b) => Math.abs((a.yards ?? 6100) - 6100) - Math.abs((b.yards ?? 6100) - 6100))[0]
  )
}
