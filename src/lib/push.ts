import { supabase } from './supabase'

// Web push, the part that runs in the app.
//
// Turning notifications on subscribes THIS device with Apple's push
// service and files the subscription under the signed-in player; the
// `notify` Edge Function fans messages out to those subscriptions. On an
// iPhone this only works once the app is on the home screen (iOS 16.4+),
// and the permission prompt has to come from a tap — both facts shape
// the Profile toggle.

// The public half of the VAPID pair; the private half lives only in the
// Edge Function.
const VAPID_PUBLIC_KEY = 'BO8kfsPTCDy14HUTMeCacvLk_pmdSUWxqAIXG0sQJySuymKCO465tFlcl2egpzDH-pJHgFAKM62P8NwiacRk15E'

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function applicationServerKey(): Uint8Array {
  const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)
  const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration()
  return !!(await registration?.pushManager.getSubscription())
}

/** Must be called from a tap — iOS refuses the prompt otherwise. */
export async function enablePush(playerId: string): Promise<'on' | 'denied' | 'failed'> {
  if (!supabase || !pushSupported()) return 'failed'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey() as BufferSource,
  })
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'failed'
  const { error } = await supabase.from('push_subscriptions').upsert(
    { player_id: playerId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  )
  return error ? 'failed' : 'on'
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

export interface PushMessage {
  toPlayerIds: string[]
  title: string
  body?: string
  /** In-app path to open when tapped, e.g. /rounds/abc. */
  url?: string
}

/**
 * Fire-and-forget: a notification that doesn't send must never break the
 * action that triggered it. Recipients without a subscription (guests,
 * holdouts) are simply skipped by the function.
 */
export function notifyGroup(message: PushMessage): void {
  if (!supabase || message.toPlayerIds.length === 0) return
  void supabase.functions.invoke('notify', { body: message }).catch(() => {
    /* their phones just don't buzz this time */
  })
}
