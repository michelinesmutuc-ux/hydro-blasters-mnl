import Link from 'next/link'
import { CartLink } from './CartLink'
import { PrimaryNavigation } from './PrimaryNavigation'
import { AnnouncementBar } from './AnnouncementBar'

export function PublicHeader() {
  return <><AnnouncementBar /><header className="site-header"><Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link><PrimaryNavigation /><div className="header-actions"><CartLink /></div></header></>
}
