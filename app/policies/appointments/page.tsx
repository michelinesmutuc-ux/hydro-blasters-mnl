import Link from 'next/link'
import { HelpCenterShell, HelpTip } from '../../../components/HelpCenter'

export default function AppointmentPolicyPage() {
  return <HelpCenterShell current="/policies/appointments"><p className="eyebrow">Store Policy</p><h1>Showroom Appointment Policy</h1><HelpTip><h2>Our showroom is by appointment for customers planning to purchase.</h2></HelpTip>
    <section><h2>Browsing</h2><p>Still exploring? Our website is the best place to browse the catalogue and compare products.</p></section>
    <section><h2>Booking</h2><p>Customers must submit an appointment request and identify the products they plan to purchase. Hydro Blasters MNL checks product availability before confirming the visit.</p></section>
    <section><h2>Confirmation</h2><p>Submitting a request does not mean the appointment is automatically confirmed. Customers should wait for direct confirmation before travelling to the showroom.</p></section>
    <section><h2>Walk-ins</h2><p>Walk-ins are discouraged because the showroom does not operate like a regular retail store and may not always be open or staffed. Unconfirmed visits may not be accommodated.</p></section>
    <section><h2>Availability</h2><p>If a requested product is unavailable, Hydro Blasters MNL may contact the customer before confirming the appointment to avoid an unnecessary trip.</p></section>
    <section><h2>Arrival and changes</h2><p>Customers should contact Hydro Blasters MNL if they need to cancel, reschedule, or expect to arrive late.</p><p><Link href="/appointments">Book a Showroom Visit</Link> · <Link href="/shop">Shop Products</Link> · <Link href="/compare">Compare Products</Link></p></section>
  </HelpCenterShell>
}
import { createPageMetadata } from '../../../lib/seo'

export const metadata = createPageMetadata({ title: 'Showroom Appointment Policy | Hydro Blasters MNL', description: 'Read the appointment guidance for visiting the Hydro Blasters MNL showroom.', path: '/policies/appointments' })
