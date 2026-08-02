import Link from 'next/link'
import { SiteFooter } from './SiteFooter'
import { PublicHeader } from './PublicHeader'

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
    <PublicHeader />
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
