import { PublicProducts } from '../components/PublicProducts'
import { CartLink } from '../components/CartLink'
import { SiteFooter } from '../components/SiteFooter'

export default function Home() {
  return (
    <div className="site-shell">
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Go to Home">
          <img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
          <span className="brand-home-label" aria-hidden="true">Home</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="/shop">Shop</a>
          <a href="#categories">Categories</a>
          <a href="#about">About</a>
        </nav>
        <div className="header-actions">
          <a className="mobile-shop-link" href="/shop">Shop</a>
          <button className="icon-button" type="button" aria-label="Search">⌕</button>
          <CartLink />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Established 2021</p>
            <h1>Hydro Blasters MNL</h1>
            <p className="hero-text">Toy gel blasters, parts, accessories, and support since 2021.</p>
            <div className="button-row">
              <a className="primary-button" href="/shop">Browse the arsenal <span>→</span></a>
              <a className="secondary-button" href="/appointments">Book a visit</a>
            </div>
          </div>
          <div className="hero-placeholder" aria-label="Product image placeholder">
            <span>Product image placeholder</span>
          </div>
        </section>

        <section className="section section-arrivals" id="shop">
          <div className="section-heading"><p className="eyebrow">Selected products</p><h2>Featured products</h2></div>
          <PublicProducts homepageHighlights />
        </section>

        <section className="section about-section" id="about">
          <div className="section-heading"><p className="eyebrow">About the store</p><h2>Why Hydro Blasters MNL</h2></div>
          <div className="fact-grid">
            <article><span>01</span><h3>Established in 2021</h3></article>
            <article><span>02</span><h3>Specialized toy gel blaster store</h3></article>
            <article><span>03</span><h3>Showroom visits by appointment</h3></article>
          </div>
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
