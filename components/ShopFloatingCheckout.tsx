'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from './CartProvider'
import { useComparison } from './ComparisonProvider'

const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

export function ShopFloatingCheckout() {
  const { lines, subtotal } = useCart()
  const { products: comparisonProducts } = useComparison()
  const [dismissed, setDismissed] = useState(false)
  const itemCount = lines.reduce((total, line) => total + line.quantity, 0)

  useEffect(() => {
    const reveal = () => setDismissed(false)
    window.addEventListener('hydro-cart-added', reveal)
    return () => window.removeEventListener('hydro-cart-added', reveal)
  }, [])

  useEffect(() => {
    if (lines.length === 0) setDismissed(false)
  }, [lines.length])

  if (lines.length === 0 || dismissed) return null

  return (
    <aside className={`shop-floating-checkout${comparisonProducts.length ? ' shop-floating-checkout-with-comparison' : ''}`} aria-label="Cart checkout shortcut" aria-live="polite">
      <span>🛒 {itemCount} {itemCount === 1 ? 'Item' : 'Items'} <i>•</i> {peso(subtotal)}</span>
      <div>
        <Link href="/checkout">Proceed to Checkout →</Link>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss checkout shortcut">Dismiss</button>
      </div>
    </aside>
  )
}
