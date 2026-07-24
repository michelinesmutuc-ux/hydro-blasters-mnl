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
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'blue' },
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'purple' },
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'pink' },
]

const arrivals: Product[] = [
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'blue' },
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'purple' },
  { name: 'Product name', details: 'Product details', price: 'Price', tag: 'Coming soon', tone: 'pink' },
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
      <div className="notice"><i /> Store information coming soon</div>
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
          <div className="hero-stat"><strong>COMING SOON</strong>Product details</div>
          <p className="kicker">Built for the next round</p>
          <h1>Play in <em>full color.</em></h1>
          <p className="hero-copy">Explore the collection. Product information and availability will be announced soon.</p>
          <div className="cta-row"><a className="button primary" href="#shop">View collection <span>→</span></a><a className="button ghost" href="#categories">Find your style</a></div>
          <div className="blaster" aria-hidden="true"><div className="rail" /><div className="body" /><div className="mag" /><div className="grip" /><div className="accent" /></div>
        </section>

        <div className="trust"><div><b>Store information</b>Coming soon</div><div><b>Availability</b>Coming soon</div><div><b>Product details</b>Coming soon</div></div>

        <section id="shop"><div className="section-head"><div><p className="eyebrow">Coming soon</p><h2>Featured products</h2></div><button className="view-all">View collection →</button></div><div className="product-row">{featured.map((product, index) => <ProductCard key={`${product.tone}-${index}`} product={product} onAdd={add} />)}</div></section>

        <section id="categories"><div className="section-head"><div><p className="eyebrow">Built around your style</p><h2>Choose your kit</h2></div></div><div className="category-grid">
          <a className="category" href="#shop"><h3>Category name</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category name</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category name</h3><span>Coming soon →</span></a>
          <a className="category" href="#shop"><h3>Category name</h3><span>Coming soon →</span></a>
        </div></section>

        <section id="arrivals"><div className="section-head"><div><p className="eyebrow">Coming soon</p><h2>Latest arrivals</h2></div><button className="view-all">See new →</button></div><div className="product-row">{arrivals.map((product, index) => <ProductCard key={`${product.tone}-${index}`} product={product} onAdd={add} />)}</div></section>

        <div className="banner"><p className="eyebrow">Coming soon</p><h2>More to discover.</h2><p>Promotions and product information will be announced here.</p><a className="button primary" href="#shop">Explore collection</a></div>
      </main>
      <footer><span>© 2026 <b>Hydro Blasters MNL</b></span><span>Details coming soon</span></footer>
    </div>
  )
}
