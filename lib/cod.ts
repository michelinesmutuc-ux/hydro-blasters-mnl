import config from '../config/cod.json'

export const codServiceFeeLabel = `COD Service Fee (${config.ratePercent}%)`

// Preserve the existing whole-peso ceiling on merchandise after discounts.
export function calculateCodServiceFee(merchandiseAfterDiscount: number): number {
  return Math.ceil(merchandiseAfterDiscount * config.ratePercent / 100)
}
