import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// With no credentials the app runs entirely on localStorage, which keeps
// local development and demos working without a Supabase project.

// `import.meta.env` is Vite's; under plain Node (the tests, scripts) it's
// missing, and the modules that import this one still need to load.
const env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
const url = env.VITE_SUPABASE_URL?.trim()
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()

export const isCloudMode = !!(url && anonKey && url.startsWith('http'))

export const supabase: SupabaseClient | null = isCloudMode
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
