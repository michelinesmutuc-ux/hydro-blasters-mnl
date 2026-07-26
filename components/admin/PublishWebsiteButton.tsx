'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import styles from './admin.module.css'

export function PublishWebsiteButton() {
  const [isPublishing, setIsPublishing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function publishWebsite() {
    setIsPublishing(true)
    setMessage(null)
    setError(null)

    try {
      const { error: invokeError } = await supabase.functions.invoke('publish-website', { body: {} })
      if (invokeError) throw invokeError
      setMessage('Website deployment started. Changes should be live after Cloudflare finishes the build.')
    } catch {
      setError('Publishing could not be started. Sign in as an authorized admin and try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className={styles.publishControl}>
      <button type="button" className={styles.secondaryButton} disabled={isPublishing} onClick={publishWebsite}>
        {isPublishing ? 'Publishing…' : 'Publish Website'}
      </button>
      <p>Saved product changes stay in Supabase. Publishing rebuilds the public static product pages.</p>
      {message && <p className={styles.publishSuccess} role="status">{message}</p>}
      {error && <p className={styles.publishError} role="alert">{error}</p>}
    </div>
  )
}
