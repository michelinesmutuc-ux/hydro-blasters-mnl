import Link from 'next/link'
import { getUpgradeableClassification } from '../lib/products/get-upgradeable-classification'

type Specification = { label: string; value: string }

const content = {
  'hobby-grade': {
    label: 'Upgradeable / Hobby Grade',
    heading: 'First hobby-grade blaster?',
    body: 'Learn about battery compatibility, upgrades, maintenance, and the basics of choosing accessories for an upgradeable unit.',
    action: 'Read the Getting Started Guide',
  },
  'toy-grade': {
    label: 'Toy Grade / Non-upgradeable',
    heading: 'Thinking of upgrading later?',
    body: 'Learn the difference between toy-grade and hobby-grade gel blasters before choosing your first unit.',
    action: 'Understand the Difference',
  },
  unknown: {
    label: null,
    heading: 'New to Gel Blasters?',
    body: 'Our Getting Started guide explains the basics, batteries, maintenance, safety tips, and how to choose the right blaster for your needs.',
    action: 'Read the Getting Started Guide',
  },
} as const

export function ProductHelpCallout({ specifications }: { specifications: Specification[] }) {
  const classification = getUpgradeableClassification(specifications)
  const variant = content[classification]

  return <aside className="product-help-callout">
    {variant.label && <p className="eyebrow">{variant.label}</p>}
    <h2>{variant.heading}</h2>
    <p>{variant.body}</p>
    <Link className="secondary-button" href="/help/getting-started">{variant.action}</Link>
    <p className="product-help-tip"><strong>Hydro Tip</strong> The best gel blaster isn&apos;t the most expensive one—it&apos;s the one that matches your budget and how you plan to enjoy the hobby.</p>
  </aside>
}
