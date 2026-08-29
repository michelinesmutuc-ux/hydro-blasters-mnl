'use client'

import { supabase } from '../supabase/client'
import { productImageKeyFromUrl, PRODUCT_IMAGE_DELIVERY_ORIGIN } from './delivery'

export type ImageDiagnosticEvent = 'image_load_failed' | 'image_retry_started' | 'image_retry_succeeded' | 'image_retry_failed'
export type ImagePageContext = 'home' | 'shop' | 'product_detail' | 'gallery' | 'cart' | 'addon' | 'compare'

type ImageDiagnosticInput = {
  eventCode: ImageDiagnosticEvent
  pageContext: ImagePageContext
  src: string
  naturalWidth: number
  naturalHeight: number
  failureCount: number
  hydrated: boolean
}

const SESSION_ID_KEY = 'hydro-image-support-session'
const DEDUP_KEY = 'hydro-image-diagnostic-events'
const MAX_DEDUP_ENTRIES = 250
const sentThisDocument = new Set<string>()

function sessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY)
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
    const created = crypto.randomUUID()
    window.sessionStorage.setItem(SESSION_ID_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export function imageSupportCode() {
  return sessionId().replaceAll('-', '').slice(0, 8).toUpperCase()
}

function browserFamily() {
  const agent = navigator.userAgent
  if (/Edg\//i.test(agent)) return 'edge'
  if (/Firefox\//i.test(agent)) return 'firefox'
  if (/Chrome\//i.test(agent) || /CriOS\//i.test(agent)) return 'chrome'
  if (/Safari\//i.test(agent)) return 'safari'
  return 'other'
}

function deviceClass() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
}

function storedDedupKeys() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(DEDUP_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string').slice(-MAX_DEDUP_ENTRIES) : []
  } catch {
    return []
  }
}

function claimDiagnostic(key: string) {
  if (sentThisDocument.has(key)) return false
  const stored = storedDedupKeys()
  if (stored.includes(key)) return false
  sentThisDocument.add(key)
  try { window.sessionStorage.setItem(DEDUP_KEY, JSON.stringify([...stored, key].slice(-MAX_DEDUP_ENTRIES))) } catch {}
  return true
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function recordImageDiagnostic(input: ImageDiagnosticInput) {
  try {
    const objectKey = productImageKeyFromUrl(input.src)
    if (!objectKey) return
    const dedupKey = `${input.eventCode}|${input.pageContext}|${objectKey}`
    if (!claimDiagnostic(dedupKey)) return

    const imageHostname = new URL(PRODUCT_IMAGE_DELIVERY_ORIGIN).hostname
    const row = {
      session_id: sessionId(),
      event_code: input.eventCode,
      page_context: input.pageContext,
      pathname: window.location.pathname.slice(0, 160),
      object_key_hash: await sha256(objectKey),
      image_hostname: imageHostname,
      browser_family: browserFamily(),
      device_class: deviceClass(),
      online: navigator.onLine,
      natural_width: Math.max(0, Math.min(10000, Math.floor(input.naturalWidth))),
      natural_height: Math.max(0, Math.min(10000, Math.floor(input.naturalHeight))),
      failure_count: Math.max(1, Math.min(100, Math.floor(input.failureCount))),
      hydrated: input.hydrated,
      app_version: process.env.NEXT_PUBLIC_APP_VERSION?.slice(0, 64) || null,
    }
    const { error } = await supabase.from('image_diagnostics').insert(row)
    if (error) return
  } catch {
    // Image diagnostics must never affect rendering or recovery.
  }
}
