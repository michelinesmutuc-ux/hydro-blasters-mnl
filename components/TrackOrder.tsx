'use client'

import { useEffect, useState } from 'react'

export function TrackOrder() {
  const [reference, setReference] = useState('')
  useEffect(() => setReference(new URLSearchParams(window.location.search).get('order') || ''), [])
  return <section className="section order-confirmation"><p className="eyebrow">Order tracking</p><h1>Track Your Order</h1><p>Keep your order number ready when contacting Hydro Blasters MNL for an update.</p>{reference && <p>Your order number: <strong className="order-reference">{reference}</strong></p>}<p>Online order-status lookup is not available yet. Please use your saved receipt when requesting assistance.</p></section>
}
