'use client'

import { type FormEvent, useState } from 'react'
import { supabasePublishableKey, supabaseUrl } from '../lib/supabase/client'
import { detectSupportedProofType, fileToBase64 } from '../lib/checkout/reliability'

type Payment = { id: string; payment_kind: string; installment_number: number | null; amount_due: number; due_date: string | null; late_fee_amount: number; payment_status: string }
type Plan = { layaway_status: string; layaway_price: number; amount_paid: number; remaining_balance: number; amount_currently_due: number; early_payoff_amount: number; next_due_date: string | null; payments: Payment[] }
const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

export function LayawayTracking({ orderReference }: { orderReference: string }) {
  const [code, setCode] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [payAll, setPayAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const request = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, { method: 'POST', headers: { apikey: supabasePublishableKey, Authorization: `Bearer ${supabasePublishableKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { response, data: await response.json().catch(() => ({})) }
  }
  const validAccessCode = /^LYW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code) || /^[A-Za-z0-9_-]{32,}$/.test(code)
  async function load(event: FormEvent) {
    event.preventDefault()
    if (!validAccessCode) return setError('Enter a valid Layaway access code.')
    setLoading(true)
    try {
      const { response, data } = await request('get-layaway-order', { order_reference: orderReference, access_code: code })
      if (!response.ok || data.error) return setError(data.error || 'Layaway access could not be verified.')
      setPlan(data.order); setError(null)
    } catch { setError('Layaway order access is temporarily unavailable. Please try again shortly.') } finally { setLoading(false) }
  }
  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!plan || !proof) return
    const contentType = await detectSupportedProofType(proof)
    if (!contentType) return setError('Use a JPG, PNG, or WebP payment screenshot.')
    setLoading(true)
    const { response, data } = await request('submit-layaway-payment', { order_reference: orderReference, access_code: code, payment_attempt_key: crypto.randomUUID(), pay_all: payAll, payment_proof: { base64: await fileToBase64(proof), contentType } })
    setLoading(false)
    if (!response.ok || data.error) return setError(data.error || 'Layaway payment could not be submitted.')
    setMessage(`Payment proof for ${peso(Number(data.amount_due))} was submitted for verification.`); setProof(null)
    await load({ preventDefault() {} } as FormEvent)
  }

  const pending = plan?.payments.some((payment) => payment.payment_status === 'pending_verification') ?? false
  return <section className="same-day-track"><h3>Layaway payments</h3><form className="layaway-access-form" onSubmit={(event) => void load(event)}><p>Enter the private Layaway access code from your confirmation.</p><label>Layaway access code<input required value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="LYW-XXXX-XXXX-XXXX" /></label><button className="secondary-button" disabled={loading || !validAccessCode}>View Layaway</button></form>{error && <p role="alert">{error}</p>}{plan && <><dl className="track-amounts"><div><dt>Layaway Price</dt><dd>{peso(plan.layaway_price)}</dd></div><div><dt>Amount Paid</dt><dd>{peso(plan.amount_paid)}</dd></div><div><dt>Remaining Balance</dt><dd>{peso(plan.remaining_balance)}</dd></div><div><dt>Next Due Date</dt><dd>{plan.next_due_date || '—'}</dd></div><div><dt>Amount Currently Due</dt><dd>{peso(plan.amount_currently_due)}</dd></div></dl>{plan.payments.map((payment) => <div className="track-item" key={payment.id}><span>{payment.payment_kind === 'down_payment' ? 'Down payment' : `Installment ${payment.installment_number}`}<small>{payment.due_date || '—'} · {payment.payment_status.replaceAll('_', ' ')}</small>{payment.late_fee_amount > 0 && <small>Late fee: {peso(payment.late_fee_amount)}</small>}</span><strong>{peso(payment.amount_due)}</strong></div>)}{pending ? <p role="status"><strong>Payment awaiting verification.</strong> Another payment cannot be submitted until this proof is reviewed.</p> : plan.layaway_status !== 'paid' && plan.layaway_status !== 'cancelled' && <form onSubmit={(event) => void pay(event)}><h3>Submit payment proof</h3><p>{payAll ? `Full remaining payoff: ${peso(plan.early_payoff_amount)}.` : `Amount due now: ${peso(plan.amount_currently_due)}.`}</p><label className="checkout-check"><input type="checkbox" checked={payAll} onChange={(event) => setPayAll(event.target.checked)} /> Pay the full remaining balance early ({peso(plan.early_payoff_amount)}).</label><input required type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} /><button className="primary-button" disabled={loading || (!payAll && plan.amount_currently_due <= 0)}>Submit Payment Proof</button></form>}{message && <p role="status">{message}</p>}</>}</section>
}
