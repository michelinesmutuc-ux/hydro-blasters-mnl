import { AppointmentForm } from '../../components/AppointmentForm'
import Link from 'next/link'
import { CartLink } from '../../components/CartLink'
import { PrimaryNavigation } from '../../components/PrimaryNavigation'
import { createPageMetadata } from '../../lib/seo'

export const metadata = createPageMetadata({ title: 'Book a Showroom Visit | Hydro Blasters MNL', description: 'Request an appointment to visit the Hydro Blasters MNL showroom and inspect products in person.', path: '/appointments' })

export default function Page(){return <main className="site-shell"><header className="site-header"><Link className="brand" href="/" aria-label="Go to Home"><img className="brand-logo" src="/hydro-blasters-mnl-logo.png" alt="Hydro Blasters MNL"/><span className="brand-home-label" aria-hidden="true">Home</span></Link><PrimaryNavigation /><div className="header-actions"><CartLink/></div></header><section className="section appointment-page"><p className="eyebrow">Showroom appointment</p><h1>Book a Showroom Visit</h1><p className="appointment-subtitle">Reserve a time for personalized assistance.</p><div className="appointment-intro"><h2>Planning to visit?</h2><p>Our showroom is by appointment for customers planning to purchase.</p><p>Still exploring? Our website is the best place to browse our catalogue and compare products.</p><p>Please tell us which products you plan to purchase so we can check availability before confirming your visit.</p></div><AppointmentForm/></section></main>}
