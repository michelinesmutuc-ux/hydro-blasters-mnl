'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase/client'
import { useCart } from './CartProvider'
import { PaymentQr } from './PaymentQr'
import { getPaymentOption } from '../lib/payment-config'
import { calculateShipping } from '../lib/shipping/classes'
import { isSameDayEligibleLocation, sameDayProcessingLabel, type SameDayNearbyArea } from '../lib/delivery/same-day'
import { CheckoutTimeoutError, createAnonymousAttemptId, detectSupportedProofType, fileToBase64, invokeGuestOrder, logCheckoutDiagnostic, orderSubmissionTimeoutMs, proofMimeCategory, proofSizeBucket, supportCode, type SupportedProofType } from '../lib/checkout/reliability'

const peso = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
const initial = { first_name: '', last_name: '', mobile_number: '', house_unit: '', street: '', barangay: '', city_municipality: '', region: '', postal_code: '', order_notes: '' }
type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery' | 'pay_upon_pickup'

const paymentMethods: { id: PaymentMethod; name: string; description: string }[] = [
  { id: 'gcash', name: 'GCash', description: 'Pay instantly using the GCash QR.' },
  { id: 'bank_transfer', name: 'Bank Transfer', description: 'Transfer using your preferred bank.' },
  { id: 'cash_on_delivery', name: 'Cash on Delivery', description: 'Pay the merchandise amount upon delivery. Shipping and COD fees are due now.' },
  { id: 'pay_upon_pickup', name: 'Showroom Pickup', description: 'Reserve online and pay according to the selected pickup payment option.' },
]
const maximumProofSize = 5 * 1024 * 1024

