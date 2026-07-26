'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import { hasUnpublishedWebsiteChanges, markWebsiteChangesPublished, WEBSITE_PUBLICATION_NEEDED_EVENT } from '../../lib/admin/publishing'
import styles from './admin.module.css'

export function PublishWebsiteButton() {
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
      const { error: invokeError } = await supabase.functions.invoke('publish-website', { body: {} })
      if (invokeError) throw invokeError
      markWebsiteChangesPublished()
      setMessage('Website deployment started.\n\nYour changes will become public after Cloudflare finishes building.')
    } catch {
      setError('Publishing could not be started. Sign in as an authorized admin and try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className={styles.publishControl}>
      <button type="button" className={styles.secondaryButton} disabled={isPublishing} onClick={publishWebsite}>
        {isPublishing ? 'Publishing...' : 'Publish Website'}
      </button>
      <p>Saved product changes stay in Supabase. Publishing rebuilds the public static product pages.</p>
      {hasUnpublishedChanges && <p className={styles.publishWarning} role="status">⚠️ You have unpublished website changes.</p>}
      {isPublishing && <p className={styles.publishStatus} role="status">Publishing website...</p>}
      {message && <p className={styles.publishSuccess} role="status">{message}</p>}
      {error && <p className={styles.publishError} role="alert">{error}</p>}
    </div>
  )
}
