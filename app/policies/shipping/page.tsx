import Link from 'next/link'
import { HelpCenterShell, HelpTip } from '../../../components/HelpCenter'
import { JsonLd } from '../../../components/JsonLd'
import { breadcrumbStructuredData } from '../../../lib/seo/structured-data'

export default function ShippingPolicyPage() {
  return <HelpCenterShell current="/policies/shipping"><JsonLd data={breadcrumbStructuredData([{ name: 'Home', path: '/' }, { name: 'Shipping Policy', path: '/policies/shipping' }])} /><p className="eyebrow">Store Policy</p><h1>Shipping Policy</h1>
    <HelpTip><h2>Nationwide Shipping Rates</h2><p>Shipping is automatically calculated based on the size and quantity of the items in your order.</p><p><strong>Compact:</strong> ₱99</p><p><strong>Medium:</strong> ₱179</p><p><strong>Bulky:</strong> ₱249</p></HelpTip>
    <section><h2>Order processing</h2><ul><li>Orders are processed after the required payment or COD charges due now have been submitted and verified.</li><li>Payment verification may take up to 24 hours.</li><li>Customers may follow up through the official Facebook account: Hydro Blasters MNL.</li><li>Processing time is separate from courier delivery time.</li></ul></section>
    <section><h2>Delivery times</h2><p>Delivery times depend on the destination, courier, weather, holidays, and other circumstances outside Hydro Blasters MNL’s control.</p></section>
    <section><h2>Address responsibility</h2><p>Customers must provide a complete and accurate address, including:</p><ul><li>House or unit number</li><li>Street</li><li>Barangay</li><li>City or municipality</li><li>Region</li><li>Postal code</li><li>Active mobile number</li></ul><p>Incorrect or incomplete information may delay delivery or result in additional charges.</p></section>
    <section><h2>Courier handling</h2><p>Once a parcel has been handed to the courier, delays caused by courier operations, weather, peak seasons, or inaccessible delivery locations may be outside the store’s direct control. Hydro Blasters MNL will provide reasonable assistance when follow-up is needed.</p></section>
    <section><h2>Cash on Delivery</h2><p>For COD orders:</p><ul><li>Nationwide shipping and the 1% COD service fee are due now.</li><li>The merchandise amount is paid to the courier upon delivery.</li><li>COD orders are processed only after the amount due now is verified.</li></ul><p><Link href="/checkout">Continue to checkout</Link> or <Link href="/help/faq">read the FAQ</Link>.</p></section>
  </HelpCenterShell>
}
import { createPageMetadata } from '../../../lib/seo'

export const metadata = createPageMetadata({ title: 'Shipping Policy | Hydro Blasters MNL', description: 'Read delivery and shipping information for Hydro Blasters MNL orders.', path: '/policies/shipping' })
