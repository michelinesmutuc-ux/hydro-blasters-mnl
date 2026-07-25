import { ProductDetails, type Product } from '../../../components/ProductDetails'
import { supabase } from '../../../lib/supabase/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProductPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise
  console.log('params.slug', params.slug)
  const { data, error } = await supabase
    .from('products')
    .select('id,name,slug,brand,category,price,stock,status,short_description,description,specifications,image_urls')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()
  console.log('returned product', data)

  return (
    <div className="site-shell">
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Hydro Blasters MNL home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /></a>
        <nav aria-label="Primary navigation"><a href="/shop">Shop</a><a href="/#categories">Categories</a><a href="/#about">About</a></nav>
        <div className="header-actions"><button className="icon-button" type="button" aria-label="Search">⌕</button><button className="icon-button" type="button" aria-label="Cart">⌑ <span className="cart-count">0</span></button></div>
      </header>
      <main><ProductDetails product={data as Product | null} error={error?.message} /></main>
      <footer><div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div><div className="footer-links"><div><h3>Contact</h3><p>Information not yet provided</p></div><div><h3>Social links</h3><p>Information not yet provided</p></div><div><h3>Store policies</h3><p>Information not yet provided</p></div><div><h3>Showroom</h3><p>Information not yet provided</p></div></div></footer>
    </div>
  )
}
