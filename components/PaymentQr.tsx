'use client'

import { useEffect, useState } from 'react'
import { getPaymentOption, paymentConfiguration } from '../lib/payment-config'

export function PaymentQr({ method, amount, bankOptionId, onBankOptionChange, onAvailabilityChange }: { method: string; amount: number; bankOptionId: string | null; onBankOptionChange: (id: string | null) => void; onAvailabilityChange: (available: boolean) => void }) {
  const option = getPaymentOption(method, bankOptionId)
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!option?.enabled) { setImageStatus('error'); onAvailabilityChange(false); return }
    let live = true
    const image = new Image()
    const timeout = window.setTimeout(() => { if (live) { setImageStatus('error'); onAvailabilityChange(false) } }, 10000)
    setImageStatus('loading'); onAvailabilityChange(false)
    image.onload = () => { if (live) { window.clearTimeout(timeout); setImageStatus('ready'); onAvailabilityChange(true) } }
    image.onerror = () => { if (live) { window.clearTimeout(timeout); setImageStatus('error'); onAvailabilityChange(false) } }
    image.src = option.qrPath
    return () => { live = false; window.clearTimeout(timeout) }
  }, [option?.id, option?.qrPath, option?.enabled, onAvailabilityChange])

  if (method === 'pay_upon_pickup') return null
  if (method === 'bank_transfer') {
    const banks = paymentConfiguration.bankTransfer.filter((bank) => bank.enabled).sort((a, b) => a.sortOrder - b.sortOrder)
    if (banks.length === 0) return <div className="payment-qr-unavailable" role="alert">Payment QR is temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>
    return <div className="payment-qr-card"><strong>Choose your bank</strong><div className="bank-options" role="radiogroup" aria-label="Choose your bank">{banks.map((bank) => <button key={bank.id} type="button" role="radio" aria-checked={bank.id === bankOptionId} className={bank.id === bankOptionId ? 'bank-option bank-option-selected' : 'bank-option'} onClick={() => onBankOptionChange(bank.id)}>{bank.name}</button>)}</div>{!option ? <p>Select a bank to see its payment QR and recipient details.</p> : <PaymentDetails option={option} amount={amount} imageStatus={imageStatus} />}</div>
  }
  if (!option) return <div className="payment-qr-unavailable" role="alert">Payment QR is temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>
  return <div className="payment-qr-card"><PaymentDetails option={option} amount={amount} imageStatus={imageStatus} /></div>
}

function PaymentDetails({ option, amount, imageStatus }: { option: ReturnType<typeof getPaymentOption> & {}; amount: number; imageStatus: 'loading' | 'ready' | 'error' }) {
  if (!option || imageStatus === 'error') return <div className="payment-qr-unavailable" role="alert">Payment QR is temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.</div>
  if (imageStatus === 'loading') return <p>Loading payment QR…</p>
  return <><strong>{option.name} Payment</strong><img src={option.qrPath} alt={`${option.name} payment QR code`} /><p>Account name: {option.maskedAccountName}</p><p>Account number: {option.maskedAccountNumber}</p><p className="payment-qr-amount">Amount to pay: ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><a className="payment-qr-download" href={option.qrPath} download={option.downloadName}>Download QR</a><p>Using the same phone? Download the QR, then upload it in your banking or e-wallet app.</p><p>Before sending payment, confirm that the recipient name shown in your payment app matches the account name displayed here.</p></>
}