export function GuestCheckout() {
  const { lines, subtotal, clear } = useCart()
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [delivery, setDelivery] = useState<'nationwide_delivery' | 'same_day_delivery' | 'showroom_pickup'>('nationwide_delivery')
  const [payment, setPayment] = useState<PaymentMethod | null>(null)
  const [bankOptionId, setBankOptionId] = useState<string | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [proofContentType, setProofContentType] = useState<SupportedProofType | null>(null)
  const [proofError, setProofError] = useState<string | null>(null)
  const [reservation, setReservation] = useState(false)
  const [codConfirm, setCodConfirm] = useState(false)
  const [sameDayAcknowledged, setSameDayAcknowledged] = useState(false)
  const [sameDayNearbyAreas, setSameDayNearbyAreas] = useState<SameDayNearbyArea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submissionRecovery, setSubmissionRecovery] = useState(false)
  const [technicalFailure, setTechnicalFailure] = useState(false)
  const [qrAvailable, setQrAvailable] = useState(true)
  const orderAttemptKey = useRef<string | null>(null)
  const diagnosticAttemptId = useRef<string | null>(null)
  const proofInputRef = useRef<HTMLInputElement | null>(null)
  const paymentSectionRef = useRef<HTMLElement | null>(null)
  const sameDayAcknowledgmentRef = useRef<HTMLInputElement | null>(null)
  const previewUrl = useMemo(() => proof ? URL.createObjectURL(proof) : null, [proof])

  const getDiagnosticAttemptId = useCallback(() => {
    if (!diagnosticAttemptId.current) diagnosticAttemptId.current = createAnonymousAttemptId()
    return diagnosticAttemptId.current
  }, [])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  useEffect(() => {
    let mounted = true
    void supabase.from('same_day_delivery_nearby_cities').select('city,province').eq('active', true).then(({ data }) => {
      if (mounted) setSameDayNearbyAreas((data ?? []).filter((row): row is SameDayNearbyArea => typeof row.city === 'string'))
    })
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (delivery === 'same_day_delivery' && !isSameDayEligibleLocation(form.city_municipality, form.region, sameDayNearbyAreas)) {
      setDelivery('nationwide_delivery')
      setPayment(null)
      setBankOptionId(null)
      setProof(null)
      setProofContentType(null)
      setProofError(null)
      setSameDayAcknowledged(false)
    }
  }, [delivery, form.city_municipality, form.region, sameDayNearbyAreas])

  const shippingQuote = calculateShipping(lines)
  const sameDayEligible = isSameDayEligibleLocation(form.city_municipality, form.region, sameDayNearbyAreas)
  const sameDay = delivery === 'same_day_delivery'
  const shipping = delivery === 'nationwide_delivery' ? shippingQuote.fee : 0
  const codFee = payment === 'cash_on_delivery' ? Math.ceil(subtotal * .01) : 0
  const pickup = payment === 'pay_upon_pickup'
  const dueNow = pickup ? 0 : payment === 'cash_on_delivery' ? shipping + codFee : subtotal + shipping
  const overallTotal = subtotal + shipping + codFee
  const proofNeeded = !pickup
  const blockingReasons = [
    ...(saving ? [{ code: 'saving', message: 'Your order is being submitted. Please wait.' }] : []),
    ...(!payment ? [{ code: 'payment_missing', message: 'Choose a payment method.' }] : []),
    ...(payment === 'bank_transfer' && !bankOptionId ? [{ code: 'bank_missing', message: 'Choose your bank.' }] : []),
    ...(payment !== null && proofNeeded && !qrAvailable && !proof && (payment !== 'bank_transfer' || Boolean(bankOptionId)) ? [{ code: 'payment_details_loading', message: 'Payment details are still loading.' }] : []),
    ...(payment !== null && proofNeeded && qrAvailable && !proof && (payment !== 'bank_transfer' || Boolean(bankOptionId)) ? [{ code: 'proof_missing', message: 'Choose a valid payment screenshot.' }] : []),
    ...(sameDay && !sameDayAcknowledged ? [{ code: 'same_day_ack_missing', message: 'Confirm Same-Day delivery.' }] : []),
    ...(pickup && !reservation ? [{ code: 'pickup_ack_missing', message: 'Confirm that this is a reservation request.' }] : []),
    ...(payment === 'cash_on_delivery' && !codConfirm ? [{ code: 'cod_ack_missing', message: 'Confirm the COD payment requirement.' }] : []),
  ]
  const submitDisabled = blockingReasons.length > 0
  const blockingReasonSignature = blockingReasons.map((reason) => reason.code).join(',')
  useEffect(() => {
    logCheckoutDiagnostic({
      attemptId: getDiagnosticAttemptId(),
      eventCode: 'disabled_state_changed',
      phase: 'submission',
      disabledReasons: blockingReasonSignature ? blockingReasonSignature.split(',') : [],
    })
  }, [blockingReasonSignature, getDiagnosticAttemptId])
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

  const update = (key: keyof typeof initial, value: string) => {
    setError(null)
    setForm((current) => ({ ...current, [key]: value }))
  }
  const selectPayment = (nextPayment: PaymentMethod) => {
    setPayment(nextPayment)
    setBankOptionId(null)
    setProof(null)
    setProofContentType(null)
    setProofError(null)
    setCodConfirm(false)
    setReservation(false)
    setQrAvailable(nextPayment === 'pay_upon_pickup')
    // A prepaid method must not silently replace an already-selected
    // Same-Day delivery method with Standard Shipping.
    setDelivery((current) => nextPayment === 'pay_upon_pickup'
      ? 'showroom_pickup'
      : current === 'showroom_pickup'
        ? 'nationwide_delivery'
        : current)
  }
  const changeDelivery = (nextDelivery: typeof delivery) => {
    if (nextDelivery === 'same_day_delivery' && !sameDayEligible) return
    setDelivery(nextDelivery)
    setPayment(null)
    setBankOptionId(null)
    setProof(null)
    setProofContentType(null)
    setProofError(null)
    setQrAvailable(false)
    setCodConfirm(false)
    setReservation(false)
    setSameDayAcknowledged(false)
  }
  const selectBankOption = (nextBankOptionId: string | null) => {
    setBankOptionId(nextBankOptionId)
    setProof(null)
    setProofContentType(null)
    setProofError(null)
  }

  const rejectProof = (message: string, errorCode: string, file?: File) => {
    setProof(null)
    setProofContentType(null)
    setProofError(message)
    if (proofInputRef.current) proofInputRef.current.value = ''
    logCheckoutDiagnostic({ attemptId: getDiagnosticAttemptId(), eventCode: 'proof_rejected', phase: 'proof_selection', mimeCategory: proofMimeCategory(file?.type ?? ''), sizeBucket: file ? proofSizeBucket(file.size) : undefined, errorCode })
  }

  const selectProof = async (file: File | null) => {
    if (!file) {
      setProof(null)
      setProofContentType(null)
      return
    }
    logCheckoutDiagnostic({ attemptId: getDiagnosticAttemptId(), eventCode: 'proof_selected', phase: 'proof_selection', mimeCategory: proofMimeCategory(file.type), sizeBucket: proofSizeBucket(file.size) })
    if (file.size === 0) {
      return rejectProof('The payment screenshot file is empty. Please choose another file.', 'empty_file', file)
    }
    if (file.size > maximumProofSize) {
      return rejectProof('The payment screenshot must be 5 MB or smaller.', 'file_too_large', file)
    }
    let detectedType: SupportedProofType | null = null
    try {
      detectedType = await detectSupportedProofType(file)
    } catch {
      return rejectProof('The payment screenshot could not be inspected. Please choose it again.', 'inspection_failed', file)
    }
    if (!detectedType) return rejectProof('Please upload an actual JPG, PNG, or WebP screenshot. HEIC and other file types are not supported.', 'unsupported_content', file)
    setError(null)
    setProofError(null)
    setProof(file)
    setProofContentType(detectedType)
    logCheckoutDiagnostic({ attemptId: getDiagnosticAttemptId(), eventCode: 'proof_accepted', phase: 'proof_selection', mimeCategory: proofMimeCategory(detectedType), sizeBucket: proofSizeBucket(file.size) })
  }

  const getOrderAttemptKey = () => {
    if (orderAttemptKey.current) return orderAttemptKey.current
    let savedKey: string | null = null
    try { savedKey = sessionStorage.getItem('hydro-order-attempt-key') } catch { /* Use the in-memory key below. */ }
    const nextKey = savedKey || crypto.randomUUID()
    orderAttemptKey.current = nextKey
    try { sessionStorage.setItem('hydro-order-attempt-key', nextKey) } catch { /* The ref still preserves retries on this page. */ }
    return nextKey
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmissionRecovery(false)
    if (!payment) return setError('Please choose a payment method.')
    if (payment === 'bank_transfer' && !bankOptionId) return setError('Choose your bank before placing your order.')
    if (proofNeeded && !qrAvailable && !proof) return setError(payment === 'bank_transfer' ? 'Bank transfer is temporarily unavailable. Please choose another payment method.' : 'Payment details are temporarily unavailable. Please contact Hydro Blasters MNL before sending payment.')
    if (sameDay && !sameDayEligible) return setError('Same-Day / On-Demand Delivery is available only in Metro Manila and selected nearby areas.')
    if (sameDay && !sameDayAcknowledged) return setError('Confirm that you will wait for the Ready for Rider confirmation.')
    if (proofNeeded && !proof) return setError('A payment screenshot is required.')
    if (pickup && !reservation) return setError('Confirm that this is only a reservation request.')
    if (payment === 'cash_on_delivery' && !codConfirm) return setError('Confirm the COD payment requirement.')
    if (proof && !proofContentType) return setProofError('Please choose a valid JPG, PNG, or WebP screenshot.')
    if (proof && proof.size === 0) return setError('The payment screenshot file is empty. Please choose another file.')
    if (proof && proof.size > maximumProofSize) return setError('The payment screenshot must be 5 MB or smaller.')

    setSaving(true)
    const attemptId = getDiagnosticAttemptId()
    logCheckoutDiagnostic({ attemptId, eventCode: 'submit_clicked', phase: 'submission', disabledReasons: blockingReasons.map((reason) => reason.code) })
    const controller = new AbortController()
    const submissionTimer = window.setTimeout(() => controller.abort(), orderSubmissionTimeoutMs)
    try {
      const customerName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim()
      let paymentProof: { base64: string; contentType: SupportedProofType } | null = null
      if (proof && proofContentType) {
        logCheckoutDiagnostic({ attemptId, eventCode: 'file_read_started', phase: 'proof_processing', mimeCategory: proofMimeCategory(proofContentType), sizeBucket: proofSizeBucket(proof.size) })
        paymentProof = { base64: await fileToBase64(proof), contentType: proofContentType }
        logCheckoutDiagnostic({ attemptId, eventCode: 'file_read_completed', phase: 'proof_processing', mimeCategory: proofMimeCategory(proofContentType), sizeBucket: proofSizeBucket(proof.size) })
      }
      logCheckoutDiagnostic({ attemptId, eventCode: 'edge_invoke_started', phase: 'submission' })
      const data = await invokeGuestOrder({
          ...form,
          customer_name: customerName,
          delivery_method: delivery,
          same_day_acknowledged: sameDayAcknowledged,
          payment_method: payment,
          payment_option_name: getPaymentOption(payment, bankOptionId)?.name ?? null,
          items: lines.map((line) => ({ product_id: line.product_id ?? line.id, variant_id: line.variant_id ?? null, quantity: line.quantity })),
          idempotency_key: getOrderAttemptKey(),
          payment_proof: paymentProof,
      }, controller.signal)
      logCheckoutDiagnostic({ attemptId, eventCode: 'edge_invoke_completed', phase: 'submission' })
      sessionStorage.setItem('hydro-order-confirmation', JSON.stringify({ ...data.order, customer_name: customerName, mobile_number: form.mobile_number, city_municipality: form.city_municipality, delivery_method: delivery, payment_method: payment, order_date: new Date().toISOString(), items: lines.map((line) => ({ name: line.name, variant_group_name: line.variant_group_name, variant_name: line.variant_name, quantity: line.quantity, line_total: Number(line.price) * line.quantity, is_clearance: line.is_clearance ?? false })) }))
      sessionStorage.removeItem('hydro-order-attempt-key')
      clear()
      router.push('/order-confirmation')
    } catch (caught) {
      const timedOut = caught instanceof DOMException && caught.name === 'AbortError'
      const proofTimedOut = caught instanceof CheckoutTimeoutError
      const responseStatus = typeof caught === 'object' && caught !== null && 'status' in caught ? Number(caught.status) : null
      const errorCode = timedOut ? 'order_timeout' : proofTimedOut ? caught.code : responseStatus ? `http_${responseStatus}` : 'submission_failed'
      if (proofTimedOut) logCheckoutDiagnostic({ attemptId, eventCode: 'file_read_failed', phase: 'proof_processing', errorCode })
      else logCheckoutDiagnostic({ attemptId, eventCode: timedOut ? 'edge_invoke_timed_out' : 'edge_invoke_failed', phase: 'submission', errorCode })
      setTechnicalFailure(true)
      setSubmissionRecovery(true)
      setError(timedOut
        ? 'We couldn’t confirm your order yet. Do not send payment again. Your details are still here.'
        : caught instanceof Error ? caught.message : 'Order could not be placed.')
    } finally {
      window.clearTimeout(submissionTimer)
      setSaving(false)
    }
  }

  const SummarySubmit = ({ className = '' }: { className?: string }) => <div className={`checkout-submit ${className}`}>
    {payment === 'cash_on_delivery' && <p>You will pay <strong>{peso(dueNow)}</strong> now. <strong>{peso(subtotal)}</strong> is payable to the rider upon delivery.</p>}
    {error && <p className="checkout-inline-error">{error}</p>}
    {blockingReasons.length > 0 && <div className="checkout-blockers" role="status"><strong>Before you can place your order:</strong><ul>{blockingReasons.map((reason) => <li key={reason.code}><button type="button" onClick={() => {
      if (reason.code === 'bank_missing' || reason.code === 'payment_missing' || reason.code === 'payment_details_loading' || reason.code === 'pickup_ack_missing' || reason.code === 'cod_ack_missing') paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (reason.code === 'proof_missing') { proofInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); proofInputRef.current?.focus() }
      if (reason.code === 'same_day_ack_missing') { sameDayAcknowledgmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); sameDayAcknowledgmentRef.current?.focus() }
    }}>{reason.message}</button></li>)}</ul></div>}
    {submissionRecovery && <div className="checkout-recovery" role="alert"><strong>We couldn’t confirm your order yet.</strong><p>Do not send payment again. Your details and payment screenshot are still here.</p><p>Try again safely using the same order attempt.</p></div>}
    <button className="secondary-button" disabled={submitDisabled} type="submit">{submissionRecovery ? 'Try placing order again' : submitLabel}</button>
    {technicalFailure && <p className="checkout-support-code">Support code: <strong>{supportCode(getDiagnosticAttemptId())}</strong></p>}
  </div>

  return <section className="section checkout-page">
    <header className="checkout-heading"><p className="eyebrow">Guest checkout</p><h1>Checkout</h1><p>Complete your details to submit your order for review.</p></header>
    <form onSubmit={submit} className="checkout-layout" onInvalid={(event) => {
      const checkoutForm = event.currentTarget
      window.setTimeout(() => {
        const firstInvalid = checkoutForm.querySelector(':invalid') as HTMLInputElement | null
        setError(`Please complete the required field: ${firstInvalid?.closest('label')?.textContent?.replace('Required', '').trim() || 'checkout information'}.`)
      }, 0)
    }}>
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <div className="checkout-fields">
        <section className="checkout-card"><h2>Customer Information</h2><div className="checkout-grid">
          <label>First Name (Given Name) <em>Required</em><input required autoComplete="given-name" value={form.first_name} onChange={(event) => update('first_name', event.target.value)} /></label>
          <label>Last Name (Surname) <em>Required</em><input required autoComplete="family-name" value={form.last_name} onChange={(event) => update('last_name', event.target.value)} /></label>
          <label>Mobile Number <em>Required</em><input required value={form.mobile_number} onChange={(event) => update('mobile_number', event.target.value)} /></label>
        </div></section>
        <section className="checkout-card"><h2>Delivery</h2>
          <label>Delivery Method <em>Required</em><select value={delivery} onChange={(event) => changeDelivery(event.target.value as typeof delivery)}><option value="nationwide_delivery">Standard Shipping</option><option value="same_day_delivery" disabled={!sameDayEligible}>Same-Day / On-Demand Delivery{sameDayEligible ? '' : ' — enter an eligible city first'}</option><option value="showroom_pickup">Showroom Pickup</option></select></label>
          {delivery !== 'showroom_pickup' && !sameDayEligible && <p className="same-day-availability">Same-Day / On-Demand Delivery is unavailable for this delivery address. Metro Manila and selected nearby areas only. Pickup is from Pasay City.</p>}
          {delivery !== 'showroom_pickup' && <div className="checkout-grid">{(['house_unit', 'street', 'barangay', 'city_municipality', 'region', 'postal_code'] as const).map((key) => <label key={key}>{key.replaceAll('_', ' ')} <em>Required</em><input required value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div>}
          {sameDay && <aside className="same-day-card"><strong>Same-Day / On-Demand Delivery</strong><b>Metro Manila & selected nearby areas</b><p><b>Pickup origin: Pasay City</b><br />Available within Metro Manila and selected nearby areas in Rizal, Cavite, Bulacan, and Laguna. Courier cost depends on your delivery location. You book and pay your own Lalamove, Grab, or equivalent rider.</p><p className="same-day-warning">PLEASE <em>DO NOT</em> BOOK A RIDER YET.</p><p>We&apos;ll let you know once your package is ready for pickup.</p><p><b>{sameDayProcessingLabel() === 'same_day_processing' ? 'Same-Day Processing' : 'Next-Day Processing'}</b><br />Paid orders verified before 3:00 PM are processed for same-day pickup. Orders verified after 3:00 PM are processed the following day.</p><label className="checkout-check"><input ref={sameDayAcknowledgmentRef} type="checkbox" checked={sameDayAcknowledged} onChange={(event) => setSameDayAcknowledged(event.target.checked)} /> I understand that I should wait for the “Ready for Rider” confirmation before booking my courier.</label></aside>}
          <label>Order Notes <em>Optional</em><textarea value={form.order_notes} onChange={(event) => update('order_notes', event.target.value)} /></label>
        </section>
        <section className="checkout-card" ref={paymentSectionRef}><h2>Payment</h2>
          <p className="payment-choice-intro">Choose how you&apos;d like to pay.</p>
          <div className="payment-methods" role="radiogroup" aria-label="Payment method">
            {paymentMethods.filter((method) => !(sameDay && method.id === 'cash_on_delivery')).map((method) => <button key={method.id} type="button" role="radio" aria-checked={payment === method.id} className={payment === method.id ? 'payment-method-card payment-method-card-selected' : 'payment-method-card'} onClick={() => selectPayment(method.id)}><span className="payment-method-radio" aria-hidden="true">{payment === method.id ? '✓' : ''}</span><span><strong>{method.name}</strong><small>{method.description}</small></span></button>)}
          </div>
          {payment === 'cash_on_delivery' && <div className="cod-payment-breakdown"><section><h3>Pay Now</h3><div><span>Shipping — {shippingQuote.shippingClass}</span><strong>{peso(shipping)}</strong></div><div><span>1% COD service fee</span><strong>{peso(codFee)}</strong></div><div className="cod-primary-amount"><span>Amount Due Now</span><strong>{peso(dueNow)}</strong></div></section><section><h3>Pay Upon Delivery</h3><div><span>Merchandise subtotal</span><strong>{peso(subtotal)}</strong></div><div><span>Amount Due to Rider</span><strong>{peso(subtotal)}</strong></div></section><section className="cod-order-value"><h3>Order Value</h3><div><span>Overall Order Total</span><strong>{peso(overallTotal)}</strong></div></section></div>}
          {payment && proofNeeded && <PaymentQr method={payment} amount={dueNow} bankOptionId={bankOptionId} onBankOptionChange={selectBankOption} onAvailabilityChange={setQrAvailable} />}
          {payment && proofNeeded && (qrAvailable || proof) && <div className="proof-card"><strong>Payment Screenshot Upload</strong><p>After payment, upload a screenshot of the successful transaction below.</p><input ref={proofInputRef} required type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void selectProof(event.target.files?.[0] ?? null)} /><p>Accepted: JPG, PNG, WebP · Maximum file size: 5 MB</p>{proofError && <p className="proof-error" role="alert">{proofError}</p>}{proof && previewUrl && <img src={previewUrl} alt="Payment screenshot preview" />}</div>}
          {payment === 'pay_upon_pickup' && <label className="checkout-check"><input type="checkbox" checked={reservation} onChange={(event) => setReservation(event.target.checked)} /> I understand that this is only a reservation request and I must wait for Hydro Blasters MNL to confirm before visiting.</label>}
          {payment === 'cash_on_delivery' && <label className="checkout-check"><input type="checkbox" checked={codConfirm} onChange={(event) => setCodConfirm(event.target.checked)} /> I understand that the shipping fee and COD service fee are due now, while the merchandise amount will be paid to the courier upon delivery.</label>}
        </section>
        <section className="checkout-final-cta"><p className="eyebrow">Ready to submit your order?</p><SummarySubmit /></section>
      </div>
      <aside className="checkout-summary"><h2>Order Summary</h2><div className="checkout-products">{lines.map((line) => <p key={line.id}><span>{line.name}{line.variant_name ? <small>{line.variant_group_name || 'Option'}: {line.variant_name}</small> : null}{line.is_clearance ? <small className="clearance-exclusion">Clearance Sale</small> : null} × {line.quantity}</span><strong>{peso(Number(line.price) * line.quantity)}</strong></p>)}</div>{payment === 'cash_on_delivery' ? <div className="cod-summary"><div className="cod-summary-now"><span>Amount Due Now</span><strong>{peso(dueNow)}</strong></div><div><span>Amount Due to Rider</span><strong>{peso(subtotal)}</strong></div><div className="cod-summary-total"><span>Overall Order Total</span><strong>{peso(overallTotal)}</strong></div></div> : <dl><div><dt>Subtotal</dt><dd>{peso(subtotal)}</dd></div><div><dt>{sameDay ? 'Same-Day / On-Demand Delivery' : `Shipping — ${shippingQuote.shippingClass}`}</dt><dd>{peso(shipping)}</dd></div>{sameDay && <p className="same-day-summary-note">Courier fee paid directly to rider.</p>}<div className="checkout-total"><dt>Total</dt><dd>{peso(overallTotal)}</dd></div></dl>}<SummarySubmit className="checkout-summary-submit" /></aside>
    </form>
  </section>
}
