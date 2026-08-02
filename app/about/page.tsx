import Link from 'next/link'
import { CartLink } from '../../components/CartLink'
import { SiteFooter } from '../../components/SiteFooter'

const milestones = [
  ['March 2021', 'Hydro Blasters MNL was established.'],
  ['November 2022', 'Our appointment-based showroom was opened.'],
  ['2026', 'The official Hydro Blasters MNL website was launched.'],
  ['Today', 'Still growing alongside the Philippine gel blaster community.'],
]

export default function AboutPage() {
  return <div className="site-shell">
    <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link>
      <nav aria-label="Primary navigation"><Link href="/">Home</Link><Link href="/shop">Shop</Link><Link href="/about">About</Link><Link href="/appointments">Book a Visit</Link></nav>
      <div className="header-actions"><Link className="mobile-shop-link" href="/shop">Shop</Link><Link className="mobile-about-link" href="/about">About</Link><CartLink /></div>
    </header>
    <main>
      <section className="section about-page">
        <header className="about-hero"><p className="eyebrow">Our story</p><h1>About Hydro Blasters MNL</h1><p>Established in March 2021.</p><p>Hydro Blasters MNL began as a passion project during the early growth of the Philippine gel blaster hobby.</p><p>Since then, we&apos;ve continued to grow with one goal: helping both new and experienced players enjoy the hobby with the right equipment and reliable information.</p></header>
        <section className="about-story"><h2>Our Story</h2><p>Established in March 2021, Hydro Blasters MNL started as a passion project and grew into an online store for people exploring the gel blaster hobby.</p><p>We later expanded with an appointment-based showroom. The website was built to make it easier for customers to browse, compare products, and learn before purchasing.</p></section>
        <section className="about-journey" aria-labelledby="journey-heading"><h2 id="journey-heading">Our Journey</h2><ol>{milestones.map(([date, description]) => <li key={date}><time>{date}</time><p>{description}</p></li>)}</ol></section>
        <section className="about-philosophy"><p className="eyebrow">Our Philosophy</p><h2>Our Philosophy</h2><blockquote>“We believe the best gel blaster isn&apos;t the most expensive one—it&apos;s the one that matches your budget and how you plan to enjoy the hobby.”</blockquote><p>That philosophy guides how we recommend products, build our Help Center, and design our website. We want customers to make informed decisions—not simply buy the most expensive option.</p></section>
        <section className="about-actions" aria-label="Next steps"><article><h2>Ready to browse?</h2><p>Browse Products</p><Link className="primary-button" href="/shop">Shop Now</Link></article><article><h2>Want to visit us?</h2><p>Visit our appointment-based showroom.</p><Link className="secondary-button" href="/appointments">Visit Our Showroom</Link></article></section>
      </section>
    </main>
    <SiteFooter />
  </div>
}
