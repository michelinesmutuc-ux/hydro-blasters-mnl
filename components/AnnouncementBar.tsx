import Link from 'next/link'

export function AnnouncementBar() {
  return (
    <Link
      className="announcement"
      href="/visit-showroom"
      aria-label="Visit our appointment-only showroom in Pasay City."
    >
      <span aria-hidden="true" />
      <span>📍 PASAY CITY • SHOWROOM VISITS ARE BY APPOINTMENT ONLY</span>
    </Link>
  )
}
