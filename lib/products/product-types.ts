export const GEL_BLASTER_TYPES = ['Rifle', 'SMG', 'Pistol', 'Shotgun', 'Others'] as const

export type GelBlasterType = typeof GEL_BLASTER_TYPES[number]

export const gelBlasterTypeFilterLabels: Record<GelBlasterType, string> = {
  Rifle: 'Rifles',
  SMG: 'SMGs',
  Pistol: 'Pistols',
  Shotgun: 'Shotguns',
  Others: 'Others',
}

// The catalogue currently stores its broad category as the singular “Gel Blaster”.
// Accept the plural form too, so a future label change does not break Type behavior.
export function isGelBlasterCategory(category: string | null | undefined) {
  const normalized = category?.trim().toLocaleLowerCase()
  return normalized === 'gel blaster' || normalized === 'gel blasters'
}

export function isGelBlasterType(value: string | null | undefined): value is GelBlasterType {
  return GEL_BLASTER_TYPES.includes(value as GelBlasterType)
}

export function parseGelBlasterType(value: string | null | undefined): GelBlasterType | '' {
  const normalized = value?.trim().toLocaleLowerCase()
  return GEL_BLASTER_TYPES.find((productType) => productType.toLocaleLowerCase() === normalized) ?? ''
}
