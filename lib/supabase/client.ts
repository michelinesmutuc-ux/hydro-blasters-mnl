import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const supabasePublishableKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim()

function isValidProjectUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) && (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash
  } catch {
    return false
  }
}

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.',
  )
}

if (!isValidProjectUrl(supabaseUrl)) {
  throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL. Use only the Project URL in the format https://your-project.supabase.co, without /rest/v1 or another path.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
