import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Product routes are dynamically rendered from Supabase; no static export or
// build-time product parameter list is configured for this application.
export default defineCloudflareConfig()
