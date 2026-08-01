'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery'
type PaymentSetting = { id: string; method: PaymentMethod; display_name: string; masked_account_name: string | null; masked_account_number: string | null; qr_path: string | null; enabled: boolean }
type BankOption = { id: string; payment_method_id: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean; sort_order: number }
type ParentDraft = { method: PaymentMethod; display_name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean }
type BankDraft = { id?: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean }

const parentDefaults: Record<PaymentMethod, ParentDraft> = {
  gcash: { method: 'gcash', display_name: 'GCash', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  bank_transfer: { method: 'bank_transfer', display_name: 'Bank Transfer', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  cash_on_delivery: { method: 'cash_on_delivery', display_name: 'Cash on Delivery', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
}
const blankBank = (): BankDraft => ({ name: '', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: true })
const accepted = ['image/jpeg', 'image/png', 'image/webp']
const extensionFor = (file: File) => file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'

export function PaymentSettings() {
  const [settings, setSettings] = useState<PaymentSetting[]>([])
  const [options, setOptions] = useState<BankOption[]>([])
  const [draft, setDraft] = useState<ParentDraft>(parentDefaults.gcash)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [bankDraft, setBankDraft] = useState<BankDraft | null>(null)
  const [bankQrFile, setBankQrFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedParent = settings.find((setting) => setting.method === draft.method) ?? null
  const isBankTransfer = draft.method === 'bank_transfer'

  async function load() {
    setLoading(true)
    const [parents, bankOptions] = await Promise.all([
      supabase.from('payment_settings').select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled').order('method'),
      supabase.from('payment_method_options').select('id, payment_method_id, name, masked_account_name, masked_account_number, qr_path, enabled, sort_order').order('sort_order').order('created_at'),
    ])
    if (parents.error) setError(parents.error.message)
    else setSettings((parents.data ?? []) as PaymentSetting[])
    if (bankOptions.error) setError(bankOptions.error.message)
    else setOptions((bankOptions.data ?? []) as BankOption[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  function chooseMethod(method: PaymentMethod) {
    const setting = settings.find((entry) => entry.method === method)
    setDraft(setting ? { method, display_name: setting.display_name, masked_account_name: setting.masked_account_name ?? '', masked_account_number: setting.masked_account_number ?? '', qr_path: setting.qr_path ?? '', enabled: setting.enabled } : parentDefaults[method])
    setQrFile(null); setBankDraft(null); setBankQrFile(null); setMessage(null); setError(null)
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>, setFile: (file: File | null) => void) {
    const file = event.target.files?.[0] ?? null
    if (!file) return setFile(null)
    if (!accepted.includes(file.type)) { setError('QR image must be a JPG, PNG, or WebP file.'); event.target.value = ''; return }
    setFile(file); setError(null)
  }

  async function uploadQr(file: File, targetType: 'payment_method' | 'payment_method_option', targetId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('QR image upload failed: no active administrator session.')
    const form = new FormData()
    form.set('file', file)
    form.set('target_type', targetType)
    form.set('target_id', targetId)
    const { data, error: invokeError } = await supabase.functions.invoke('upload-payment-qr', {
      body: form,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (invokeError) throw new Error('Secure QR upload service is unavailable. Please try again.')
    if (data?.error) throw new Error(data.error)
    if (!data?.qr_image_path) throw new Error('The secure QR upload did not return an image path.')
    if (data.warning) setMessage(data.warning)
    return data.qr_image_path as string
  }

  async function saveParent(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null)
    if (!draft.display_name.trim()) return setError('Enter a payment method name.')
    if (!isBankTransfer && (!draft.masked_account_name.trim() || !draft.masked_account_number.trim())) return setError('Enter masked recipient details.')
    if (!isBankTransfer && !draft.qr_path && !qrFile) return setError('Upload a QR image before saving this payment method.')
    setSaving(true)
    let qrPath = draft.qr_path
    try {
      const { data: savedParent, error: saveError } = await supabase.from('payment_settings').upsert({ ...draft, qr_path: isBankTransfer ? null : qrPath || null, masked_account_name: isBankTransfer ? null : draft.masked_account_name.trim() || null, masked_account_number: isBankTransfer ? null : draft.masked_account_number.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'method' }).select('id, qr_path').single()
      if (saveError) throw saveError
      if (qrFile) qrPath = await uploadQr(qrFile, 'payment_method', savedParent.id)
      setDraft((current) => ({ ...current, qr_path: qrPath })); setQrFile(null); setMessage('Payment method saved.'); await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Payment method could not be saved.')
    } finally { setSaving(false) }
  }

  async function saveBank(event: FormEvent) {
    event.preventDefault(); if (!bankDraft || !selectedParent) return
    setError(null); setMessage(null)
    if (!bankDraft.name.trim() || !bankDraft.masked_account_name.trim() || !bankDraft.masked_account_number.trim()) return setError('Enter the bank name and masked recipient details.')
    if (!bankDraft.qr_path && !bankQrFile) return setError('Upload a QR image before saving this bank.')
    setSaving(true)
    let qrPath = bankDraft.qr_path
    try {
      const { data: savedOption, error: saveError } = await supabase.from('payment_method_options').upsert({ id: bankDraft.id, payment_method_id: selectedParent.id, name: bankDraft.name.trim(), masked_account_name: bankDraft.masked_account_name.trim(), masked_account_number: bankDraft.masked_account_number.trim(), qr_path: qrPath || null, enabled: bankQrFile && !bankDraft.id ? false : bankDraft.enabled, sort_order: bankDraft.id ? (options.find((option) => option.id === bankDraft.id)?.sort_order ?? options.length) : options.length, updated_at: new Date().toISOString() }).select('id').single()
      if (saveError) throw saveError
      if (bankQrFile) {
        qrPath = await uploadQr(bankQrFile, 'payment_method_option', savedOption.id)
        const { error: enableError } = await supabase.from('payment_method_options').update({ enabled: bankDraft.enabled, updated_at: new Date().toISOString() }).eq('id', savedOption.id)
        if (enableError) throw enableError
      }
      setBankDraft(null); setBankQrFile(null); setMessage('Bank option saved.'); await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bank option could not be saved.')
    } finally { setSaving(false) }
  }

  async function reorder(option: BankOption, direction: -1 | 1) {
    const bankOptions = options.filter((entry) => entry.payment_method_id === option.payment_method_id)
    const index = bankOptions.findIndex((entry) => entry.id === option.id)
    const neighbor = bankOptions[index + direction]
    if (!neighbor) return
    setSaving(true); setError(null)
    const result = await Promise.all([supabase.from('payment_method_options').update({ sort_order: neighbor.sort_order }).eq('id', option.id), supabase.from('payment_method_options').update({ sort_order: option.sort_order }).eq('id', neighbor.id)])
    setSaving(false)
    if (result.some((entry) => entry.error)) setError(result.find((entry) => entry.error)?.error?.message ?? 'Could not reorder bank options.')
    else await load()
  }

  async function removeBank(option: BankOption) {
    if (!window.confirm(`Remove ${option.name}? Its QR image will also be removed.`)) return
    setError(null); setMessage(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return setError('No active administrator session.')
    const form = new FormData()
    form.set('action', 'delete'); form.set('target_type', 'payment_method_option'); form.set('target_id', option.id)
    const { data, error: invokeError } = await supabase.functions.invoke('upload-payment-qr', { body: form, headers: { Authorization: `Bearer ${session.access_token}` } })
    if (invokeError) return setError('Secure QR management service is unavailable. Please try again.')
    if (data?.error) return setError(data.error)
    setMessage(data?.message ?? 'Bank option removed.'); await load()
  }

  const bankOptions = selectedParent ? options.filter((option) => option.payment_method_id === selectedParent.id) : []
  return <div className={styles.paymentSettings}>
    {message && <p className={styles.successMessage} role="status">{message}</p>}{error && <p className={styles.errorMessage} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={saveParent}><section className={styles.formSection}><div className={styles.fieldGrid}>
      <div className={styles.field}><label htmlFor="payment-method">Payment method</label><select id="payment-method" value={draft.method} onChange={(event) => chooseMethod(event.target.value as PaymentMethod)} disabled={saving}><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="cash_on_delivery">Cash on Delivery upfront fee</option></select></div>
      <div className={styles.field}><label htmlFor="payment-name">Payment method name</label><input id="payment-name" value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} disabled={saving} /></div>
      {!isBankTransfer && <><div className={styles.field}><label htmlFor="masked-name">Masked account name</label><input id="masked-name" placeholder="M******* M****" value={draft.masked_account_name} onChange={(event) => setDraft((current) => ({ ...current, masked_account_name: event.target.value }))} disabled={saving} /></div><div className={styles.field}><label htmlFor="masked-number">Masked number</label><input id="masked-number" placeholder="0917••••7305" value={draft.masked_account_number} onChange={(event) => setDraft((current) => ({ ...current, masked_account_number: event.target.value }))} disabled={saving} /></div><div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="payment-qr">Payment QR image</label><input id="payment-qr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event, setQrFile)} disabled={saving} /><span className={styles.slugHint}>JPG, PNG, or WebP. Upload the original QR image with whitespace around the code.</span></div></>}
      {isBankTransfer && <p className={`${styles.slugHint} ${styles.fieldFull}`}>Enable this parent method only when at least one enabled bank option is ready below.</p>}
      <label className={`${styles.toggle} ${styles.fieldFull}`}><span><strong>Enabled for checkout</strong><span>Only enabled methods are shown to customers.</span></span><input className={styles.switch} type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} disabled={saving} /></label>
    </div></section><div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save payment method'}</button></div></form>
    {isBankTransfer && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Bank options</h2><span>Only enabled banks are visible in checkout.</span></div><button className={styles.secondaryButton} type="button" onClick={() => { if (!selectedParent) return setError('Save Bank Transfer before adding banks.'); setBankDraft(blankBank()); setBankQrFile(null) }}>Add bank</button></div>
      {!selectedParent ? <div className={styles.emptyState}>Save the Bank Transfer method first, then add one or more banks.</div> : bankOptions.length === 0 ? <div className={styles.emptyState}>No bank options configured.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Bank</th><th>Recipient</th><th>Status</th><th>Actions</th></tr></thead><tbody>{bankOptions.map((option, index) => <tr key={option.id}><td>{option.name}</td><td>{option.masked_account_name}<br />{option.masked_account_number}</td><td><span className={styles.status}>{option.enabled ? 'Enabled' : 'Disabled'}</span></td><td className={styles.tableActions}><button className={styles.tableAction} type="button" onClick={() => { setBankDraft({ ...option }); setBankQrFile(null) }}>Edit</button><button className={styles.tableAction} type="button" disabled={index === 0 || saving} onClick={() => void reorder(option, -1)}>Up</button><button className={styles.tableAction} type="button" disabled={index === bankOptions.length - 1 || saving} onClick={() => void reorder(option, 1)}>Down</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" onClick={() => void removeBank(option)}>Delete</button></td></tr>)}</tbody></table></div>}
    </section>}
    {bankDraft && <form className={styles.form} onSubmit={saveBank}><section className={styles.formSection}><div className={styles.specificationHeader}><div><h2>{bankDraft.id ? 'Edit bank' : 'Add bank'}</h2><p>Only masked recipient details are stored here.</p></div></div><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="bank-name">Bank name</label><input id="bank-name" value={bankDraft.name} onChange={(event) => setBankDraft((current) => current && ({ ...current, name: event.target.value }))} /></div><div className={styles.field}><label htmlFor="bank-qr">QR image</label><input id="bank-qr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event, setBankQrFile)} /><span className={styles.slugHint}>Upload a replacement only if needed.</span></div><div className={styles.field}><label htmlFor="bank-masked-name">Masked account name</label><input id="bank-masked-name" placeholder="M******* M****" value={bankDraft.masked_account_name} onChange={(event) => setBankDraft((current) => current && ({ ...current, masked_account_name: event.target.value }))} /></div><div className={styles.field}><label htmlFor="bank-masked-number">Masked account number</label><input id="bank-masked-number" placeholder="•••• •••• ••1234" value={bankDraft.masked_account_number} onChange={(event) => setBankDraft((current) => current && ({ ...current, masked_account_number: event.target.value }))} /></div><label className={`${styles.toggle} ${styles.fieldFull}`}><span><strong>Enabled for checkout</strong><span>Disabled bank options are never shown publicly.</span></span><input className={styles.switch} type="checkbox" checked={bankDraft.enabled} onChange={(event) => setBankDraft((current) => current && ({ ...current, enabled: event.target.checked }))} /></label></div></section><div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => setBankDraft(null)} disabled={saving}>Cancel</button><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save bank'}</button></div></form>}
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Configured payment methods</h2><span>Masked details only</span></div>{loading ? <div className={styles.emptyState}>Loading payment settings…</div> : settings.length === 0 ? <div className={styles.emptyState}>No payment methods are configured yet.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Method</th><th>Status</th><th>Action</th></tr></thead><tbody>{settings.map((setting) => <tr key={setting.id}><td>{setting.display_name}</td><td><span className={styles.status}>{setting.enabled ? 'Enabled' : 'Disabled'}</span></td><td><button className={styles.tableAction} type="button" onClick={() => chooseMethod(setting.method)}>Edit</button></td></tr>)}</tbody></table></div>}</section>
  </div>
}
