import { ProductDetails, type Product } from '../../../components/ProductDetails'
import { supabase } from '../../../lib/supabase/client'
import { fetchActiveProductBySlug } from '../../../lib/supabase/products'
import { fetchProductSpecifications } from '../../../lib/supabase/product-specifications'
import { CartLink } from '../../../components/CartLink'
import { SiteFooter } from '../../../components/SiteFooter'

export const dynamicParams = false

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

  if (specificationError) {
    throw new Error(`Could not export specifications for ${params.slug}: ${specificationError.message}`)
  }

  return (
    <div className="site-shell">
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></a>
        <nav aria-label="Primary navigation"><a href="/shop">Shop</a><a href="/#categories">Categories</a><a href="/#about">About</a></nav>
        <div className="header-actions"><a className="mobile-shop-link" href="/shop">Shop</a><button className="icon-button" type="button" aria-label="Search">⌕</button><CartLink /></div>
      </header>
      <main><ProductDetails product={data as Product | null} specificationRows={specificationRows ?? []} error={error?.message} /></main>
      <SiteFooter />
    </div>
  )
}
