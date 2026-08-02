export type UpgradeableClassification = 'hobby-grade' | 'toy-grade' | 'unknown'

type Specification = { label: string; value: string }

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const affirmativeValues = new Set(['yes', 'true', 'upgradeable', 'hobby grade', 'hobby-grade'])
const negativeValues = new Set(['no', 'false', 'non-upgradeable', 'not upgradeable', 'toy grade', 'toy-grade'])

export function getUpgradeableClassification(specifications: Specification[]): UpgradeableClassification {
  const upgradeableRow = specifications.find((specification) => normalize(specification.label) === 'upgradeable')
  if (!upgradeableRow) return 'unknown'

  const value = normalize(upgradeableRow.value)
  if (affirmativeValues.has(value)) return 'hobby-grade'
  if (negativeValues.has(value)) return 'toy-grade'
  return 'unknown'
}
