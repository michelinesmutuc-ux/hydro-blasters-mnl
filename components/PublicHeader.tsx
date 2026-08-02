import Link from 'next/link'
import { CartLink } from './CartLink'
import { PrimaryNavigation } from './PrimaryNavigation'

export function PublicHeader() {
  return <><div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div><header className="site-header"><Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link><PrimaryNavigation /><div className="header-actions"><CartLink /></div></header></>
}
