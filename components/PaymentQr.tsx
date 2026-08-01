'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

type DirectSetting = { display_name: string; masked_account_name: string; masked_account_number: string; qr_path: string }
type BankOption = { id: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string }

const paymentFileName: Record<string, string> = { gcash: 'hydro-blasters-mnl-gcash-qr.png', bank_transfer: 'hydro-blasters-mnl-bank-transfer-qr.png', cash_on_delivery: 'hydro-blasters-mnl-cod-qr.png' }

export function PaymentQr({ method, amount, bankOptionId, onBankOptionChange, onAvailabilityChange }: { method: string; amount: number; bankOptionId: string | null; onBankOptionChange: (id: string | null) => void; onAvailabilityChange: (available: boolean) => void }) {
  const [directSetting, setDirectSetting] = useState<DirectSetting | null>(null)
  const [bankOptions, setBankOptions] = useState<BankOption[]>([])

  useEffect(() => {
    let live = true
    setDirectSetting(null); setBankOptions([])
    if (method === 'pay_upon_pickup') { onAvailabilityChange(true); return }
    async function load() {
      if (method === 'bank_transfer') {
        const { data, error } = await supabase.from('payment_method_options').select('id, name, masked_account_name, masked_account_number, qr_path').order('sort_order').order('created_at')
        if (!live) return
        const options = error ? [] : (data ?? []) as BankOption[]
        setBankOptions(options)
        onAvailabilityChange(Boolean(bankOptionId && options.some((option) => option.id === bankOptionId)))
        return
      }
      const { data, error } = await supabase.from('payment_settings').select('display_name, masked_account_name, masked_account_number, qr_path').eq('method', method).maybeSingle()
      if (!live) return
      if (error || !data?.qr_path) { onAvailabilityChange(false); return }
      setDirectSetting(data as DirectSetting)
      onAvailabilityChange(true)
    }
    void load()
    return () => { live = false }
  }, [method, bankOptionId, onAvailabilityChange])

  if (method === 'pay_upon_pickup') return null
  if (method === 'bank_transfer') {
    if (bankOptions.length === 0) return <div className="payment-qr-unavailable" role="alert">Bank transfer is temporarily unavailable. Please choose another payment method.</div>
    const selected = bankOptions.find((option) => option.id === bankOptionId) ?? null
    return <div className="payment-qr-card"><strong>Choose your bank</strong><div className="bank-options" role="radiogroup" aria-label="Choose your bank">{bankOptions.map((option) => <button key={option.id} type="button" role="radio" aria-checked={option.id === bankOptionId} className={option.id === bankOptionId ? 'bank-option bank-option-selected' : 'bank-option'} onClick={() => onBankOptionChange(option.id)}>{option.name}</button>)}</div>{!selected ? <p>Select a bank to see its payment QR and recipient details.</p> : <PaymentDetails method={method} amount={amount} setting={selected} onAvailabilityChange={onAvailabilityChange} />}</div>
  }
  if (!directSetting) return <div className="payment-qr-unavailable" role="alert">Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>
  return <div className="payment-qr-card"><PaymentDetails method={method} amount={amount} setting={directSetting} onAvailabilityChange={onAvailabilityChange} /></div>
}

function PaymentDetails({ method, amount, setting, onAvailabilityChange }: { method: string; amount: number; setting: DirectSetting | BankOption; onAvailabilityChange: (available: boolean) => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const displayName = 'name' in setting ? setting.name : setting.display_name

  useEffect(() => {
    let live = true
    let objectUrl: string | null = null
    setImageUrl(null); setImageError(false); onAvailabilityChange(false)
    async function loadImage() {
      const { data, error } = await supabase.storage.from('payment-qrs').download(setting.qr_path)
      if (!live) return
      if (error || !data) { setImageError(true); onAvailabilityChange(false); return }
      objectUrl = URL.createObjectURL(data)
      setImageUrl(objectUrl)
      onAvailabilityChange(true)
    }
    void loadImage()
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [setting.qr_path, onAvailabilityChange])

  if (imageError) return <div className="payment-qr-unavailable" role="alert">Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>
  if (!imageUrl) return <p>Loading secure payment QR…</p>
  const download = () => {
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = method === 'bank_transfer' ? `hydro-blasters-mnl-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-qr.png` : paymentFileName[method] ?? 'hydro-blasters-mnl-payment-qr.png'
    document.body.appendChild(link); link.click(); link.remove()
  }
  return <><strong>{method === 'bank_transfer' ? displayName : `${displayName} Payment`}</strong><img src={imageUrl} alt={`${displayName} payment QR code`} /><p>Account name: {setting.masked_account_name}</p><p>Account number: {setting.masked_account_number}</p><p className="payment-qr-amount">Amount to pay: ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><button type="button" onClick={download}>Download QR</button><p>Using the same phone? Download the QR, then upload it in your banking or e-wallet app.</p><p>Before sending payment, confirm that the recipient name shown in your payment app matches the account name displayed here.</p></>
}
