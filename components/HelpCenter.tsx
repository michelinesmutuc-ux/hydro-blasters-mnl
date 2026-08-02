import Link from 'next/link'
import { CartLink } from './CartLink'
import { SiteFooter } from './SiteFooter'

type Article = { href: string; label: string }

const articles: Article[] = [
  { href: '/help/getting-started', label: 'Getting Started' },
  { href: '/help/faq', label: 'FAQ' },
  { href: '/policies/warranty', label: 'Warranty Policy' },
  { href: '/policies/shipping', label: 'Shipping Policy' },
  { href: '/policies/appointments', label: 'Appointment Policy' },
]

export function HelpCenterShell({ children, current }: { children: React.ReactNode; current: string }) {
  return <div className="site-shell">
    <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link>
      <nav aria-label="Primary navigation"><Link href="/">Home</Link><Link href="/shop">Shop</Link><Link href="/about">About</Link><Link href="/visit-showroom">Visit Showroom</Link><Link href="/appointments">Book a Visit</Link><Link href="/track-order">Track Order</Link></nav>
      <div className="header-actions"><Link className="mobile-shop-link" href="/shop">Shop</Link><Link className="mobile-about-link" href="/about">About</Link><Link className="mobile-visit-link" href="/visit-showroom">Visit</Link><Link className="mobile-track-link" href="/track-order">Track Order</Link><CartLink /></div>
    </header>
    <main><article className="section help-page">{children}<RelatedArticles current={current} /></article></main>
    <SiteFooter />
  </div>
}

export function RelatedArticles({ current }: { current: string }) {
  return <section className="related-articles" aria-labelledby="related-articles-title"><h2 id="related-articles-title">Related Articles</h2><div>{articles.filter((article) => article.href !== current).map((article) => <Link href={article.href} key={article.href}>{article.label} <span aria-hidden="true">→</span></Link>)}</div></section>
}

export function HelpTip({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return <aside className={warning ? 'help-callout help-warning' : 'help-callout'}>{children}</aside>
}
