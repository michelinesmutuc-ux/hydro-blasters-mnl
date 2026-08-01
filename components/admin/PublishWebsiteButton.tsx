'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { requireAdminSession } from '../../lib/admin/auth'
import { hasUnpublishedWebsiteChanges, isCatalogueWritePending, markWebsiteChangesPublished, WEBSITE_PUBLICATION_NEEDED_EVENT } from '../../lib/admin/publishing'
import styles from './admin.module.css'

export function PublishWebsiteButton({ label = 'Publish Website' }: { label?: string }) {
  const [isPublishing, setIsPublishing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false)

  useEffect(() => {
    function updatePublicationState() {
      setHasUnpublishedChanges(hasUnpublishedWebsiteChanges())
    }

    updatePublicationState()
    window.addEventListener(WEBSITE_PUBLICATION_NEEDED_EVENT, updatePublicationState)
    window.addEventListener('storage', updatePublicationState)
    return () => {
      window.removeEventListener(WEBSITE_PUBLICATION_NEEDED_EVENT, updatePublicationState)
      window.removeEventListener('storage', updatePublicationState)
    }
  }, [])

  async function publishWebsite() {
    setIsPublishing(true)
    setMessage(null)
    setError(null)

    try {
      if (isCatalogueWritePending()) throw new Error('Product changes are still saving. Wait for Save to finish before publishing.')
      console.log('[Hydro Blasters MNL] Publish started:', new Date().toISOString())
      const session = await requireAdminSession()
      const { error: invokeError } = await supabase.functions.invoke('publish-website', {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (invokeError) {
        const response = (invokeError as { context?: Response }).context
        let reason = invokeError.message
        if (response) {
          try {
            const body = await response.json() as { error?: string }
            reason = body.error ?? reason
          } catch {
            if (response.status === 404) reason = 'The publishing function is not deployed yet.'
          }
        }
        throw new Error(reason)
      }
      markWebsiteChangesPublished()
      setMessage('Website deployment started.\n\nYour changes will become public after Cloudflare finishes building.')
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Publishing could not be started.')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className={styles.publishControl}>
      <button type="button" className={styles.secondaryButton} disabled={isPublishing} onClick={publishWebsite}>
        {isPublishing ? 'Publishing...' : label}
      </button>
      <p>Saved product changes stay in Supabase. Publishing rebuilds the public static product pages.</p>
      {hasUnpublishedChanges && <p className={styles.publishWarning} role="status">⚠️ You have unpublished website changes.</p>}
      {isPublishing && <p className={styles.publishStatus} role="status">Publishing website...</p>}
      {message && <p className={styles.publishSuccess} role="status">{message}</p>}
      {error && <p className={styles.publishError} role="alert">{error}</p>}
    </div>
  )
}
