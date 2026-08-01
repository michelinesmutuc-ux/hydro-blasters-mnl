export type PaymentOption = {
  id: string
  name: string
  qrPath: string
  downloadName: string
  maskedAccountName: string
  maskedAccountNumber: string
  enabled: boolean
  sortOrder: number
}

const gcash: PaymentOption = {
  id: 'gcash',
  name: 'GCash',
  qrPath: '/payment-qrs/gcash.png',
  downloadName: 'hydro-blasters-mnl-gcash-qr.png',
  maskedAccountName: 'Account name not configured',
  maskedAccountNumber: 'Number not configured',
  enabled: true,
  sortOrder: 1,
}

export const paymentConfiguration = {
  gcash,
  cashOnDelivery: { ...gcash, id: 'cod-upfront', downloadName: 'hydro-blasters-mnl-cod-qr.png' },
  bankTransfer: [
    { id: 'bdo', name: 'BDO', qrPath: '/payment-qrs/bdo.png', downloadName: 'hydro-blasters-mnl-bdo-qr.png', maskedAccountName: 'Account name not configured', maskedAccountNumber: 'Number not configured', enabled: true, sortOrder: 1 },
    { id: 'bpi', name: 'BPI', qrPath: '/payment-qrs/bpi.png', downloadName: 'hydro-blasters-mnl-bpi-qr.png', maskedAccountName: 'Account name not configured', maskedAccountNumber: 'Number not configured', enabled: true, sortOrder: 2 },
    { id: 'unionbank', name: 'UnionBank', qrPath: '/payment-qrs/unionbank.png', downloadName: 'hydro-blasters-mnl-unionbank-qr.png', maskedAccountName: 'Account name not configured', maskedAccountNumber: 'Number not configured', enabled: true, sortOrder: 3 },
  ] satisfies PaymentOption[],
}

export function getPaymentOption(method: string, bankOptionId: string | null) {
  if (method === 'gcash') return paymentConfiguration.gcash
  if (method === 'cash_on_delivery') return paymentConfiguration.cashOnDelivery
  if (method === 'bank_transfer') return paymentConfiguration.bankTransfer.find((option) => option.id === bankOptionId && option.enabled) ?? null
  return null
}
