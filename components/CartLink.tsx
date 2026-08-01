'use client'
import Link from 'next/link'
import { useCart } from './CartProvider'
export function CartLink(){const { lines }=useCart();const count=lines.reduce((total,line)=>total+line.quantity,0);return <Link className="icon-button" href="/cart" aria-label={`Cart, ${count} item${count===1?'':'s'}`}>⌑ <span className="cart-count">{count}</span></Link>}
