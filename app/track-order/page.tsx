import { TrackOrder } from '../../components/TrackOrder'
import { PublicHeader } from '../../components/PublicHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { Suspense } from 'react'

export default function TrackOrderPage() { return <div className="site-shell"><PublicHeader /><main><Suspense fallback={<div className="section catalogue-state">Loading order tracking…</div>}><TrackOrder /></Suspense></main><SiteFooter /></div> }
