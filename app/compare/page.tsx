import Link from 'next/link'
import { CartLink } from '../../components/CartLink'
import { CompareProducts } from '../../components/CompareProducts'
import { PrimaryNavigation } from '../../components/PrimaryNavigation'

export default function ComparePage() {
  return <div className="site-shell"><header className="site-header"><Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link><PrimaryNavigation /><div className="header-actions"><CartLink /></div></header><main><section className="section compare-page"><div className="section-heading"><p className="eyebrow">Product comparison</p><h1>Compare Products</h1><p className="compare-intro">Review product details and specifications side by side.</p></div><CompareProducts /></section></main></div>
}
