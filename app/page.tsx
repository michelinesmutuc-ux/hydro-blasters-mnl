'use client'

import { useState } from 'react'

type Product = {
  name: string
  details: string
  price: string
  tag: string
  tone: 'blue' | 'purple' | 'pink'
}

const featured: Product[] = [
  { name: 'Nova Drift M4', details: 'Electric · 7–8 mm gel balls', price: '₱4,995', tag: 'Best seller', tone: 'blue' },
  { name: 'Arc Pulse MP7', details: 'Electric · Compact platform', price: '₱3,795', tag: 'New drop', tone: 'purple' },
  { name: 'Vanta Strike AK', details: 'Electric · Full-size body', price: '₱5,995', tag: 'Collector pick', tone: 'pink' },
]

const arrivals: Product[] = [
  { name: 'Ion Mini Vector', details: 'Electric · 7–8 mm gel balls', price: '₱4,495', tag: 'Limited', tone: 'blue' },
  { name: 'Orbit Pro P90', details: 'Electric · Compact platform', price: '₱4,995', tag: 'Restocked', tone: 'purple' },
  { name: 'Flux Cobalt G36', details: 'Electric · Full-size body', price: '₱5,495', tag: 'New color', tone: 'pink' },
]

function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const [added, setAdded] = useState(false)

  function addToCart() {
    onAdd()
    setAdded(true)
    window.setTimeout(() => setAdded(false), 850)
  }

  return (
    <article className={`product product-${product.tone}`}>
      <div className="product-image">
        <span className="tag">{product.tag}</span>
        <div className="mini-blaster" aria-hidden="true" />
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.details}</p>
        <div className="price-row">
          <span className="price">{product.price}</span>
          <button className="add" onClick={addToCart} aria-label={`Add ${product.name} to cart`}>
            {added ? '✓' : '+'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Home() {
  const [cartCount, setCartCount] = useState(0)
  const add = () => setCartCount((count) => count + 1)

  return (
    <div className="shell">
      <div className="notice"><i /> Free Metro Manila delivery on orders over ₱3,000</div>
      <header>
        <a className="brand" href="#top" aria-label="Hydro Blasters MNL home"><span className="brand-mark"><b>H</b></span><span>HYDRO<br />BLASTERS <span className="brand-accent">MNL</span></span></a>
        <nav><a href="#shop">Shop</a><a href="#categories">Categories</a><a href="#arrivals">New arrivals</a></nav>
        <div className="header-actions">
          <button className="icon-btn" aria-label="Search">⌕</button>
          <button className="icon-btn" aria-label="Shopping cart">⌑ <span className="cart-count">{cartCount}</span></button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-label="Gel blaster hero">
          <div className="grid" />
          <div className="hero-stat"><strong>7–8 MM</strong>Gel ball compatible</div>
          <p className="kicker">Built for the next round</p>
          <h1>Play in <em>full color.</em></h1>
          <p className="hero-copy">Premium toy gel blasters and elevated essentials for the field, the collection, and every unforgettable squad day.</p>
          <div className="cta-row"><a className="button primary" href="#shop">Shop blasters <span>→</span></a><a className="button ghost" href="#categories">Find your style</a></div>
          <div className="blaster" aria-hidden="true"><div className="rail" /><div className="body" /><div className="mag" /><div className="grip" /><div className="accent" /></div>
        </section>

        <div className="trust"><div><b>COD Available</b>Pay your way</div><div><b>Nationwide Delivery</b>Across the Philippines</div><div><b>Curated Selection</b>Play with confidence</div></div>

        <section id="shop"><div className="section-head"><div><p className="eyebrow">Selected for play</p><h2>Featured blasters</h2></div><button className="view-all">View all →</button></div><div className="product-row">{featured.map((product) => <ProductCard key={product.name} product={product} onAdd={add} />)}</div></section>

        <section id="categories"><div className="section-head"><div><p className="eyebrow">Built around your style</p><h2>Choose your kit</h2></div></div><div className="category-grid">
          <a className="category" href="#shop"><h3>Rifles &amp; SMGs</h3><span>12 products →</span></a>
          <a className="category" href="#shop"><h3>Pistols</h3><span>18 products →</span></a>
          <a className="category" href="#shop"><h3>Gel Balls &amp; Mags</h3><span>24 products →</span></a>
          <a className="category" href="#shop"><h3>Parts &amp; Upgrades</h3><span>30 products →</span></a>
        </div></section>

        <section id="arrivals"><div className="section-head"><div><p className="eyebrow">Just landed in Manila</p><h2>Latest arrivals</h2></div><button className="view-all">See new →</button></div><div className="product-row">{arrivals.map((product) => <ProductCard key={product.name} product={product} onAdd={add} />)}</div></section>

        <div className="banner"><p className="eyebrow">Field-ready promotion</p><h2>Build your first loadout.</h2><p>Get 10% off a blaster, gel balls, and eye protection when you build the full set. Designed to play better, together.</p><a className="button primary" href="#shop">Explore bundles</a></div>
      </main>
      <footer><span>© 2026 <b>Hydro Blasters MNL</b></span><span>Manila, Philippines</span></footer>
    </div>
  )
}
