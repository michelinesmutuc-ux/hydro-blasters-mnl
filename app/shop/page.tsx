import { ShopProducts } from '../../components/ShopProducts'
import { CartLink } from '../../components/CartLink'
import { SiteFooter } from '../../components/SiteFooter'
import { createPageMetadata } from '../../lib/seo'
import { JsonLd } from '../../components/JsonLd'
import { breadcrumbStructuredData } from '../../lib/seo/structured-data'

export const metadata = createPageMetadata({ title: 'Shop Gel Blasters | Hydro Blasters MNL', description: 'Browse beginner-friendly and upgradeable gel blasters, accessories, and magazines from Hydro Blasters MNL.', path: '/shop' })

export default function ShopPage() {
  return (
    <div className="site-shell">
      <JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }])} />
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></a>
        <nav aria-label="Primary navigation"><a href="/">Home</a><a href="/shop">Shop</a><a href="/about">About</a><a href="/visit-showroom">Visit Showroom</a><a href="/appointments">Book a Visit</a><a href="/track-order">Track Order</a></nav>
        <div className="header-actions"><a className="mobile-shop-link" href="/shop">Shop</a><a className="mobile-about-link" href="/about">About</a><a className="mobile-visit-link" href="/visit-showroom">Visit</a><a className="mobile-track-link" href="/track-order">Track Order</a><button className="icon-button" type="button" aria-label="Search">⌕</button><CartLink /></div>
      </header>
      <main>
        <section className="section shop-section">
          <div className="section-heading"><p className="eyebrow">Product catalogue</p><h1>Shop</h1><p className="shop-intro">Browse currently active products from Hydro Blasters MNL.</p></div>
          <ShopProducts />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
