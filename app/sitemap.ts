import type { MetadataRoute } from 'next'
import { absoluteUrl } from '../lib/seo'
import { supabase } from '../lib/supabase/client'

export const dynamic = 'force-static'

const publicPaths = ['/', '/shop', '/about', '/visit-showroom', '/appointments', '/help/faq', '/help/getting-started', '/policies/warranty', '/policies/shipping', '/policies/appointments']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase.from('products').select('slug,updated_at').eq('is_active', true)
  if (error) throw new Error(`Could not generate product sitemap entries: ${error.message}`)
  return [
    ...publicPaths.map((path) => ({ url: absoluteUrl(path), lastModified: new Date() })),
    ...(data ?? []).map((product) => ({ url: absoluteUrl(`/products/${product.slug}`), lastModified: product.updated_at ? new Date(product.updated_at) : new Date() })),
  ]
}
