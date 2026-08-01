'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { markWebsiteChangesUnpublished } from '../../lib/admin/publishing'
import { PublishWebsiteButton } from './PublishWebsiteButton'
import styles from './admin.module.css'

type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery'
type PaymentSetting = { id: string; method: PaymentMethod; display_name: string; masked_account_name: string | null; masked_account_number: string | null; qr_path: string | null; enabled: boolean; updated_at: string }
type BankOption = { id: string; payment_method_id: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string | null; enabled: boolean; sort_order: number; updated_at: string }
type ParentDraft = { id?: string; method: PaymentMethod; display_name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean }
type BankDraft = { id?: string; payment_method_id?: string; name: string; masked_account_name: string; masked_account_number: string; qr_path: string; enabled: boolean; sort_order?: number }
type TargetType = 'payment_method' | 'payment_method_option'

const parentDefaults: Record<PaymentMethod, ParentDraft> = {
  gcash: { method: 'gcash', display_name: 'GCash', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  bank_transfer: { method: 'bank_transfer', display_name: 'Bank Transfer', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
  cash_on_delivery: { method: 'cash_on_delivery', display_name: 'Cash on Delivery', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: false },
}
const blankBank = (): BankDraft => ({ name: '', masked_account_name: '', masked_account_number: '', qr_path: '', enabled: true })
const accepted = ['image/jpeg', 'image/png', 'image/webp']

function parentToDraft(setting: PaymentSetting): ParentDraft {
  return { id: setting.id, method: setting.method, display_name: setting.display_name, masked_account_name: setting.masked_account_name ?? '', masked_account_number: setting.masked_account_number ?? '', qr_path: setting.qr_path ?? '', enabled: setting.enabled }
}

function bankToDraft(option: BankOption): BankDraft {
  return { id: option.id, payment_method_id: option.payment_method_id, name: option.name, masked_account_name: option.masked_account_name, masked_account_number: option.masked_account_number, qr_path: option.qr_path ?? '', enabled: option.enabled, sort_order: option.sort_order }
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

  const isBankTransfer = draft.method === 'bank_transfer'
  const selectedParent = settings.find((setting) => setting.id === draft.id) ?? settings.find((setting) => setting.method === draft.method) ?? null
  const bankOptions = selectedParent ? options.filter((option) => option.payment_method_id === selectedParent.id) : []

  async function load() {
    setLoading(true)
    const [parents, bankOptions] = await Promise.all([
      supabase.from('payment_settings').select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled, updated_at').order('method'),
      supabase.from('payment_method_options').select('id, payment_method_id, name, masked_account_name, masked_account_number, qr_path, enabled, sort_order, updated_at').order('sort_order').order('created_at'),
    ])
    if (parents.error) setError(`Saved payment methods could not be reloaded: ${parents.error.message}`)
    else setSettings((parents.data ?? []) as PaymentSetting[])
    if (bankOptions.error) setError(`Saved bank options could not be reloaded: ${bankOptions.error.message}`)
    else setOptions((bankOptions.data ?? []) as BankOption[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  function showSavedMessage() {
    markWebsiteChangesUnpublished()
    setMessage('Payment settings saved. Publish Catalog to make these changes available on the public checkout.')
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>, setFile: (file: File | null) => void) {
    const file = event.target.files?.[0] ?? null
    if (!file) return setFile(null)
    if (!accepted.includes(file.type)) { setError('QR image must be a JPG, PNG, or WebP file.'); event.target.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('QR image must be 5 MB or smaller.'); event.target.value = ''; return }
    setFile(file); setError(null)
  }

  async function invokeQrFunction(action: 'upload' | 'preview' | 'delete', targetType: TargetType, targetId: string, file?: File) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('No active administrator session.')
    const form = new FormData()
    form.set('action', action); form.set('target_type', targetType); form.set('target_id', targetId)
    if (file) form.set('file', file)
    const { data, error: invokeError } = await supabase.functions.invoke('upload-payment-qr', { body: form, headers: { Authorization: `Bearer ${session.access_token}` } })
    if (invokeError) {
      const response = (invokeError as { context?: Response }).context
      if (response?.status === 401) throw new Error('No valid administrator session. Sign in and try again.')
      if (response?.status === 403) throw new Error('You are signed in but are not authorized to manage payment QR images.')
      if (response?.status === 404) throw new Error('The secure QR upload function is not deployed yet.')
      throw new Error('Secure QR service is unavailable. Please try again.')
    }
    if (data?.error) throw new Error(data.error)
    return data as { qr_image_path?: string; signed_url?: string; message?: string; warning?: string }
  }

  async function editParent(id: string) {
    setError(null); setMessage(null)
    const { data, error: queryError } = await supabase.from('payment_settings').select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled, updated_at').eq('id', id).single()
    if (queryError || !data) return setError(queryError?.message ?? 'The saved payment method could not be opened.')
    setDraft(parentToDraft(data as PaymentSetting)); setQrFile(null); setBankDraft(null)
    document.getElementById('payment-method-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function editBank(id: string) {
    setError(null); setMessage(null)
    const { data, error: queryError } = await supabase.from('payment_method_options').select('id, payment_method_id, name, masked_account_name, masked_account_number, qr_path, enabled, sort_order, updated_at').eq('id', id).single()
    if (queryError || !data) return setError(queryError?.message ?? 'The saved bank option could not be opened.')
    setBankDraft(bankToDraft(data as BankOption)); setBankQrFile(null)
    document.getElementById('bank-option-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function saveParent(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null)
    if (!draft.display_name.trim()) return setError('Enter a payment method name.')
    if (!isBankTransfer && (!draft.masked_account_name.trim() || !draft.masked_account_number.trim())) return setError('Enter masked recipient details.')
    if (!isBankTransfer && !draft.qr_path && !qrFile) return setError('Upload a QR image before saving this payment method.')
    setSaving(true)
    try {
      const { data: saved, error: saveError } = await supabase.from('payment_settings').upsert({ method: draft.method, display_name: draft.display_name.trim(), masked_account_name: isBankTransfer ? null : draft.masked_account_name.trim(), masked_account_number: isBankTransfer ? null : draft.masked_account_number.trim(), qr_path: isBankTransfer ? null : draft.qr_path || null, enabled: draft.enabled, updated_at: new Date().toISOString() }, { onConflict: 'method' }).select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled, updated_at').single()
      if (saveError || !saved) throw new Error(saveError?.message ?? 'The payment method could not be saved.')
      if (qrFile) await invokeQrFunction('upload', 'payment_method', saved.id, qrFile)
      const { data: verified, error: reloadError } = await supabase.from('payment_settings').select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled, updated_at').eq('id', saved.id).single()
      if (reloadError || !verified) throw new Error(reloadError?.message ?? 'Payment method saved, but the saved record could not be reloaded.')
      setDraft(parentToDraft(verified as PaymentSetting)); setQrFile(null); await load(); showSavedMessage()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Payment method could not be saved.') } finally { setSaving(false) }
  }

  async function saveBank(event: FormEvent) {
    event.preventDefault(); if (!bankDraft || !selectedParent) return
    setError(null); setMessage(null)
    if (!bankDraft.name.trim() || !bankDraft.masked_account_name.trim() || !bankDraft.masked_account_number.trim()) return setError('Enter the bank name and masked recipient details.')
    if (!bankDraft.qr_path && !bankQrFile) return setError('Upload a QR image before saving this bank.')
    setSaving(true)
    try {
      const { data: saved, error: saveError } = await supabase.from('payment_method_options').upsert({ id: bankDraft.id, payment_method_id: selectedParent.id, name: bankDraft.name.trim(), masked_account_name: bankDraft.masked_account_name.trim(), masked_account_number: bankDraft.masked_account_number.trim(), qr_path: bankDraft.qr_path || null, enabled: bankQrFile && !bankDraft.id ? false : bankDraft.enabled, sort_order: bankDraft.sort_order ?? bankOptions.length, updated_at: new Date().toISOString() }).select('id, payment_method_id, name, masked_account_name, masked_account_number, qr_path, enabled, sort_order, updated_at').single()
      if (saveError || !saved) throw new Error(saveError?.message ?? 'The bank option could not be saved.')
      if (bankQrFile) {
        await invokeQrFunction('upload', 'payment_method_option', saved.id, bankQrFile)
        const { error: enableError } = await supabase.from('payment_method_options').update({ enabled: bankDraft.enabled, updated_at: new Date().toISOString() }).eq('id', saved.id)
        if (enableError) throw new Error(`Bank QR uploaded, but the bank option could not be finalized: ${enableError.message}`)
      }
      const { data: verified, error: reloadError } = await supabase.from('payment_method_options').select('id, payment_method_id, name, masked_account_name, masked_account_number, qr_path, enabled, sort_order, updated_at').eq('id', saved.id).single()
      if (reloadError || !verified) throw new Error(reloadError?.message ?? 'Bank option saved, but the saved record could not be reloaded.')
      setBankDraft(null); setBankQrFile(null); await load(); showSavedMessage()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Bank option could not be saved.') } finally { setSaving(false) }
  }

  async function reorder(option: BankOption, direction: -1 | 1) {
    const index = bankOptions.findIndex((entry) => entry.id === option.id); const neighbor = bankOptions[index + direction]
    if (!neighbor) return
    setSaving(true); setError(null)
    const result = await Promise.all([supabase.from('payment_method_options').update({ sort_order: neighbor.sort_order, updated_at: new Date().toISOString() }).eq('id', option.id), supabase.from('payment_method_options').update({ sort_order: option.sort_order, updated_at: new Date().toISOString() }).eq('id', neighbor.id)])
    if (result.some((entry) => entry.error)) setError(result.find((entry) => entry.error)?.error?.message ?? 'Could not reorder bank options.')
    else { await load(); showSavedMessage() }
    setSaving(false)
  }

  async function removeBank(option: BankOption) {
    if (!window.confirm(`Remove ${option.name}? Its QR image will also be removed.`)) return
    setSaving(true); setError(null); setMessage(null)
    try { await invokeQrFunction('delete', 'payment_method_option', option.id); await load(); showSavedMessage() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Bank option could not be deleted.') } finally { setSaving(false) }
  }

  return <div className={styles.paymentSettings}>
    {message && <p className={styles.successMessage} role="status">{message}</p>}{error && <p className={styles.errorMessage} role="alert">{error}</p>}
    {message && <div className={styles.paymentPublish}><PublishWebsiteButton label="Publish Catalog" /></div>}
    <form id="payment-method-form" className={styles.form} onSubmit={saveParent}><section className={styles.formSection}><div className={styles.specificationHeader}><div><h2>{draft.id ? `Edit ${draft.display_name}` : 'Payment method'}</h2><p>{draft.id ? 'Update the saved method. Leave the QR file empty to keep the current QR.' : 'Save a method before making it available in checkout.'}</p></div>{draft.id && <button className={styles.secondaryButton} type="button" onClick={() => { setDraft(parentDefaults[draft.method]); setQrFile(null) }}>Cancel</button>}</div><div className={styles.fieldGrid}>
      <div className={styles.field}><label htmlFor="payment-method">Payment method</label><select id="payment-method" value={draft.method} onChange={(event) => { setDraft(parentDefaults[event.target.value as PaymentMethod]); setQrFile(null); setBankDraft(null); setError(null) }} disabled={saving}><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="cash_on_delivery">Cash on Delivery upfront fee</option></select></div>
      <div className={styles.field}><label htmlFor="payment-name">Payment method name</label><input id="payment-name" value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} disabled={saving} /></div>
      {!isBankTransfer && <><div className={styles.field}><label htmlFor="masked-name">Masked account name</label><input id="masked-name" placeholder="M******* M****" value={draft.masked_account_name} onChange={(event) => setDraft((current) => ({ ...current, masked_account_name: event.target.value }))} disabled={saving} /></div><div className={styles.field}><label htmlFor="masked-number">Masked number</label><input id="masked-number" placeholder="0917••••7305" value={draft.masked_account_number} onChange={(event) => setDraft((current) => ({ ...current, masked_account_number: event.target.value }))} disabled={saving} /></div><div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="payment-qr">Replace QR image</label><input id="payment-qr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event, setQrFile)} disabled={saving} /><span className={styles.slugHint}>{draft.qr_path ? 'No new file selected: the existing QR will be kept.' : 'JPG, PNG, or WebP. Maximum file size: 5 MB.'}</span>{draft.id && <QrPreview targetType="payment_method" targetId={draft.id} qrPath={draft.qr_path} updatedAt={settings.find((setting) => setting.id === draft.id)?.updated_at ?? ''} />}</div></>}
      {isBankTransfer && <p className={`${styles.slugHint} ${styles.fieldFull}`}>Enable this parent method only when at least one enabled bank option is ready below.</p>}
      <label className={`${styles.toggle} ${styles.fieldFull}`}><span><strong>Enabled for checkout</strong><span>Only enabled methods are visible to customers.</span></span><input className={styles.switch} type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} disabled={saving} /></label>
    </div></section><div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save payment method'}</button></div></form>
    {isBankTransfer && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Bank options</h2><span>Only enabled banks are visible in checkout.</span></div><button className={styles.secondaryButton} type="button" onClick={() => { if (!selectedParent) return setError('Save Bank Transfer before adding banks.'); setBankDraft(blankBank()); setBankQrFile(null) }}>Add bank</button></div>{!selectedParent ? <div className={styles.emptyState}>Save Bank Transfer first, then add banks.</div> : bankOptions.length === 0 ? <div className={styles.emptyState}>No bank options configured.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Preview</th><th>Bank</th><th>Recipient</th><th>Status</th><th>Actions</th></tr></thead><tbody>{bankOptions.map((option, index) => <tr key={option.id}><td><QrPreview targetType="payment_method_option" targetId={option.id} qrPath={option.qr_path ?? ''} updatedAt={option.updated_at} compact /></td><td>{option.name}</td><td>{option.masked_account_name}<br />{option.masked_account_number}</td><td><span className={styles.status}>{option.enabled ? 'Enabled' : 'Disabled'}</span></td><td className={styles.tableActions}><button className={styles.tableAction} type="button" onClick={() => void editBank(option.id)}>Edit</button><button className={styles.tableAction} type="button" disabled={index === 0 || saving} onClick={() => void reorder(option, -1)}>Up</button><button className={styles.tableAction} type="button" disabled={index === bankOptions.length - 1 || saving} onClick={() => void reorder(option, 1)}>Down</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" onClick={() => void removeBank(option)}>Delete</button></td></tr>)}</tbody></table></div>}</section>}
    {bankDraft && <form id="bank-option-form" className={styles.form} onSubmit={saveBank}><section className={styles.formSection}><div className={styles.specificationHeader}><div><h2>{bankDraft.id ? `Edit ${bankDraft.name}` : 'Add bank'}</h2><p>Leave the QR file empty to keep the current QR.</p></div><button className={styles.secondaryButton} type="button" onClick={() => setBankDraft(null)}>Cancel</button></div><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="bank-name">Bank name</label><input id="bank-name" value={bankDraft.name} onChange={(event) => setBankDraft((current) => current && ({ ...current, name: event.target.value }))} /></div><div className={styles.field}><label htmlFor="bank-qr">Replace QR image</label><input id="bank-qr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event, setBankQrFile)} /><span className={styles.slugHint}>{bankDraft.qr_path ? 'No new file selected: the existing QR will be kept.' : 'JPG, PNG, or WebP. Maximum file size: 5 MB.'}</span>{bankDraft.id && <QrPreview targetType="payment_method_option" targetId={bankDraft.id} qrPath={bankDraft.qr_path} updatedAt={options.find((option) => option.id === bankDraft.id)?.updated_at ?? ''} />}</div><div className={styles.field}><label htmlFor="bank-masked-name">Masked account name</label><input id="bank-masked-name" placeholder="M******* M****" value={bankDraft.masked_account_name} onChange={(event) => setBankDraft((current) => current && ({ ...current, masked_account_name: event.target.value }))} /></div><div className={styles.field}><label htmlFor="bank-masked-number">Masked account number</label><input id="bank-masked-number" placeholder="•••• •••• ••1234" value={bankDraft.masked_account_number} onChange={(event) => setBankDraft((current) => current && ({ ...current, masked_account_number: event.target.value }))} /></div><label className={`${styles.toggle} ${styles.fieldFull}`}><span><strong>Enabled for checkout</strong><span>Disabled bank options are never shown publicly.</span></span><input className={styles.switch} type="checkbox" checked={bankDraft.enabled} onChange={(event) => setBankDraft((current) => current && ({ ...current, enabled: event.target.checked }))} /></label></div></section><div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save bank'}</button></div></form>}
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Configured payment methods</h2><span>Saved records</span></div>{loading ? <div className={styles.emptyState}>Loading saved payment methods…</div> : settings.length === 0 ? <div className={styles.emptyState}>No payment methods are configured yet.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Preview</th><th>Method</th><th>Recipient</th><th>Status</th><th>Action</th></tr></thead><tbody>{settings.map((setting) => <tr key={setting.id}><td>{setting.method === 'bank_transfer' ? '—' : <QrPreview targetType="payment_method" targetId={setting.id} qrPath={setting.qr_path ?? ''} updatedAt={setting.updated_at} compact />}</td><td>{setting.display_name}</td><td>{setting.masked_account_name ?? 'Bank options' }<br />{setting.masked_account_number ?? ''}</td><td><span className={styles.status}>{setting.enabled ? 'Enabled' : 'Disabled'}</span></td><td><button className={styles.tableAction} type="button" onClick={() => void editParent(setting.id)}>Edit</button></td></tr>)}</tbody></table></div>}</section>
  </div>
}

function QrPreview({ targetType, targetId, qrPath, updatedAt, compact = false }: { targetType: TargetType; targetId: string; qrPath: string; updatedAt: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let live = true
    const timeout = window.setTimeout(() => { if (live) setStatus('error') }, 10000)
    setUrl(null); setStatus('loading')
    if (!qrPath) { setStatus('error'); window.clearTimeout(timeout); return () => { live = false } }
    async function loadPreview() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session')
        const form = new FormData(); form.set('action', 'preview'); form.set('target_type', targetType); form.set('target_id', targetId)
        const { data, error } = await supabase.functions.invoke('upload-payment-qr', { body: form, headers: { Authorization: `Bearer ${session.access_token}` } })
        if (error || !data?.signed_url) throw new Error(data?.error ?? 'Preview URL could not be generated.')
        if (live) setUrl(data.signed_url)
      } catch { if (live) setStatus('error') }
    }
    void loadPreview()
    return () => { live = false; window.clearTimeout(timeout) }
  }, [targetType, targetId, qrPath, updatedAt, retry])
  if (status === 'error') return <span className={styles.qrPreviewError}>QR preview unavailable.<button type="button" onClick={() => { setStatus('loading'); setRetry((value) => value + 1) }}>Retry</button></span>
  return <span className={compact ? styles.qrPreviewCompact : styles.qrPreview}>{status === 'loading' && <span>Loading…</span>}{url && <img src={url} alt="Saved payment QR preview" onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}</span>
}
