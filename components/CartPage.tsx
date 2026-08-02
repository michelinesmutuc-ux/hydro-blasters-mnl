'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useCart } from './CartProvider'
import { useComparison } from './ComparisonProvider'

const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

export function CartPage() {
  const { lines, subtotal, setQuantity, remove, clear } = useCart()
  const { products: comparisonProducts } = useComparison()
  const checkoutButtonRef = useRef<HTMLAnchorElement | null>(null)
  const [isOriginalCheckoutVisible, setIsOriginalCheckoutVisible] = useState(true)
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)
  useEffect(() => {
    const checkoutButton = checkoutButtonRef.current
    if (!checkoutButton) return
    const observer = new IntersectionObserver(([entry]) => setIsOriginalCheckoutVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(checkoutButton)
    return () => observer.disconnect()
  }, [])
  if (!lines.length) return <section className="section cart-page"><div className="cart-empty"><p className="eyebrow">Guest cart</p><h1>Your cart is empty.</h1><p>Browse the catalogue and add something to your arsenal.</p><Link className="primary-button" href="/shop">Shop Products</Link></div></section>
  return <section className="section cart-page"><header className="cart-heading"><p className="eyebrow">Guest cart</p><h1>Your Cart</h1><p>Review your items before proceeding to checkout.</p></header><div className="cart-layout"><div className="cart-items"><div className="cart-items-header"><h2>Cart items</h2><button type="button" className="cart-text-action" onClick={() => { if (window.confirm('Remove every item from your cart?')) clear() }}>Clear Cart</button></div>{lines.map((line) => <article className="cart-item" key={line.id}><div className="cart-thumb">{line.image_urls?.[0] ? <img src={line.image_urls[0]} alt={line.name} /> : <span>Photo unavailable</span>}</div><div className="cart-item-copy"><p className="eyebrow">{line.category || 'Product'}</p><h2>{line.name}</h2><p className="cart-unit-price">{peso(Number(line.price))}</p></div><div className="cart-quantity"><span>Quantity</span><div><button type="button" aria-label={`Decrease ${line.name} quantity`} disabled={line.quantity <= 1} onClick={() => setQuantity(line.id, line.quantity - 1)}>−</button><output aria-label={`${line.name} quantity`}>{line.quantity}</output><button type="button" aria-label={`Increase ${line.name} quantity`} disabled={line.quantity >= line.stock} onClick={() => setQuantity(line.id, line.quantity + 1)}>+</button></div></div><div className="cart-line-total"><span>Line total</span><strong>{peso(Number(line.price) * line.quantity)}</strong></div><button type="button" className="cart-remove" onClick={() => remove(line.id)}>Remove</button></article>)}</div><aside className="cart-summary"><h2>Order Summary</h2><dl><div><dt>Subtotal ({itemCount} items)</dt><dd>{peso(subtotal)}</dd></div><div><dt>Shipping</dt><dd>Calculated at checkout</dd></div><div className="cart-estimated"><dt>Estimated total</dt><dd>{peso(subtotal)}</dd></div></dl><Link ref={checkoutButtonRef} className="secondary-button" href="/checkout">Proceed to Checkout</Link><Link className="cart-continue" href="/shop">Continue Shopping</Link></aside></div>{!isOriginalCheckoutVisible && <aside className={`cart-floating-checkout${comparisonProducts.length ? ' cart-floating-checkout-with-comparison' : ''}`} aria-live="polite"><span>🛒 {itemCount} {itemCount === 1 ? 'Item' : 'Items'} <i>•</i> {peso(subtotal)}</span><Link href="/checkout">Proceed to Checkout →</Link></aside>}</section>
}
