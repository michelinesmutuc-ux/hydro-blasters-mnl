'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase/client'
import { useCart } from './CartProvider'
import { PaymentQr } from './PaymentQr'
import { getPaymentOption } from '../lib/payment-config'
import { fetchLaunchPromoStatus, type LaunchPromoStatus } from '../lib/promotions/launch-promo'

const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
const initial = { first_name: '', last_name: '', mobile_number: '', house_unit: '', street: '', barangay: '', city_municipality: '', region: '', postal_code: '', order_notes: '' }
type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery' | 'pay_upon_pickup'

const paymentMethods: { id: PaymentMethod; name: string; description: string }[] = [
  { id: 'gcash', name: 'GCash', description: 'Pay instantly using the GCash QR.' },
  { id: 'bank_transfer', name: 'Bank Transfer', description: 'Transfer using your preferred bank.' },
  { id: 'cash_on_delivery', name: 'Cash on Delivery', description: 'Pay the merchandise amount upon delivery. Shipping and COD fees are due now.' },
  { id: 'pay_upon_pickup', name: 'Showroom Pickup', description: 'Reserve online and pay according to the selected pickup payment option.' },
]
const supportedProofTypes = ['image/jpeg', 'image/png', 'image/webp']
const maximumProofSize = 5 * 1024 * 1024

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function GuestCheckout() {
  const { lines, subtotal, clear } = useCart()
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [delivery, setDelivery] = useState<'nationwide_delivery' | 'showroom_pickup'>('nationwide_delivery')
  const [payment, setPayment] = useState<PaymentMethod | null>(null)
  const [bankOptionId, setBankOptionId] = useState<string | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [reservation, setReservation] = useState(false)
  const [codConfirm, setCodConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [qrAvailable, setQrAvailable] = useState(true)
  const [launchPromo, setLaunchPromo] = useState<LaunchPromoStatus | null>(null)
  const orderAttemptKey = useRef<string | null>(null)

  useEffect(() => { void fetchLaunchPromoStatus().then(setLaunchPromo) }, [])

  const bulky = lines.some((line) => line.shipping_classification === 'bulky')
  const shipping = delivery === 'nationwide_delivery' ? (bulky ? 199 : 149) : 0
  const codFee = payment === 'cash_on_delivery' ? Math.ceil(subtotal * .01) : 0
  const pickup = payment === 'pay_upon_pickup'
  const dueNow = pickup ? 0 : payment === 'cash_on_delivery' ? shipping + codFee : subtotal + shipping
  const overallTotal = subtotal + shipping + codFee
  const proofNeeded = !pickup
  const eligibleMerchandise = lines.reduce((total, line) => total + (line.is_clearance ? 0 : Number(line.price) * line.quantity), 0)
  const estimatedPromoDiscount = launchPromo?.active && eligibleMerchandise > 0
    ? Math.min(Math.round(eligibleMerchandise * launchPromo.discountPercent * 100) / 100, launchPromo.maximumDiscount)
    : 0
  const submitDisabled = saving || (payment !== null && proofNeeded && !qrAvailable) || (payment === 'bank_transfer' && !bankOptionId)
  const submitLabel = saving
    ? 'Placing order…'
    : payment === 'cash_on_delivery'
      ? `Submit COD Order — Pay ${peso(dueNow)} Now`
      : payment === 'pay_upon_pickup'
        ? 'Submit Reservation Request'
        : payment
          ? `Place Order — Pay ${peso(dueNow)} Now`
          : 'Place Order'

  if (!lines.length) return <section className="section"><h1>Your cart is empty</h1></section>

  const update = (key: keyof typeof initial, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const selectPayment = (nextPayment: PaymentMethod) => {
    setPayment(nextPayment)
    setBankOptionId(null)
    setProof(null)
    setCodConfirm(false)
    setReservation(false)
    setQrAvailable(nextPayment === 'pay_upon_pickup')
    setDelivery(nextPayment === 'pay_upon_pickup' ? 'showroom_pickup' : 'nationwide_delivery')
  }
  const changeDelivery = (nextDelivery: typeof delivery) => {
    setDelivery(nextDelivery)
    setPayment(null)
    setBankOptionId(null)
    setProof(null)
    setQrAvailable(false)
    setCodConfirm(false)
    setReservation(false)
  }
  const selectBankOption = (nextBankOptionId: string | null) => {
    setBankOptionId(nextBankOptionId)
    setProof(null)
  }

  const selectProof = (file: File | null) => {
    if (!file) {
      setProof(null)
      return
    }
    if (!supportedProofTypes.includes(file.type)) {
      setProof(null)
      setError('Please upload a JPG, PNG, or WebP screenshot.')
      return
    }
    if (file.size === 0) {
      setProof(null)
      setError('The payment screenshot file is empty. Please choose another file.')
      return
    }
    if (file.size > maximumProofSize) {
      setProof(null)
      setError('The payment screenshot must be 5 MB or smaller.')
      return
    }
    setError(null)
    setProof(file)
  }

  const getOrderAttemptKey = () => {
    if (orderAttemptKey.current) return orderAttemptKey.current

    const savedKey = sessionStorage.getItem('hydro-order-attempt-key')
    const nextKey = savedKey || crypto.randomUUID()
    sessionStorage.setItem('hydro-order-attempt-key', nextKey)
    orderAttemptKey.current = nextKey
    return nextKey
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!payment) return setError('Please choose a payment method.')
    if (payment === 'bank_transfer' && !bankOptionId) return setError('Choose your bank before placing your order.')
    if (proofNeeded && !qrAvailable) return setError(payment === 'bank_transfer' ? 'Bank transfer is temporarily unavailable. Please choose another payment method.' : 'Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.')
    if (proofNeeded && !proof) return setError('A payment screenshot is required.')
    if (pickup && !reservation) return setError('Confirm that this is only a reservation request.')
    if (payment === 'cash_on_delivery' && !codConfirm) return setError('Confirm the COD payment requirement.')
    if (proof && !supportedProofTypes.includes(proof.type)) return setError('Please upload a JPG, PNG, or WebP screenshot.')
    if (proof && proof.size === 0) return setError('The payment screenshot file is empty. Please choose another file.')
    if (proof && proof.size > maximumProofSize) return setError('The payment screenshot must be 5 MB or smaller.')

    setSaving(true)
    try {
      const customerName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim()
      const { data, error: invokeError } = await supabase.functions.invoke('create-guest-order', {
        body: {
          ...form,
          customer_name: customerName,
          delivery_method: delivery,
          payment_method: payment,
          payment_option_name: getPaymentOption(payment, bankOptionId)?.name ?? null,
          items: lines.map((line) => ({ product_id: line.product_id ?? line.id, variant_id: line.variant_id ?? null, quantity: line.quantity })),
          idempotency_key: getOrderAttemptKey(),
          payment_proof: proof ? { base64: await fileToBase64(proof), contentType: proof.type } : null,
        },
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      sessionStorage.setItem('hydro-order-confirmation', JSON.stringify({ ...data.order, customer_name: customerName, mobile_number: form.mobile_number, city_municipality: form.city_municipality, delivery_method: delivery, payment_method: payment, order_date: new Date().toISOString(), items: lines.map((line) => ({ name: line.name, variant_group_name: line.variant_group_name, variant_name: line.variant_name, quantity: line.quantity, line_total: Number(line.price) * line.quantity, is_clearance: line.is_clearance ?? false })) }))
      sessionStorage.removeItem('hydro-order-attempt-key')
      clear()
      router.push('/order-confirmation')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order could not be placed.')
    } finally {
      setSaving(false)
    }
  }

  const SummarySubmit = ({ className = '' }: { className?: string }) => <div className={`checkout-submit ${className}`}>
    {payment === 'cash_on_delivery' && <p>You will pay <strong>{peso(dueNow)}</strong> now. <strong>{peso(subtotal)}</strong> is payable to the rider upon delivery.</p>}
    <button className="secondary-button" disabled={submitDisabled} type="submit">{submitLabel}</button>
  </div>

  return <section className="section checkout-page">
    <header className="checkout-heading"><p className="eyebrow">Guest checkout</p><h1>Checkout</h1><p>Complete your details to submit your order for review.</p></header>
    <form onSubmit={submit} className="checkout-layout">
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <div className="checkout-fields">
        <section className="checkout-card"><h2>Customer Information</h2><div className="checkout-grid">
          <label>First Name (Given Name) <em>Required</em><input required autoComplete="given-name" value={form.first_name} onChange={(event) => update('first_name', event.target.value)} /></label>
          <label>Last Name (Surname) <em>Required</em><input required autoComplete="family-name" value={form.last_name} onChange={(event) => update('last_name', event.target.value)} /></label>
          <label>Mobile Number <em>Required</em><input required value={form.mobile_number} onChange={(event) => update('mobile_number', event.target.value)} /></label>
        </div></section>
        <section className="checkout-card"><h2>Delivery</h2>
          <label>Delivery Method <em>Required</em><select value={delivery} onChange={(event) => changeDelivery(event.target.value as typeof delivery)}><option value="nationwide_delivery">Nationwide Delivery</option><option value="showroom_pickup">Showroom Pickup</option></select></label>
          {delivery === 'nationwide_delivery' && <div className="checkout-grid">{(['house_unit', 'street', 'barangay', 'city_municipality', 'region', 'postal_code'] as const).map((key) => <label key={key}>{key.replaceAll('_', ' ')} <em>Required</em><input required value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div>}
          <label>Order Notes <em>Optional</em><textarea value={form.order_notes} onChange={(event) => update('order_notes', event.target.value)} /></label>
        </section>
        <section className="checkout-card"><h2>Payment</h2>
          <p className="payment-choice-intro">Choose how you&apos;d like to pay.</p>
          <div className="payment-methods" role="radiogroup" aria-label="Payment method">
            {paymentMethods.map((method) => <button key={method.id} type="button" role="radio" aria-checked={payment === method.id} className={payment === method.id ? 'payment-method-card payment-method-card-selected' : 'payment-method-card'} onClick={() => selectPayment(method.id)}><span className="payment-method-radio" aria-hidden="true">{payment === method.id ? '✓' : ''}</span><span><strong>{method.name}</strong><small>{method.description}</small></span></button>)}
          </div>
          {payment === 'cash_on_delivery' && <div className="cod-payment-breakdown"><section><h3>Pay Now</h3><div><span>Nationwide Flat Rate Shipping</span><strong>{peso(shipping)}</strong></div><div><span>1% COD service fee</span><strong>{peso(codFee)}</strong></div><div className="cod-primary-amount"><span>Amount Due Now</span><strong>{peso(dueNow)}</strong></div></section><section><h3>Pay Upon Delivery</h3><div><span>Merchandise subtotal</span><strong>{peso(subtotal)}</strong></div><div><span>Amount Due to Rider</span><strong>{peso(subtotal)}</strong></div></section><section className="cod-order-value"><h3>Order Value</h3><div><span>Overall Order Total</span><strong>{peso(overallTotal)}</strong></div></section></div>}
          {payment && proofNeeded && <PaymentQr method={payment} amount={dueNow} bankOptionId={bankOptionId} onBankOptionChange={selectBankOption} onAvailabilityChange={setQrAvailable} />}
          {payment && proofNeeded && qrAvailable && <div className="proof-card"><strong>Payment Screenshot Upload</strong><p>After payment, upload a screenshot of the successful transaction below.</p><input required type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => selectProof(event.target.files?.[0] ?? null)} /><p>Accepted: JPG, PNG, WebP · Maximum file size: 5 MB</p>{proof && <img src={URL.createObjectURL(proof)} alt="Payment screenshot preview" />}</div>}
          {payment === 'pay_upon_pickup' && <label className="checkout-check"><input type="checkbox" checked={reservation} onChange={(event) => setReservation(event.target.checked)} /> I understand that this is only a reservation request and I must wait for Hydro Blasters MNL to confirm before visiting.</label>}
          {payment === 'cash_on_delivery' && <label className="checkout-check"><input type="checkbox" checked={codConfirm} onChange={(event) => setCodConfirm(event.target.checked)} /> I understand that the shipping fee and COD service fee are due now, while the merchandise amount will be paid to the courier upon delivery.</label>}
        </section>
        <section className="checkout-final-cta"><p className="eyebrow">Ready to submit your order?</p><SummarySubmit /></section>
      </div>
      <aside className="checkout-summary"><h2>Order Summary</h2><div className="checkout-products">{lines.map((line) => <p key={line.id}><span>{line.name}{line.variant_name ? <small>{line.variant_group_name || 'Option'}: {line.variant_name}</small> : null}{line.is_clearance ? <small className="clearance-exclusion">Clearance Sale — additional promos excluded</small> : null} × {line.quantity}</span><strong>{peso(Number(line.price) * line.quantity)}</strong></p>)}</div>{launchPromo?.active && eligibleMerchandise > 0 && <div className="launch-promo-estimate"><strong>Launch Promo — 10% Off</strong><span>Estimated saving up to {peso(estimatedPromoDiscount)}. Automatically applied to eligible items if a slot remains when your order is created. Clearance items excluded.</span></div>}{payment === 'cash_on_delivery' ? <div className="cod-summary"><div className="cod-summary-now"><span>Amount Due Now</span><strong>{peso(dueNow)}</strong></div><div><span>Amount Due to Rider</span><strong>{peso(subtotal)}</strong></div><div className="cod-summary-total"><span>Overall Order Total</span><strong>{peso(overallTotal)}</strong></div></div> : <dl><div><dt>Subtotal</dt><dd>{peso(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{peso(shipping)}</dd></div><div className="checkout-total"><dt>Total</dt><dd>{peso(overallTotal)}</dd></div></dl>}<SummarySubmit className="checkout-summary-submit" /></aside>
    </form>
  </section>
}
