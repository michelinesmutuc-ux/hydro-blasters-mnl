import Link from 'next/link'
import { CartLink } from './CartLink'

export function PublicHeader() {
  return <><div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div><header className="site-header"><Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link><nav aria-label="Primary navigation"><Link href="/">Home</Link><Link href="/shop">Shop</Link><Link href="/compare">Compare</Link><Link href="/about">About</Link><Link href="/visit-showroom">Visit Showroom</Link><Link href="/appointments">Book a Visit</Link><Link href="/track-order">Track Order</Link></nav><div className="header-actions"><Link className="mobile-shop-link" href="/shop">Shop</Link><Link className="mobile-about-link" href="/compare">Compare</Link><Link className="mobile-about-link" href="/about">About</Link><Link className="mobile-visit-link" href="/visit-showroom">Visit</Link><Link className="mobile-about-link" href="/track-order">Track Order</Link><CartLink /></div></header></>
}
