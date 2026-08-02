import Link from 'next/link'

export function SiteFooter() {
  return <footer>
    <div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div>
    <div className="footer-links">
      <div><h3>Shop</h3><Link href="/shop">Shop Products</Link><Link href="/compare">Compare Products</Link><Link href="/appointments">Book a Showroom Visit</Link></div>
      <div><h3>Help Center</h3><Link href="/help/getting-started">Getting Started</Link><Link href="/help/faq">FAQ</Link><Link href="/policies/warranty">Warranty Policy</Link><Link href="/policies/shipping">Shipping Policy</Link><Link href="/policies/appointments">Appointment Policy</Link></div>
      <div><h3>Contact</h3><p>Facebook: Hydro Blasters MNL</p><Link href="/appointments">Book a Showroom Visit</Link><Link href="/about">About Us</Link></div>
    </div>
  </footer>
}
