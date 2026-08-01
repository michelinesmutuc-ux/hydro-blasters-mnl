'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery'
type PaymentSetting = { id: string; method: PaymentMethod; display_name: string; masked_account_name: string | null; masked_account_number: string | null; qr_path: string | null; enabled: boolean }
type BankOption = { id: string; payment_method_id: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean; sort_order: number }
type ParentDraft = { method: PaymentMethod; display_name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean }
type BankDraft = { id?: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean }
type UploadDiagnostic = { bucket: string; path: string; operation: 'upload'; upsert: false; userId: string | null; role: string | null; errorCode?: string; errorMessage?: string }

const parentDefaults: Record<PaymentMethod, ParentDraft> = {
  gcash: { method: 'gcash', display_name: 'GCash', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  bank_transfer: { method: 'bank_transfer', display_name: 'Bank Transfer', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  cash_on_delivery: { method: 'cash_on_delivery', display_name: 'Cash on Delivery', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
}
const blankBank = (): BankDraft => ({ name: '', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: true })
const accepted = ['image/jpeg', 'image/png', 'image/webp']
const extensionFor = (file: File) => file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'

function paymentQrStorage(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim()
  if (!url || !key) throw new Error('QR image upload failed: Supabase is not configured.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  }).storage.from('payment-qrs')
}

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
  const [uploadDiagnostic, setUploadDiagnostic] = useState<UploadDiagnostic | null>(null)

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

  async function uploadQr(file: File, prefix: string) {
    const path = `settings/${prefix}-${crypto.randomUUID()}.${extensionFor(file)}`
    const { data: { session } } = await supabase.auth.getSession()
    const diagnostic: UploadDiagnostic = {
      bucket: 'payment-qrs',
      path,
      operation: 'upload',
      upsert: false,
      userId: session?.user.id ?? null,
      role: typeof session?.user.app_metadata.role === 'string' ? session.user.app_metadata.role : null,
    }
    console.info('[Hydro Blasters MNL] Payment QR upload', diagnostic)
    if (!session) throw new Error('QR image upload failed: no active administrator session.')
    if (diagnostic.role !== 'admin') throw new Error('QR image upload failed: the current session does not have the admin role.')
    const { error: uploadError } = await paymentQrStorage(session.access_token).upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      const storageError = uploadError as typeof uploadError & { statusCode?: string; error?: string }
      const failedDiagnostic = { ...diagnostic, errorCode: storageError.statusCode ?? storageError.error ?? storageError.name, errorMessage: uploadError.message }
      setUploadDiagnostic(failedDiagnostic)
      console.error('[Hydro Blasters MNL] Payment QR upload failed', failedDiagnostic)
      throw new Error(`QR image upload failed (${failedDiagnostic.errorCode}): ${failedDiagnostic.errorMessage}`)
    }
    setUploadDiagnostic(null)
    return path
  }

  async function removeQr(path: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await paymentQrStorage(session.access_token).remove([path])
  }

  async function saveParent(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null)
    if (!draft.display_name.trim()) return setError('Enter a payment method name.')
    if (!isBankTransfer && (!draft.masked_account_name.trim() || !draft.masked_account_number.trim())) return setError('Enter masked recipient details.')
    if (!isBankTransfer && !draft.qr_path && !qrFile) return setError('Upload a QR image before saving this payment method.')
    setSaving(true)
    let qrPath = draft.qr_path
    try {
      if (qrFile) qrPath = await uploadQr(qrFile, draft.method)
      const { error: saveError } = await supabase.from('payment_settings').upsert({ ...draft, qr_path: isBankTransfer ? null : qrPath || null, masked_account_name: isBankTransfer ? null : draft.masked_account_name.trim() || null, masked_account_number: isBankTransfer ? null : draft.masked_account_number.trim() || null, updated_at: new Date().toISOString() }, { onConflict: 'method' })
      if (saveError) throw saveError
      if (qrFile && draft.qr_path && draft.qr_path !== qrPath) await removeQr(draft.qr_path)
      setDraft((current) => ({ ...current, qr_path: qrPath })); setQrFile(null); setMessage('Payment method saved.'); await load()
    } catch (caught) {
      if (qrFile && qrPath && qrPath !== draft.qr_path) await removeQr(qrPath)
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
      if (bankQrFile) qrPath = await uploadQr(bankQrFile, `bank-${bankDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
      const { error: saveError } = await supabase.from('payment_method_options').upsert({ id: bankDraft.id, payment_method_id: selectedParent.id, name: bankDraft.name.trim(), masked_account_name: bankDraft.masked_account_name.trim(), masked_account_number: bankDraft.masked_account_number.trim(), qr_path: qrPath, enabled: bankDraft.enabled, sort_order: bankDraft.id ? (options.find((option) => option.id === bankDraft.id)?.sort_order ?? options.length) : options.length, updated_at: new Date().toISOString() })
      if (saveError) throw saveError
      if (bankQrFile && bankDraft.qr_path && bankDraft.qr_path !== qrPath) await removeQr(bankDraft.qr_path)
      setBankDraft(null); setBankQrFile(null); setMessage('Bank option saved.'); await load()
    } catch (caught) {
      if (bankQrFile && qrPath && qrPath !== bankDraft.qr_path) await removeQr(qrPath)
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
    const { error: deleteError } = await supabase.from('payment_method_options').delete().eq('id', option.id)
    if (deleteError) return setError(deleteError.message)
    await removeQr(option.qr_path)
    setMessage('Bank option removed.'); await load()
  }

  const bankOptions = selectedParent ? options.filter((option) => option.payment_method_id === selectedParent.id) : []
  return <div className={styles.paymentSettings}>
    {message && <p className={styles.successMessage} role="status">{message}</p>}{error && <p className={styles.errorMessage} role="alert">{error}</p>}
    {uploadDiagnostic && <details className={styles.uploadDiagnostic}><summary>Payment QR upload diagnostics</summary><p>Bucket: {uploadDiagnostic.bucket}<br />Object path: {uploadDiagnostic.path}<br />Operation: {uploadDiagnostic.operation} (upsert: false)<br />User ID: {uploadDiagnostic.userId ?? 'No active session'}<br />app_metadata.role: {uploadDiagnostic.role ?? 'Not set'}<br />Storage error: {uploadDiagnostic.errorCode ?? 'Unknown'} — {uploadDiagnostic.errorMessage ?? 'Unknown error'}</p></details>}
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
