import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function response(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), { status, headers })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return response({ error: 'Missing Authorization header. Sign in and try again.' }, 401)
  if (!authorization.startsWith('Bearer ')) return response({ error: 'Invalid Authorization header.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const deployHook = Deno.env.get('CLOUDFLARE_PAGES_DEPLOY_HOOK')
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Publishing function authentication is not configured.')
    return response({ error: 'Publishing function authentication is not configured.' }, 500)
  }
  if (!deployHook) {
    console.error('Cloudflare Pages deploy hook is missing.')
    return response({ error: 'Cloudflare deploy-hook secret is missing.' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const accessToken = authorization.slice('Bearer '.length)
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    console.error('Publish authentication failed:', userError?.message)
    return response({ error: 'Access token is invalid or expired.' }, 401)
  }
  if (user.app_metadata?.role !== 'admin') return response({ error: 'You are not authorized to publish the website.' }, 403)

  try {
    const cloudflareResponse = await fetch(deployHook, { method: 'POST' })
    if (!cloudflareResponse.ok) {
      console.error('Cloudflare Pages rejected the deployment trigger.', cloudflareResponse.status)
      return response({ error: 'Cloudflare could not start the deployment. Try again later.' }, 502)
    }
  } catch (error) {
    console.error('Could not contact Cloudflare Pages.', error)
    return response({ error: 'Cloudflare could not start the deployment. Try again later.' }, 502)
  }

  return response({ message: 'Website deployment started.' }, 202)
})
