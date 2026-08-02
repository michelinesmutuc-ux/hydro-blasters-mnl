'use client'
import { useState } from 'react'
import { useCart, type CartProduct } from './CartProvider'
export function AddToCartButton({ product }: { product: CartProduct }) {
  const { add } = useCart(); const [message, setMessage] = useState('')
  const missing = !product.id || !product.name || !Number.isFinite(Number(product.price))
  const reason = missing ? 'Product information unavailable' : product.stock < 1 ? 'Out of stock' : ''
  function handleClick() { console.log('Add to cart clicked', { productId: product.id, name: product.name, stock: product.stock }); add(product); window.dispatchEvent(new Event('hydro-cart-added')); setMessage('Added to cart'); window.setTimeout(() => setMessage(''), 1800) }
  return <div className="add-to-cart-control"><button type="button" className="primary-button" disabled={Boolean(reason)} onClick={handleClick}>{reason || 'Add to cart'}</button>{reason && <span role="status">{reason}</span>}{message && <span role="status">{message}</span>}</div>
}
