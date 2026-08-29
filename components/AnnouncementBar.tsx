import Link from 'next/link'

export function AnnouncementBar() {
  return (
    <Link
      className="announcement"
      href="/visit-showroom"
      aria-label="Visit our appointment-only showroom in Pasay City."
    >
      <span className="announcement-status" aria-hidden="true" />
      <span className="announcement-content">
        <span className="announcement-desktop">📍 PASAY CITY • SHOWROOM VISITS ARE BY APPOINTMENT ONLY</span>
        <span className="announcement-mobile">📍 PASAY CITY • APPOINTMENT ONLY</span>
      </span>
    </Link>
  )
}
