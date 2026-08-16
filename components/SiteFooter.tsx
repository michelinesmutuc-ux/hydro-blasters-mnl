import Link from 'next/link'

export function SiteFooter() {
  return <footer>
    <div className="footer-brand"><img src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span>Hydro Blasters MNL</span></div>
    <div className="footer-links">
      <div><h3>Shop</h3><Link href="/shop">Shop Products</Link><Link href="/compare">Compare Products</Link><Link href="/track-order">Track Order</Link><Link href="/visit-showroom">Visit Our Showroom</Link><Link href="/appointments">Book a Showroom Visit</Link></div>
      <div><h3>Help Center</h3><Link href="/help/getting-started">Getting Started</Link><Link href="/help/faq">FAQ</Link><Link href="/policies/warranty">Warranty Policy</Link><Link href="/policies/shipping">Shipping Policy</Link><Link href="/policies/appointments">Appointment Policy</Link></div>
      <div><h3>Contact</h3><a href="https://www.facebook.com/profile.php?id=61593333625093" target="_blank" rel="noreferrer">For messages &amp; updates: Blasters Studio</a><a href="https://www.facebook.com/share/1CyVDQDvcF/?mibextid=wwXIfr" target="_blank" rel="noreferrer">Also on Facebook: Hydro Blasters MNL</a><Link href="/appointments">Book a Showroom Visit</Link><Link href="/about">About Us</Link></div>
    </div>
  </footer>
}
