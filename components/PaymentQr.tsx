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
  const downloadFile = (file?: File) => {
    const link = document.createElement('a')
    link.href = file ? URL.createObjectURL(file) : option.qrPath
    link.download = file?.name ?? option.downloadName
    link.click()
    if (file) window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
  }
  const downloadQr = async () => {
    let file: File | undefined
    try {
      const response = await fetch(option.qrPath)
      if (!response.ok) throw new Error('QR image could not be downloaded.')
      const image = await response.blob()
      if (!image.type.startsWith('image/')) throw new Error('QR image has an unsupported file type.')
      file = new File([image], option.downloadName, { type: image.type })

      const shareData = { files: [file] }
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        try {
          await navigator.share({ ...shareData, title: `${option.name} payment QR` })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
    } catch {
      // Fall through to the browser's regular image download when the QR cannot be shared.
    }
    downloadFile(file)
  }
  return <><strong>{option.name} Payment</strong><img src={option.qrPath} alt={`${option.name} payment QR code`} /><p className="payment-qr-amount">Amount to Pay Now: ₱{amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><button className="payment-qr-download" type="button" onClick={() => void downloadQr()}>Download QR</button><p className="payment-qr-share-help">On supported phones, Download QR opens your device&apos;s share menu. Choose Save Image, Photos, or your payment app.</p><p>Using the same phone? Download the QR and upload it to your GCash or banking app.</p><p>After completing your payment, upload a screenshot of the successful transaction below.</p></>
}
