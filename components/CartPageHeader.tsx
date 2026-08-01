import Link from 'next/link'
import { CartLink } from './CartLink'
export function CartPageHeader(){return <header className="site-header cart-page-header"><Link className="brand" href="/" aria-label="Hydro Blasters MNL home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL"/></Link><nav aria-label="Cart navigation"><Link href="/">Home</Link><Link href="/shop">Shop</Link><Link href="/appointments">Schedule a Visit</Link></nav><div className="header-actions"><CartLink/></div></header>}
