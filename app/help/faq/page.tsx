import Link from 'next/link'
import { HelpCenterShell } from '../../../components/HelpCenter'
import { JsonLd } from '../../../components/JsonLd'
import { breadcrumbStructuredData } from '../../../lib/seo/structured-data'

const sections = [
  { title: 'Getting started', items: [
    ['What is a gel blaster?', 'A gel blaster is a toy blaster that uses approximately 7–8 mm hydrated gel balls.'],
    ['What ammunition does it use?', 'It uses compatible hydrated gel balls. Prepare and drain them according to the product instructions.'],
    ['Is a gel blaster the same as airsoft?', 'No. Their mechanisms can be similar, but gel blasters generally use hydrated gel balls and operate at lower power.'],
    ['Where should gel blasters be used?', 'Use them only at proper game sites or on private property with permission.'],
    ['How should I transport a gel blaster?', 'Keep it inside a bag or protective case while travelling. Never carry or display it openly in public.'],
    ['What is the difference between toy grade and hobby grade?', 'Toy-grade units are practical for trying the hobby; hobby-grade or upgradeable units suit customers who expect to repair or upgrade later.'],
    ['Which gel blaster is best for a beginner?', 'The best choice fits your budget and how you plan to enjoy the hobby. Check the Upgradeable specification on each product page.'],
  ] },
  { title: 'Parts and performance', items: [
    ['Do metal gears make a gel blaster more powerful?', 'No. Metal gears mainly offer durability; they do not automatically increase power or FPS.'],
    ['What is the difference between FPS and rate of fire?', 'FPS describes projectile speed. Rate of fire describes how quickly the unit cycles.'],
    ['Will an 11.1V battery increase FPS?', 'No. An 11.1V battery can increase rate of fire, not necessarily FPS.'],
    ['Can I use an 11.1V battery in every unit?', 'No. Confirm that your specific unit is compatible before upgrading.'],
    ['How do I know whether a product is upgradeable?', 'Check the Upgradeable specification on the product page, or ask Hydro Blasters MNL for guidance.'],
  ] },
  { title: 'Gel balls and maintenance', items: [
    ['How long should I soak gel balls?', 'Around 4 hours is common, unless the product instructions say otherwise.'],
    ['How should hydrated gel balls be stored?', 'Drain excess water and store them in a clean airtight container to reduce shrinking.'],
    ['Why should I empty the magazine after use?', 'Gels left inside can shrink or deform and may contribute to feeding or jamming problems.'],
    ['Why should I avoid dry firing?', 'Repeated dry firing can contribute to unnecessary wear, air-seal issues, or poor compression depending on the unit.'],
    ['Why is my magazine misfeeding or jamming?', 'Check that the gels are properly hydrated, correctly sized, drained, and not left in the magazine after use.'],
    ['Should I disconnect the battery after use?', 'Yes. Disconnect the battery from the unit when it is not in use.'],
    ['How long does charging take?', 'Charging commonly takes around 2–4 hours, depending on the battery and charger. Follow the supplied instructions.'],
  ] },
  { title: 'Orders and shipping', items: [
    ['Do you ship nationwide?', 'Yes. See the Shipping Policy for the current nationwide flat rates.'],
    ['How much is shipping?', 'Shipping is automatically calculated from the size and quantity of the items in your order. The current tiers are Compact ₱99, Medium ₱179, and Bulky ₱249.'],
    ['How does Cash on Delivery work?', 'Nationwide shipping and the 1% COD service fee are due now. The merchandise amount is paid to the courier upon delivery.'],
    ['Why do I need to upload proof of payment?', 'It helps Hydro Blasters MNL verify required prepaid amounts before processing the order.'],
    ['How long does payment verification take?', 'Payment verification may take up to 24 hours.'],
  ] },
  { title: 'Showroom', items: [
    ['Can I walk in?', 'Walk-ins are discouraged. The showroom may not always be open or staffed, and unconfirmed visits may not be accommodated.'],
    ['Why is the showroom appointment-only?', 'Appointments help the team prepare dedicated assistance and check requested product availability in advance.'],
    ['Is an appointment automatically confirmed?', 'No. Submit a request, then wait for direct confirmation before travelling.'],
    ['Why do I need to identify the products I plan to purchase?', 'It lets Hydro Blasters MNL check availability and prepare them before the visit whenever possible.'],
  ] },
  { title: 'Warranty and repairs', items: [
    ['How long is the limited warranty?', 'The limited warranty is valid for 30 days from the date of purchase.'],
    ['What does the warranty cover?', 'Eligible manufacturing defects in gel blaster products supplied by Hydro Blasters MNL.'],
    ['Do modifications void the warranty?', 'Any modification, internal upgrade, unauthorized repair, or alteration may void the warranty.'],
    ['How do I submit a warranty claim?', 'Contact the official Facebook account, provide order details and a clear video of the issue, then follow the assessment instructions.'],
    ['Who pays the cost of sending the unit for inspection?', 'The customer is responsible for shipping the item to the designated service location.'],
    ['Can Hydro Blasters MNL assist with repairs and upgrades?', 'You may contact Hydro Blasters MNL for guidance on the current partner technician and available service arrangements.'],
    ['Do you sell repair and upgrade parts?', 'At the moment, we only carry selected spare magazines and a small collection of attachments. We hope to offer more repair and upgrade parts in the future. Please continue checking our website, as new parts will be added to the catalogue once they become available.'],
  ] },
] as const

export default function FaqPage() {
  return <HelpCenterShell current="/help/faq"><JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Help Center', path: '/help/faq' }, { name: 'Frequently Asked Questions', path: '/help/faq' }])} /><p className="eyebrow">Help Center</p><h1>Frequently Asked Questions</h1><p className="help-intro">Quick answers for choosing, using, maintaining, ordering, and enjoying gel blasters responsibly.</p>
    {sections.map((section) => <section className="faq-section" key={section.title}><h2>{section.title}</h2>{section.items.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>)}
    <section><h2>Read the full policies</h2><p><Link href="/help/getting-started">Getting Started</Link> · <Link href="/policies/warranty">Warranty Policy</Link> · <Link href="/policies/shipping">Shipping Policy</Link> · <Link href="/policies/appointments">Appointment Policy</Link></p></section>
  </HelpCenterShell>
}
import { createPageMetadata } from '../../../lib/seo'

export const metadata = createPageMetadata({ title: 'Frequently Asked Questions | Hydro Blasters MNL', description: 'Answers to common questions about gel blasters, orders, showroom visits, warranty, and care.', path: '/help/faq' })
