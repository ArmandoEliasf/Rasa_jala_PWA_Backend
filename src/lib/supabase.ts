import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        // Keep the refresh token for this browser tab/session only. Closing the
        // tab or browser clears the authenticated session instead of restoring it later.
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
