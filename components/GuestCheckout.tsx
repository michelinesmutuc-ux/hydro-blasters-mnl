'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase/client'
import { useCart } from './CartProvider'
import { PaymentQr } from './PaymentQr'
import { getPaymentOption } from '../lib/payment-config'

const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
const initial = { customer_name: '', mobile_number: '', house_unit: '', street: '', barangay: '', city_municipality: '', region: '', postal_code: '', order_notes: '' }
type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery' | 'pay_upon_pickup'

const paymentMethods: { id: PaymentMethod; name: string; description: string }[] = [
  { id: 'gcash', name: 'GCash', description: 'Pay instantly using the GCash QR.' },
  { id: 'bank_transfer', name: 'Bank Transfer', description: 'Transfer using your preferred bank.' },
  { id: 'cash_on_delivery', name: 'Cash on Delivery', description: 'Pay the merchandise amount upon delivery. Shipping and COD fees are paid in advance.' },
  { id: 'pay_upon_pickup', name: 'Showroom Pickup', description: 'Reserve online and pay according to the selected pickup payment option.' },
]

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

  const bulky = lines.some((line) => line.shipping_classification === 'bulky')
  const shipping = delivery === 'nationwide_delivery' ? (bulky ? 199 : 149) : 0
  const codFee = payment === 'cash_on_delivery' ? Math.ceil(subtotal * .01) : 0
  const pickup = payment === 'pay_upon_pickup'
  const upfront = pickup ? 0 : payment === 'cash_on_delivery' ? shipping + codFee : subtotal + shipping
  const proofNeeded = !pickup

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

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!payment) return setError('Please choose a payment method.')
    if (payment === 'bank_transfer' && !bankOptionId) return setError('Choose your bank before placing your order.')
    if (proofNeeded && !qrAvailable) return setError(payment === 'bank_transfer' ? 'Bank transfer is temporarily unavailable. Please choose another payment method.' : 'Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.')
    if (proofNeeded && !proof) return setError('A payment screenshot is required.')
    if (pickup && !reservation) return setError('Confirm that this is only a reservation request.')
    if (payment === 'cash_on_delivery' && !codConfirm) return setError('Confirm the COD payment requirement.')
    if (proof && (!['image/jpeg', 'image/png', 'image/webp'].includes(proof.type) || proof.size > 5 * 1024 * 1024)) return setError('Payment proof must be JPG, PNG, or WebP and 5 MB or smaller.')

    setSaving(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-guest-order', {
        body: {
          ...form,
          delivery_method: delivery,
          payment_method: payment,
          payment_option_name: getPaymentOption(payment, bankOptionId)?.name ?? null,
          items: lines.map((line) => ({ product_id: line.id, quantity: line.quantity })),
          idempotency_key: crypto.randomUUID(),
          payment_proof: proof ? { base64: await fileToBase64(proof), contentType: proof.type } : null,
        },
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)
      sessionStorage.setItem('hydro-order-confirmation', JSON.stringify({ ...data.order, customer_name: form.customer_name, delivery_method: delivery, payment_method: payment }))
      clear()
      router.push('/order-confirmation')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order could not be placed.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="section checkout-page">
    <header className="checkout-heading"><p className="eyebrow">Guest checkout</p><h1>Checkout</h1><p>Complete your details to submit your order for review.</p></header>
    <form onSubmit={submit} className="checkout-layout">
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <div className="checkout-fields">
        <section className="checkout-card"><h2>Customer Information</h2><div className="checkout-grid">
          <label>Full Name <em>Required</em><input required value={form.customer_name} onChange={(event) => update('customer_name', event.target.value)} /></label>
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
          {payment === 'cash_on_delivery' && <div className="cod-payment-breakdown"><div><span>Shipping fee</span><strong>{peso(shipping)}</strong></div><div><span>COD service fee</span><strong>{peso(codFee)}</strong></div><div><span>Amount payable upfront</span><strong>{peso(upfront)}</strong></div><div><span>Amount payable to rider</span><strong>{peso(subtotal)}</strong></div></div>}
          {payment && proofNeeded && <PaymentQr method={payment} amount={upfront} bankOptionId={bankOptionId} onBankOptionChange={selectBankOption} onAvailabilityChange={setQrAvailable} />}
          {payment && proofNeeded && qrAvailable && <div className="proof-card"><strong>Payment Screenshot Upload</strong><p>After payment, upload a screenshot of the successful transaction below.</p><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} /><p>Accepted: JPG, PNG, WebP · Maximum file size: 5 MB</p>{proof && <img src={URL.createObjectURL(proof)} alt="Payment screenshot preview" />}</div>}
          {payment === 'pay_upon_pickup' && <label className="checkout-check"><input type="checkbox" checked={reservation} onChange={(event) => setReservation(event.target.checked)} /> I understand that this is only a reservation request and I must wait for Hydro Blasters MNL to confirm before visiting.</label>}
          {payment === 'cash_on_delivery' && <label className="checkout-check"><input type="checkbox" checked={codConfirm} onChange={(event) => setCodConfirm(event.target.checked)} /> I understand that my COD order will only be processed after the shipping fee and COD service fee are paid and verified.</label>}
        </section>
      </div>
      <aside className="checkout-summary"><h2>Order Summary</h2>{lines.map((line) => <p key={line.id}>{line.name} × {line.quantity} — {peso(Number(line.price) * line.quantity)}</p>)}<dl><div><dt>Subtotal</dt><dd>{peso(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{peso(shipping)}</dd></div>{codFee > 0 && <div><dt>COD Fee</dt><dd>{peso(codFee)}</dd></div>}<div className="checkout-total"><dt>Total</dt><dd>{peso(subtotal + shipping + codFee)}</dd></div></dl><button className="secondary-button" disabled={saving || (payment !== null && proofNeeded && !qrAvailable) || (payment === 'bank_transfer' && !bankOptionId)} type="submit">{saving ? 'Placing order…' : 'Place Order'}</button></aside>
    </form>
  </section>
}
