import { ShopProducts } from '../../components/ShopProducts'
import { CartLink } from '../../components/CartLink'
import { SiteFooter } from '../../components/SiteFooter'
import { createPageMetadata } from '../../lib/seo'
import { JsonLd } from '../../components/JsonLd'
import { breadcrumbStructuredData } from '../../lib/seo/structured-data'
import { PrimaryNavigation } from '../../components/PrimaryNavigation'
import { AnnouncementBar } from '../../components/AnnouncementBar'
import { Suspense } from 'react'

export const metadata = createPageMetadata({ title: 'Shop Gel Blasters | Hydro Blasters MNL', description: 'Browse beginner-friendly and upgradeable gel blasters, accessories, and magazines from Hydro Blasters MNL.', path: '/shop' })

export default function ShopPage() {
  return (
    <div className="site-shell">
      <JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }])} />
      <AnnouncementBar />
      <header className="site-header">
        <a className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></a>
        <PrimaryNavigation />
        <div className="header-actions"><CartLink /></div>
      </header>
      <main>
        <section className="section shop-section">
          <div className="section-heading"><p className="eyebrow">Product catalogue</p><h1>Shop</h1><p className="shop-intro">Browse currently active products from Hydro Blasters MNL.</p></div>
          <Suspense fallback={<div className="catalogue-state">Loading products…</div>}><ShopProducts /></Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
