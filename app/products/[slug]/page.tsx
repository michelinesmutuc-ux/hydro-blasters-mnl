import { ProductDetails, type Product } from '../../../components/ProductDetails'
import { supabase } from '../../../lib/supabase/client'
import { fetchActiveProductBySlug } from '../../../lib/supabase/products'
import { fetchProductSpecifications } from '../../../lib/supabase/product-specifications'

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
        <a className="brand" href="/" aria-label="Hydro Blasters MNL home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /></a>
        <nav aria-label="Primary navigation"><a href="/shop">Shop</a><a href="/#categories">Categories</a><a href="/#about">About</a></nav>
        <div className="header-actions"><button className="icon-button" type="button" aria-label="Search">⌕</button><button className="icon-button" type="button" aria-label="Cart">⌑ <span className="cart-count">0</span></button></div>
      </header>
      <main><ProductDetails product={data as Product | null} specificationRows={specificationRows ?? []} error={error?.message} /></main>
      <footer><div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div><div className="footer-links"><div><h3>Contact</h3><p>Information not yet provided</p></div><div><h3>Social links</h3><p>Information not yet provided</p></div><div><h3>Store policies</h3><p>Information not yet provided</p></div><div><h3>Showroom</h3><p>Information not yet provided</p></div></div></footer>
    </div>
  )
}
