import Link from 'next/link'
import { CartLink } from './CartLink'
import { PrimaryNavigation } from './PrimaryNavigation'

export function CartPageHeader(){return <header className="site-header"><Link className="brand" href="/" aria-label="Hydro Blasters MNL home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL"/><span className="brand-home-label" aria-hidden="true">Home</span></Link><PrimaryNavigation ariaLabel="Cart navigation" /><div className="header-actions"><CartLink/></div></header>}
