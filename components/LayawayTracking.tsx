'use client'

import { type FormEvent, useState } from 'react'
import { supabasePublishableKey, supabaseUrl } from '../lib/supabase/client'
import { detectSupportedProofType, fileToBase64 } from '../lib/checkout/reliability'

type Payment = { id: string; payment_kind: string; installment_number: number | null; merchandise_amount: number; shipping_amount: number; amount_due: number; due_date: string | null; late_fee_amount: number; payment_status: string }
type Plan = { layaway_status: string; layaway_price: number; amount_paid: number; remaining_balance: number; amount_currently_due: number; early_payoff_amount: number; next_payment_amount: number; next_due_date: string | null; payments: Payment[] }
const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
const displayDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${value}T00:00:00`)) : '—'

function CalendarIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg> }
function StatusIcon({ status }: { status: string }) { return status === 'verified' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7" /><circle cx="12" cy="12" r="9" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> }
const statusLabel = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function LayawayTracking({ orderReference }: { orderReference: string }) {
  const [code, setCode] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [paymentMode, setPaymentMode] = useState<'due' | 'next_installment' | 'pay_all'>('due')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const request = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { response, data: await response.json().catch(() => ({})) }
  }
  const validAccessCode = /^LYW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)
  async function load(event: FormEvent) {
    event.preventDefault()
    if (!validAccessCode) return setError('Enter a valid Layaway access code.')
    setLoading(true)
    try {
      const { response, data } = await request('get-layaway-order', { order_reference: orderReference, access_code: code })
      if (!response.ok || data.error) return setError(data.error || 'Layaway access could not be verified.')
      setPlan(data.order); setPaymentMode(data.order.amount_currently_due > 0 ? 'due' : 'next_installment'); setError(null)
    } catch { setError('Layaway order access is temporarily unavailable. Please try again shortly.') } finally { setLoading(false) }
  }
  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!plan || !proof) return
    const contentType = await detectSupportedProofType(proof)
    if (!contentType) return setError('Use a JPG, PNG, or WebP payment screenshot.')
    setLoading(true)
    const { response, data } = await request('submit-layaway-payment', { order_reference: orderReference, access_code: code, payment_attempt_key: crypto.randomUUID(), payment_mode: paymentMode, payment_proof: { base64: await fileToBase64(proof), contentType } })
    setLoading(false)
    if (!response.ok || data.error) return setError(data.error || 'Layaway payment could not be submitted.')
    setMessage(`Payment proof for ${peso(Number(data.amount_due))} was submitted for verification.`); setProof(null)
    await load({ preventDefault() {} } as FormEvent)
  }

  const pending = plan?.payments.some((payment) => payment.payment_status === 'pending_verification') ?? false
  const nextInstallment = plan?.payments.find((payment) => payment.payment_kind === 'installment' && !['verified', 'cancelled'].includes(payment.payment_status))
  const remainingInstallments = plan?.payments.filter((payment) => payment.payment_kind === 'installment' && !['verified', 'cancelled'].includes(payment.payment_status)) ?? []
  const finalInstallmentOnly = nextInstallment?.installment_number === 3 && remainingInstallments.length === 1
  const canPayNextInstallment = plan?.amount_currently_due === 0 && ['scheduled', 'rejected'].includes(nextInstallment?.payment_status ?? '')
  const earlyPayoffShipping = remainingInstallments.reduce((sum, payment) => sum + payment.shipping_amount, 0)
  const earlyPayoffLateFees = Math.max(0, (plan?.early_payoff_amount ?? 0) - (plan?.remaining_balance ?? 0) - earlyPayoffShipping)
  return <section className="same-day-track">
    <h3>Layaway payments</h3>
    <form className="layaway-access-form" onSubmit={(event) => void load(event)}>
      <p>Enter the private Layaway access code from your confirmation.</p>
      <label>Layaway access code<input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="LYW-XXXX-XXXX-XXXX" /></label>
      <button className="secondary-button" disabled={loading || !validAccessCode}>View Layaway</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {plan && <>
      <dl className="track-amounts"><div><dt>Layaway Price</dt><dd>{peso(plan.layaway_price)}</dd></div><div><dt>Amount Paid</dt><dd>{peso(plan.amount_paid)}</dd></div><div><dt>Remaining Merchandise Balance</dt><dd>{peso(plan.remaining_balance)}</dd></div><div><dt>Next Payment</dt><dd>{peso(plan.next_payment_amount)}</dd></div><div><dt>Next Due Date</dt><dd>{plan.next_due_date || '—'}</dd></div><div><dt>Amount Currently Due</dt><dd>{peso(plan.amount_currently_due)}</dd></div></dl>
      {plan.payments.map((payment) => {
        const finalInstallment = payment.payment_kind === 'installment' && payment.installment_number === 3
        return <div className="track-item" key={payment.id}>
        <span><strong>{payment.payment_kind === 'down_payment' ? 'Down payment' : `Installment ${payment.installment_number}`}</strong><small className="layaway-payment-meta"><span><CalendarIcon />{displayDate(payment.due_date)}</span><span className={`layaway-payment-status layaway-payment-status-${payment.payment_status}`}><StatusIcon status={payment.payment_status} />{statusLabel(payment.payment_status)}</span></small>{payment.late_fee_amount > 0 && <small>Late fee: {peso(payment.late_fee_amount)}</small>}</span>
        <span className="layaway-payment-amounts"><strong>{peso(finalInstallment ? payment.merchandise_amount : payment.amount_due)}</strong>{finalInstallment && <small className="layaway-final-payment-breakdown"><span>↳ Shipping fee <b>{peso(payment.shipping_amount)}</b></span><span>Total final payment <b>{peso(payment.amount_due)}</b></span></small>}</span>
      </div>
      })}
      {pending ? <p role="status"><strong>Payment awaiting verification.</strong> Another payment cannot be submitted until this proof is reviewed.</p> : plan.layaway_status !== 'paid' && plan.layaway_status !== 'cancelled' && <form onSubmit={(event) => void pay(event)}>
        <h3>Submit payment proof</h3>
        {finalInstallmentOnly && nextInstallment && <p>Final Installment: {peso(nextInstallment.merchandise_amount)}<br />Shipping: {peso(nextInstallment.shipping_amount)}<br /><strong>Total to Pay: {peso(nextInstallment.amount_due)}</strong></p>}
        <div className="layaway-payment-options">
          {canPayNextInstallment && <button className={`layaway-payment-option ${paymentMode === 'next_installment' ? 'is-selected' : ''}`} type="button" aria-pressed={paymentMode === 'next_installment'} onClick={() => setPaymentMode('next_installment')}>{finalInstallmentOnly ? `Pay Final Payment — ${peso(plan.next_payment_amount)}` : `Pay Next Installment — ${peso(plan.next_payment_amount)}`}</button>}
          {plan.amount_currently_due > 0 && <button className={`layaway-payment-option ${paymentMode === 'due' ? 'is-selected' : ''}`} type="button" aria-pressed={paymentMode === 'due'} onClick={() => setPaymentMode('due')}>{finalInstallmentOnly ? `Pay Final Payment — ${peso(plan.amount_currently_due)}` : `Pay Amount Currently Due — ${peso(plan.amount_currently_due)}`}</button>}
          {plan.layaway_status === 'active' && !finalInstallmentOnly && <button className={`layaway-payment-option ${paymentMode === 'pay_all' ? 'is-selected' : ''}`} type="button" aria-pressed={paymentMode === 'pay_all'} onClick={() => setPaymentMode('pay_all')}>Pay in Full — {peso(plan.early_payoff_amount)}</button>}
        </div>
        {paymentMode === 'pay_all' ? <p className="layaway-payoff-breakdown">Remaining merchandise: {peso(plan.remaining_balance)}<br />Shipping: {peso(earlyPayoffShipping)}{earlyPayoffLateFees > 0 && <><br />Late fees: {peso(earlyPayoffLateFees)}</>}<br /><strong>Total to pay: {peso(plan.early_payoff_amount)}</strong></p> : <p>{paymentMode === 'next_installment' ? `Next scheduled installment: ${peso(plan.next_payment_amount)}.` : `Amount due now: ${peso(plan.amount_currently_due)}.`}</p>}
        <input required type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} />
        <button className="primary-button" disabled={loading || (paymentMode === 'due' && plan.amount_currently_due <= 0)}>Submit Payment Proof</button>
      </form>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>
}
