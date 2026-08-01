'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash_on_delivery'
type PaymentSetting = {
  id: string
  method: PaymentMethod
  display_name: string
  masked_account_name: string
  masked_account_number: string
  qr_path: string
  enabled: boolean
}

type Draft = Omit<PaymentSetting, 'id'>

const blankDraft: Draft = {
  method: 'gcash',
  display_name: 'GCash',
  masked_account_name: '',
  masked_account_number: '',
  qr_path: '',
  enabled: false,
}

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export function PaymentSettings() {
  const [settings, setSettings] = useState<PaymentSetting[]>([])
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadSettings() {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('payment_settings')
      .select('id, method, display_name, masked_account_name, masked_account_number, qr_path, enabled')
      .order('method')
    if (queryError) setError(queryError.message)
    else setSettings((data ?? []) as PaymentSetting[])
    setLoading(false)
  }

  useEffect(() => { void loadSettings() }, [])

  function chooseMethod(method: PaymentMethod) {
    const existing = settings.find((setting) => setting.method === method)
    setDraft(existing ? { ...existing } : {
      ...blankDraft,
      method,
      display_name: method === 'gcash' ? 'GCash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Cash on Delivery',
    })
    setQrFile(null)
    setMessage(null)
    setError(null)
  }

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) return setQrFile(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('QR image must be a JPG, PNG, or WebP file.')
      event.target.value = ''
      return
    }
    setError(null)
    setQrFile(file)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!draft.display_name.trim() || !draft.masked_account_name.trim() || !draft.masked_account_number.trim()) {
      setError('Enter a payment name and masked recipient details.')
      return
    }
    if (!draft.qr_path && !qrFile) {
      setError('Upload a QR image before saving this payment method.')
      return
    }

    setSaving(true)
    let qrPath = draft.qr_path
    try {
      if (qrFile) {
        qrPath = `settings/${draft.method}-${crypto.randomUUID()}.${extensionFor(qrFile)}`
        const { error: uploadError } = await supabase.storage.from('payment-qrs').upload(qrPath, qrFile, { contentType: qrFile.type, upsert: false })
        if (uploadError) throw uploadError
      }
      const { error: saveError } = await supabase
        .from('payment_settings')
        .upsert({ ...draft, qr_path: qrPath, updated_at: new Date().toISOString() }, { onConflict: 'method' })
      if (saveError) throw saveError
      if (qrFile && draft.qr_path && draft.qr_path !== qrPath) await supabase.storage.from('payment-qrs').remove([draft.qr_path])
      setDraft((current) => ({ ...current, qr_path: qrPath }))
      setQrFile(null)
      setMessage('Payment setting saved.')
      await loadSettings()
    } catch (saveError) {
      if (qrFile && qrPath && qrPath !== draft.qr_path) await supabase.storage.from('payment-qrs').remove([qrPath])
      setError(saveError instanceof Error ? saveError.message : 'Payment setting could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function removeSetting(setting: PaymentSetting) {
    if (!window.confirm(`Remove ${setting.display_name}? This will also remove its QR image.`)) return
    setError(null)
    setMessage(null)
    const { error: deleteError } = await supabase.from('payment_settings').delete().eq('id', setting.id)
    if (deleteError) return setError(deleteError.message)
    if (setting.qr_path) await supabase.storage.from('payment-qrs').remove([setting.qr_path])
    setMessage('Payment setting removed.')
    if (draft.method === setting.method) setDraft({ ...blankDraft, method: setting.method })
    await loadSettings()
  }

  return <div className={styles.paymentSettings}>
    {message && <p className={styles.successMessage} role="status">{message}</p>}
    {error && <p className={styles.errorMessage} role="alert">{error}</p>}
    <form className={styles.form} onSubmit={save}>
      <section className={styles.formSection}>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="payment-method">Payment method</label>
            <select id="payment-method" value={draft.method} onChange={(event) => chooseMethod(event.target.value as PaymentMethod)} disabled={saving}>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash_on_delivery">Cash on Delivery upfront fee</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="payment-name">Payment method name</label>
            <input id="payment-name" value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} disabled={saving} />
          </div>
          <div className={styles.field}>
            <label htmlFor="masked-name">Masked account name</label>
            <input id="masked-name" placeholder="M******* M****" value={draft.masked_account_name} onChange={(event) => setDraft((current) => ({ ...current, masked_account_name: event.target.value }))} disabled={saving} />
          </div>
          <div className={styles.field}>
            <label htmlFor="masked-number">Masked number</label>
            <input id="masked-number" placeholder="0917••••7305" value={draft.masked_account_number} onChange={(event) => setDraft((current) => ({ ...current, masked_account_number: event.target.value }))} disabled={saving} />
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label htmlFor="payment-qr">Payment QR image</label>
            <input id="payment-qr" type="file" accept="image/jpeg,image/png,image/webp" onChange={changeFile} disabled={saving} />
            <span className={styles.slugHint}>JPG, PNG, or WebP. Upload a clean QR image with whitespace around the code.</span>
          </div>
          <label className={`${styles.toggle} ${styles.fieldFull}`}>
            <span><strong>Enabled for checkout</strong><span>Only enabled methods are shown to customers.</span></span>
            <input className={styles.switch} type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} disabled={saving} />
          </label>
        </div>
      </section>
      <div className={styles.formActions}><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save payment setting'}</button></div>
    </form>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><h2>Configured methods</h2><span>Masked details only</span></div>
      {loading ? <div className={styles.emptyState}>Loading payment settings…</div> : settings.length === 0 ? <div className={styles.emptyState}>No payment methods are configured yet.</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Method</th><th>Recipient</th><th>QR</th><th>Status</th><th>Action</th></tr></thead><tbody>{settings.map((setting) => <tr key={setting.id}><td>{setting.display_name}</td><td>{setting.masked_account_name}<br />{setting.masked_account_number}</td><td>{setting.qr_path ? 'Configured' : 'Missing'}</td><td><span className={styles.status}>{setting.enabled ? 'Enabled' : 'Disabled'}</span></td><td className={styles.tableActions}><button className={styles.tableAction} type="button" onClick={() => chooseMethod(setting.method)}>Edit</button><button className={`${styles.tableAction} ${styles.deleteAction}`} type="button" onClick={() => void removeSetting(setting)}>Remove</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>
}
