'use client'
import { useCart, type CartProduct } from './CartProvider'
export function AddToCartButton({ product }: { product: CartProduct }) { const { add } = useCart(); return <button type="button" className="primary-button" disabled={product.stock < 1} onClick={() => add(product)}>{product.stock < 1 ? 'Out of stock' : 'Add to cart'}</button> }
