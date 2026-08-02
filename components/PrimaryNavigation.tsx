'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const links = [
  { href: '/', label: 'Home' },
  { href: '/shop', label: 'Shop' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
  { href: '/visit-showroom', label: 'Visit Showroom' },
  { href: '/appointments', label: 'Book a Visit' },
  { href: '/track-order', label: 'Track Order' },
]

export function PrimaryNavigation({ ariaLabel = 'Primary navigation' }: { ariaLabel?: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return <nav className={open ? 'primary-navigation primary-navigation-open' : 'primary-navigation'} aria-label={ariaLabel}><button className="primary-navigation-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>Menu</button><div className="primary-navigation-links">{links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined} onClick={() => setOpen(false)}>{link.label}</Link>)}</div></nav>
}
