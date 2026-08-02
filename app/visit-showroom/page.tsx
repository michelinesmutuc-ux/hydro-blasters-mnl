import Link from 'next/link'
import { CartLink } from '../../components/CartLink'
import { ShowroomLocationActions } from '../../components/ShowroomLocationActions'
import { SiteFooter } from '../../components/SiteFooter'
import { JsonLd } from '../../components/JsonLd'
import { breadcrumbStructuredData, localBusinessStructuredData } from '../../lib/seo/structured-data'
import { PrimaryNavigation } from '../../components/PrimaryNavigation'

export default function VisitShowroomPage() {
  return <div className="site-shell">
    <JsonLd data={localBusinessStructuredData()} />
    <JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Visit Our Showroom', path: '/visit-showroom' }])} />
    <div className="announcement"><span aria-hidden="true" />STORE INFORMATION COMING SOON</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL" /><span className="brand-home-label" aria-hidden="true">Home</span></Link>
      <PrimaryNavigation />
      <div className="header-actions"><CartLink /></div>
    </header>
    <main><section className="section showroom-page">
      <header className="showroom-hero"><img src="/showroom/entrance.JPG" alt="Hydro Blasters MNL showroom entrance and sign" /><div><p className="eyebrow">Showroom</p><h1>Visit Our Showroom</h1><p>Our appointment-based showroom is located in FB Harrison, Pasay City.</p><span>Look for the Hydro Blasters MNL sign at our entrance.</span></div></header>
      <section className="showroom-location" aria-labelledby="location-heading"><div><p className="eyebrow">Location</p><h2 id="location-heading">Find us in Pasay City</h2><p>Use the map for directions, or open the saved Hydro Blasters MNL location in Google Maps.</p><ShowroomLocationActions /></div><iframe title="Hydro Blasters MNL location map" src="https://www.google.com/maps?q=Hydro%20Blasters%20MNL%2C%20FB%20Harrison%2C%20Pasay%20City&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></section>
      <section className="showroom-info"><div className="section-heading"><p className="eyebrow">Before you go</p><h2>Good to Know</h2></div><div className="showroom-info-grid">
        <article><h3>By Appointment</h3><p>Our showroom is open by confirmed appointment. We confirm product availability before your visit so you don&apos;t make an unnecessary trip.</p></article>
        <article><h3>Parking</h3><p>Parking is available on site. Please note that the private access road is a little narrow, but passenger cars can enter safely one at a time.</p></article>
        <article><h3>Display Units</h3><p>You are welcome to inspect and hold our display units before making your purchase. To preserve their brand-new condition, test firing of display units is not available. Every purchased unit is individually tested before it is released to its new owner.</p></article>
        <article><h3>Handle With Care</h3><p>Please handle all display units carefully. Any display unit accidentally dropped or damaged while being handled will be considered sold, even if no visible damage is immediately apparent.</p></article>
      </div></section>
      <section className="showroom-interior"><img src="/showroom/interior.png" alt="Selected Hydro Blasters MNL display units inside the showroom" /><p>Browse selected display units in person before making your purchase.</p></section>
      <section className="showroom-reminder"><div><p className="eyebrow">Appointment reminder</p><h2>Ready to Visit?</h2><p>Book your showroom visit in advance so we can prepare your items and confirm availability before you arrive.</p></div><div><Link className="primary-button" href="/appointments">Book Appointment</Link><Link className="secondary-button" href="/shop">Browse Products</Link></div></section>
    </section></main>
    <SiteFooter />
  </div>
}
import { createPageMetadata } from '../../lib/seo'

export const metadata = createPageMetadata({ title: 'Visit Our Showroom | Hydro Blasters MNL', description: 'Plan an appointment-based visit to the Hydro Blasters MNL showroom in Pasay City.', path: '/visit-showroom' })
