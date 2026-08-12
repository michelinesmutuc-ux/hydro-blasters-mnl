'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type CartProduct = { id: string; product_id?: string; name: string; slug: string; category?: string; price: number | string; stock: number; shipping_class?: 'Compact' | 'Standard' | 'Bulky'; is_clearance?: boolean; image_urls?: string[]; variant_id?: string; variant_group_name?: string | null; variant_name?: string | null }
export type CartLine = CartProduct & { quantity: number }
type Cart = { lines: CartLine[]; add: (product: CartProduct, quantity?: number) => void; setQuantity: (id: string, quantity: number) => void; remove: (id: string) => void; clear: () => void; subtotal: number }
const CartContext = createContext<Cart | null>(null)
const storageKey = 'hydro-blasters-cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => { try { setLines(JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')) } catch {} finally { setReady(true) } }, [])
  useEffect(() => { if (ready) window.localStorage.setItem(storageKey, JSON.stringify(lines)) }, [lines, ready])
  const value = useMemo<Cart>(() => ({
    lines,
    add: (product, quantity = 1) => setLines((current) => { const requestedQuantity = Math.max(1, Math.floor(quantity)); const existing = current.find((line) => line.id === product.id); if (existing) return current.map((line) => line.id === product.id ? { ...line, quantity: Math.min(line.quantity + requestedQuantity, product.stock) } : line); return product.stock > 0 ? [...current, { ...product, quantity: Math.min(requestedQuantity, product.stock) }] : current }),
    setQuantity: (id, quantity) => setLines((current) => current.map((line) => line.id === id ? { ...line, quantity: Math.max(1, Math.min(quantity, line.stock)) } : line)),
    remove: (id) => setLines((current) => current.filter((line) => line.id !== id)), clear: () => setLines([]),
    subtotal: lines.reduce((total, line) => total + Number(line.price) * line.quantity, 0),
  }), [lines])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart() { const cart = useContext(CartContext); if (!cart) throw new Error('CartProvider is missing.'); return cart }
