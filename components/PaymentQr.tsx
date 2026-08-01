'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type Setting = {
  display_name: string
  masked_account_name: string
  masked_account_number: string
  qr_path: string
}

const paymentFileName: Record<string, string> = {
  gcash: 'hydro-blasters-mnl-gcash-qr.png',
  bank_transfer: 'hydro-blasters-mnl-bank-transfer-qr.png',
  cash_on_delivery: 'hydro-blasters-mnl-cod-qr.png',
}

export function PaymentQr({ method, amount, onAvailabilityChange }: {
  method: string
  amount: number
  onAvailabilityChange: (available: boolean) => void
}) {
  const [setting, setSetting] = useState<Setting | null>(null)

  useEffect(() => {
    let live = true
    setSetting(null)
    if (method === 'pay_upon_pickup') {
      onAvailabilityChange(true)
      return
    }

    async function loadPaymentSetting() {
      const { data, error } = await supabase
        .from('payment_settings')
        .select('display_name, masked_account_name, masked_account_number, qr_path')
        .eq('method', method)
        .maybeSingle()

      if (!live) return
      if (error || !data?.qr_path) {
        setSetting(null)
        onAvailabilityChange(false)
        return
      }
      setSetting(data as Setting)
      onAvailabilityChange(true)
    }

    void loadPaymentSetting()
    return () => { live = false }
  }, [method, onAvailabilityChange])

  if (method === 'pay_upon_pickup') return null
  if (!setting) return <div className="payment-qr-unavailable" role="alert">Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>

  const { data } = supabase.storage.from('payment-qrs').getPublicUrl(setting.qr_path)
  const download = () => {
    const link = document.createElement('a')
    link.href = data.publicUrl
    link.download = paymentFileName[method] ?? 'hydro-blasters-mnl-payment-qr.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return <div className="payment-qr-card">
    <strong>{setting.display_name} Payment</strong>
    <img src={data.publicUrl} alt={`${setting.display_name} payment QR code`} />
    <p>Account name: {setting.masked_account_name}</p>
    <p>Account number: {setting.masked_account_number}</p>
    <p className="payment-qr-amount">Amount to pay: ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    <button type="button" onClick={download}>Download QR</button>
    <p>Using the same phone? Download the QR, then upload it in your GCash or banking app.</p>
    <p>Before sending payment, confirm that the recipient name shown in your payment app matches the account name displayed here.</p>
  </div>
}
