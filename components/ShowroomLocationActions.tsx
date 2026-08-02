'use client'

import { useState } from 'react'

const address = 'Hydro Blasters MNL, FB Harrison, Pasay City'

export function ShowroomLocationActions() {
  const [copyMessage, setCopyMessage] = useState('Copy Address')

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address)
      setCopyMessage('Address Copied')
      window.setTimeout(() => setCopyMessage('Copy Address'), 2200)
    } catch {
      setCopyMessage('Copy unavailable')
    }
  }

  return <div className="showroom-location-actions"><a className="primary-button" href="https://share.google/PpkRkOnaYAk5PHIrg" target="_blank" rel="noreferrer">Open in Google Maps</a><button type="button" className="secondary-button" onClick={copyAddress}>{copyMessage}</button><a className="secondary-button" href="/appointments">Book Appointment</a></div>
}
