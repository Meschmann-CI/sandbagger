import { supabase } from './supabase'
import type { Round, RoundPhoto } from '../types'

// Photos on a round.
//
// In the cloud the file goes to the round-photos storage bucket and the
// round carries only the URL — every phone reloads every round on each
// change, and a dozen inline photos would turn that into megabytes. In
// local mode there's no bucket, so the photo is stored inline as a data
// URL, the way trip photos always were.

const BUCKET = 'round-photos'
const MAX_DIM = 1600
const QUALITY = 0.8

/** Shrinks a photo to something a phone can upload on one bar. */
export async function shrinkPhoto(file: File): Promise<Blob> {
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
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', QUALITY),
  )
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob()

export const newPhotoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.floor(Math.random() * 1e12).toString(16)}`

/**
 * Puts one already-shrunk photo where it lives and returns the record
 * to attach to the round. Takes a Blob straight from the picker, or the
 * data URL a queued photo was parked as while there was no signal.
 */
export async function uploadRoundPhoto(
  image: Blob | string,
  round: Round,
  id: string,
  byId: string,
  takenAt: string,
): Promise<RoundPhoto> {
  if (!supabase) {
    const url = typeof image === 'string' ? image : await blobToDataUrl(image)
    return { id, url, byId, takenAt }
  }
  const blob = typeof image === 'string' ? await dataUrlToBlob(image) : image
  const path = `${round.groupId}/${round.id}/${id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`Couldn’t upload the photo: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { id, url: data.publicUrl, path, byId, takenAt }
}

/** Removes the stored file, if there is one. The round record is the caller's to update. */
export async function removeRoundPhotoFile(photo: RoundPhoto): Promise<void> {
  if (!supabase || !photo.path) return
  const { error } = await supabase.storage.from(BUCKET).remove([photo.path])
  if (error) throw new Error(`Couldn’t delete the photo: ${error.message}`)
}
