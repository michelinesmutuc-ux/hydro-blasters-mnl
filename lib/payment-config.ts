export type PaymentOption = {
  id: string
  name: string
  qrPath: string
  downloadName: string
  enabled: boolean
  sortOrder: number
}

const gcash: PaymentOption = {
  id: 'gcash',
  name: 'GCash',
  qrPath: '/payment-qrs/gcash.jpg',
  downloadName: 'hydro-blasters-gcash-qr.jpg',
  enabled: true,
  sortOrder: 1,
}

export const paymentConfiguration = {
  gcash,
  cashOnDelivery: { ...gcash, id: 'cod-upfront', downloadName: 'hydro-blasters-cod-qr.jpg' },
  bankTransfer: [
    { id: 'bdo', name: 'BDO', qrPath: '/payment-qrs/BDO.JPG', downloadName: 'hydro-blasters-mnl-bdo-qr.jpg', enabled: true, sortOrder: 1 },
    { id: 'gotyme', name: 'GoTyme', qrPath: '/payment-qrs/GoTyme.JPG', downloadName: 'hydro-blasters-mnl-gotyme-qr.jpg', enabled: true, sortOrder: 2 },
    { id: 'unionbank', name: 'UnionBank', qrPath: '/payment-qrs/unionbank.JPG', downloadName: 'hydro-blasters-mnl-unionbank-qr.jpg', enabled: true, sortOrder: 3 },
  ] satisfies PaymentOption[],
}

export function getPaymentOption(method: string, bankOptionId: string | null) {
  if (method === 'gcash') return paymentConfiguration.gcash
  if (method === 'cash_on_delivery') return paymentConfiguration.cashOnDelivery
  if (method === 'bank_transfer') return paymentConfiguration.bankTransfer.find((option) => option.id === bankOptionId && option.enabled) ?? null
  return null
}
