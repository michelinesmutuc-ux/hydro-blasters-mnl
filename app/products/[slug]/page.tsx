import { ProductDetails, type Product } from '../../../components/ProductDetails'
import { supabase } from '../../../lib/supabase/client'
import { fetchActiveProductBySlug } from '../../../lib/supabase/products'
import { fetchProductSpecifications } from '../../../lib/supabase/product-specifications'
import { fetchProductVariants } from '../../../lib/supabase/product-variants'
import { CartLink } from '../../../components/CartLink'
import { SiteFooter } from '../../../components/SiteFooter'
import type { Metadata } from 'next'
import { createPageMetadata, productDescription } from '../../../lib/seo'
import { JsonLd } from '../../../components/JsonLd'
import { breadcrumbStructuredData } from '../../../lib/seo/structured-data'
import { PrimaryNavigation } from '../../../components/PrimaryNavigation'
import { AnnouncementBar } from '../../../components/AnnouncementBar'

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { data } = await fetchActiveProductBySlug(slug)
  if (!data) return createPageMetadata({ title: 'Product unavailable', description: 'This Hydro Blasters MNL product is not currently available.', path: `/products/${slug}` })
  return createPageMetadata({ title: `${data.name} | Hydro Blasters MNL`, description: productDescription(data), path: `/products/${data.slug}`, image: data.image_urls?.[0] })
}

export async function generateStaticParams() {
  const { data, error } = await supabase
    .from('products')
    .select('slug')
    .eq('is_active', true)

  if (error) throw new Error(`Could not export product pages: ${error.message}`)

  const activeProductParams = (data ?? []).map((product) => ({ slug: product.slug }))

  // Next.js requires at least one path for a dynamic route in static-export mode.
  // This inert route is omitted whenever the catalogue contains an active product.
  return activeProductParams.length > 0 ? activeProductParams : [{ slug: '__catalogue-empty__' }]
}

export default async function ProductPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  const { data, error } = await fetchActiveProductBySlug(params.slug)
  const { data: specificationRows, error: specificationError } = data
    ? await fetchProductSpecifications(data.id)
    : { data: [], error: null }
  const { data: variantRows, error: variantError } = data
    ? await fetchProductVariants(data.id)
    : { data: [], error: null }

  if (specificationError) {
    throw new Error(`Could not export specifications for ${params.slug}: ${specificationError.message}`)
  }
  if (variantError) throw new Error(`Could not export variants for ${params.slug}: ${variantError.message}`)

  return (
    <div className="site-shell">
      {data && <JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: data.name, path: `/products/${data.slug}` }])} />}
      <AnnouncementBar />
      <header className="site-header">
        <a className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></a>
        <PrimaryNavigation />
        <div className="header-actions"><button className="icon-button" type="button" aria-label="Search">⌕</button><CartLink /></div>
      </header>
      <main><ProductDetails product={data as Product | null} specificationRows={specificationRows ?? []} variantRows={variantRows ?? []} error={error?.message} /></main>
      <SiteFooter />
    </div>
  )
}
