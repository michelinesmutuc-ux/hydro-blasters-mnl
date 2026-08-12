'use client'
import Link from 'next/link'
import { useCart } from './CartProvider'
export function CartLink(){const { lines }=useCart();const count=lines.reduce((total,line)=>total+line.quantity,0);return <Link className="icon-button cart-link" href="/cart" aria-label={`Shopping cart${count ? `, ${count} item${count===1?'':'s'}` : ''}`}><svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 1.9-1.4L21 8H7"/><circle cx="10" cy="20" r="1.25"/><circle cx="18" cy="20" r="1.25"/></svg>{count > 0 && <span className="cart-count" aria-hidden="true">{count}</span>}</Link>}
