type PlaceholderTone = 'blue' | 'purple' | 'pink'

function ProductPlaceholder({ tone }: { tone: PlaceholderTone }) {
  return (
    <article className={`product product-${tone} product-placeholder`}>
      <div className="product-image">
        <span className="tag">Coming soon</span>
      </div>
      <div className="product-info">
        <h3>Product information</h3>
        <p>Coming soon</p>
        <div className="price-row">
          <span className="price">—</span>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  return (
    <div className="shell">
      <div className="notice"><i /> Store information coming soon</div>
      <header>
        <a className="brand" href="#top" aria-label="Hydro Blasters MNL home"><img className="brand-mark" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /></a>
        <nav><a href="#shop">Shop</a><a href="#categories">Categories</a><a href="#arrivals">New arrivals</a></nav>
        <div className="header-actions">
          <button className="icon-btn" aria-label="Search">⌕</button>
          <button className="icon-btn" aria-label="Shopping cart">⌑ <span className="cart-count">0</span></button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-label="Storefront hero">
          <div className="grid" />
          <div className="hero-stat"><strong>COMING SOON</strong>Product details</div>
          <img className="hero-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
          <p className="kicker">Coming soon</p>
          <h1>Storefront <em>coming soon.</em></h1>
          <p className="hero-copy">Product and store information will be added here.</p>
          <div className="cta-row"><a className="button primary" href="#shop">Coming soon <span>→</span></a><a className="button ghost" href="#categories">Categories</a></div>
        </section>

        <div className="trust"><div><b>Store information</b>Coming soon</div><div><b>Availability</b>Coming soon</div><div><b>Product details</b>Coming soon</div></div>

        <section id="shop"><div className="section-head"><div><p className="eyebrow">Coming soon</p><h2>Products</h2></div><button className="view-all">Coming soon →</button></div><div className="product-row"><ProductPlaceholder tone="blue" /><ProductPlaceholder tone="purple" /><ProductPlaceholder tone="pink" /></div></section>

        <section id="categories"><div className="section-head"><div><p className="eyebrow">Coming soon</p><h2>Categories</h2></div></div><div className="category-grid">
          <a className="category" href="#shop"><h3>Category</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category</h3><span>Coming soon →</span></a>
        </div></section>

        <section id="arrivals"><div className="section-head"><div><p className="eyebrow">Coming soon</p><h2>Updates</h2></div><button className="view-all">Coming soon →</button></div><div className="product-row"><ProductPlaceholder tone="blue" /><ProductPlaceholder tone="purple" /><ProductPlaceholder tone="pink" /></div></section>

        <div className="banner"><p className="eyebrow">Coming soon</p><h2>Updates coming soon.</h2><p>Store information will be added here.</p><a className="button primary" href="#shop">Coming soon</a></div>
      </main>
      <footer><img className="footer-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Details coming soon</span></footer>
    </div>
  )
}
