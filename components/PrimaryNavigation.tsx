'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/about', label: 'About' },
  { href: '/visit-showroom', label: 'Visit' },
  { href: '/track-order', label: 'Track Order' },
]

export function PrimaryNavigation({ ariaLabel = 'Primary navigation' }: { ariaLabel?: string }) {
  const pathname = usePathname()
  return <nav className="primary-navigation" aria-label={ariaLabel}><div className="primary-navigation-links">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}</div></nav>
}
