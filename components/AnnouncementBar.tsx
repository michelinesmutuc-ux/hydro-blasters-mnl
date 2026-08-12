'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchLaunchPromoStatus } from '../lib/promotions/launch-promo'

export function AnnouncementBar() {
  const [launchPromoActive, setLaunchPromoActive] = useState(false)
  useEffect(() => { void fetchLaunchPromoStatus().then((status) => setLaunchPromoActive(Boolean(status?.active))) }, [])
  const desktopMessage = launchPromoActive
    ? '🎉 LAUNCH PROMO: FIRST 5 WEBSITE ORDERS GET 10% OFF — UP TO ₱1,500 · CLEARANCE ITEMS EXCLUDED'
    : '📍 PASAY CITY • SHOWROOM VISITS ARE BY APPOINTMENT ONLY'
  const mobileMessage = launchPromoActive
    ? '🎉 10% OFF · FIRST 5 ORDERS · ₱1,500 MAX'
    : '📍 PASAY CITY • APPOINTMENT ONLY'
  return (
    <Link
      className="announcement"
      href={launchPromoActive ? '/shop' : '/visit-showroom'}
      aria-label={launchPromoActive ? 'View the current Launch Promo details in the shop.' : 'Visit our appointment-only showroom in Pasay City.'}
    >
      <span className="announcement-status" aria-hidden="true" />
      <span className="announcement-content">
        <span className="announcement-desktop">{desktopMessage}</span>
        <span className="announcement-mobile">{mobileMessage}</span>
      </span>
    </Link>
  )
}
