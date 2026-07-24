const categories = ['Gel Blasters', 'Accessories', 'Magazines', 'Batteries']

const placeholders = [0, 1, 2]

function ProductPlaceholder() {
  return (
    <article className="product-card" aria-label="Product placeholder">
      <div className="product-placeholder-image">Product image placeholder</div>
      <div className="product-card-body">
        <p className="placeholder-label">Placeholder</p>
        <h3>Product name</h3>
        <dl className="product-meta">
          <div><dt>Price</dt><dd>Coming soon</dd></div>
          <div><dt>Availability</dt><dd>Coming soon</dd></div>
        </dl>
        <button className="outline-button" type="button" disabled>View product</button>
      </div>
    </article>
  )
}

export default function Home() {
  return (
    <div className="site-shell">
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Hydro Blasters MNL home">
          <img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" />
        </a>
        <nav aria-label="Primary navigation">
          <a href="#shop">Shop</a>
          <a href="#categories">Categories</a>
          <a href="#about">About</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Search">⌕</button>
          <button className="icon-button" type="button" aria-label="Cart">⌑ <span className="cart-count">0</span></button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Established 2021</p>
            <h1>Hydro Blasters MNL</h1>
            <p className="hero-text">Toy gel blasters, parts, accessories, and support since 2021.</p>
            <div className="button-row">
              <a className="primary-button" href="#shop">Shop products <span>→</span></a>
              <a className="secondary-button" href="#visit">Book a showroom visit</a>
            </div>
          </div>
          <div className="hero-placeholder" aria-label="Product image placeholder">
            <span>Product image placeholder</span>
          </div>
        </section>

        <section className="section" id="categories">
          <div className="section-heading"><p className="eyebrow">Browse</p><h2>Featured categories</h2></div>
          <div className="category-grid">
            {categories.map((category) => (
              <a className="category-card" href="#shop" key={category}>
                <div className="category-placeholder">Image placeholder</div>
                <div><h3>{category}</h3><span>Explore category →</span></div>
              </a>
            ))}
          </div>
        </section>

        <section className="section section-arrivals" id="shop">
          <div className="section-heading section-heading-row"><div><p className="eyebrow">Product catalogue</p><h2>New arrivals</h2></div><span className="coming-soon">Placeholder data</span></div>
          <div className="product-grid">{placeholders.map((item) => <ProductPlaceholder key={item} />)}</div>
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
          <a className="primary-button" href="#visit">Book a visit <span>→</span></a>
        </section>
      </main>

      <footer>
        <div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div>
        <div className="footer-links">
          <div><h3>Contact</h3><p>Information not yet provided</p></div>
          <div><h3>Social links</h3><p>Information not yet provided</p></div>
          <div><h3>Store policies</h3><p>Information not yet provided</p></div>
          <div><h3>Showroom</h3><p>Information not yet provided</p></div>
        </div>
      </footer>
    </div>
  )
}
