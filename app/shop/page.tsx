import { ShopProducts } from '../../components/ShopProducts'
import { CartLink } from '../../components/CartLink'

export default function ShopPage() {
  return (
    <div className="site-shell">
      <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></a>
        <nav aria-label="Primary navigation"><a href="/shop">Shop</a><a href="/#categories">Categories</a><a href="/#about">About</a></nav>
        <div className="header-actions"><button className="icon-button" type="button" aria-label="Search">⌕</button><CartLink /></div>
      </header>
      <main>
        <section className="section shop-section">
          <div className="section-heading"><p className="eyebrow">Product catalogue</p><h1>Shop</h1><p className="shop-intro">Browse currently active products from Hydro Blasters MNL.</p></div>
          <ShopProducts />
        </section>
      </main>
      <footer><div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div><div className="footer-links"><div><h3>Contact</h3><p>Information not yet provided</p></div><div><h3>Social links</h3><p>Information not yet provided</p></div><div><h3>Store policies</h3><p>Information not yet provided</p></div><div><h3>Showroom</h3><p>Information not yet provided</p></div></div></footer>
    </div>
  )
}
