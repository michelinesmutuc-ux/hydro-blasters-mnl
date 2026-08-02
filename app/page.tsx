import { PublicProducts } from '../components/PublicProducts'
import { CartLink } from '../components/CartLink'
import { SiteFooter } from '../components/SiteFooter'
import { JsonLd } from '../components/JsonLd'
import { PrimaryNavigation } from '../components/PrimaryNavigation'
import { organizationStructuredData } from '../lib/seo/structured-data'

export default function Home() {
  return (
    <div className="site-shell">
      <JsonLd data={organizationStructuredData()} />
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Go to Home">
          <img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
          <span className="brand-home-label" aria-hidden="true">Home</span>
        </a>
        <PrimaryNavigation />
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Search">⌕</button>
          <CartLink />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <h1>Hydro Blasters MNL</h1>
            <p className="hero-text">Browse. Compare. Learn.<br />Buy with confidence.</p>
            <p className="hero-supporting-text">Appointment-based showroom <span aria-hidden="true">•</span> Established 2021</p>
            <div className="button-row">
              <a className="primary-button" href="/shop">Shop Products</a>
              <a className="secondary-button" href="/appointments">Book a Showroom Visit</a>
            </div>
          </div>
        </section>

        <section className="section section-arrivals" id="shop">
          <div className="section-heading"><p className="eyebrow">Selected products</p><h2>Featured products</h2></div>
          <PublicProducts homepageHighlights />
        </section>

        <section className="visit-section" id="visit">
          <div><p className="eyebrow">Showroom appointment</p><h2>Planning to visit?</h2><p>Showroom visits are arranged in advance.</p></div>
          <a className="primary-button" href="/appointments">Book a visit <span>→</span></a>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
