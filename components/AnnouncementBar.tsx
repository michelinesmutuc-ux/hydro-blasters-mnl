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
        <span className="announcement-location">📍 PASAY CITY</span>
        <span className="announcement-separator" aria-hidden="true">•</span>
        <span className="announcement-appointment">SHOWROOM VISITS ARE BY APPOINTMENT ONLY</span>
      </span>
    </Link>
  )
}
