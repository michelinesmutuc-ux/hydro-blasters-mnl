'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { acceptedImageTypes } from '../../lib/supabase/product-images'
import styles from './admin.module.css'

type ProductImageUploaderProps = {
  files: File[]
  onFilesChange: (files: File[]) => void
  existingImageUrls?: string[]
  onExistingImageUrlsChange?: (urls: string[]) => void
  primaryFile?: File | null
  onPrimaryFileChange?: (file: File | null) => void
  disabled?: boolean
  progress: { completed: number; total: number } | null
  maxFiles?: number
  uploadTitle?: string
  uploadHint?: string
  previewLabel?: string
}

const acceptedTypes = new Set<string>(acceptedImageTypes)

export function ProductImageUploader({ files, onFilesChange, existingImageUrls = [], onExistingImageUrlsChange, primaryFile = null, onPrimaryFileChange, disabled = false, progress, maxFiles, uploadTitle = 'Drop images here or choose files', uploadHint = 'JPG, PNG, or WebP. Select multiple images; the first becomes the primary image.', previewLabel = 'product' }: ProductImageUploaderProps) {
  const inputId = useId()
  const [isDragging, setIsDragging] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files])
  const canSelectPrimary = maxFiles !== 1

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews])

  function addFiles(selectedFiles: FileList | File[]) {
    const newFiles = Array.from(selectedFiles)
    if (newFiles.some((file) => !acceptedTypes.has(file.type))) {
      setValidationError('Please use JPG, PNG, or WebP image files only.')
      return
    }
    setValidationError(null)
    const nextFiles = [...files, ...newFiles]
    onFilesChange(maxFiles ? nextFiles.slice(0, maxFiles) : nextFiles)
  }

  function removeFile(index: number) {
    const removedFile = files[index]
    if (primaryFile === removedFile) onPrimaryFileChange?.(null)
    onFilesChange(files.filter((_, currentIndex) => currentIndex !== index))
  }

  function removeExistingImage(index: number) {
    onExistingImageUrlsChange?.(existingImageUrls.filter((_, currentIndex) => currentIndex !== index))
  }

  function setExistingPrimary(index: number) {
    const next = [...existingImageUrls]
    if (index > 0) {
      const [selected] = next.splice(index, 1)
      next.unshift(selected)
    }
    onPrimaryFileChange?.(null)
    onExistingImageUrlsChange?.(next)
  }

  function setFilePrimary(index: number) {
    const selected = files[index]
    if (!selected) return
    if (existingImageUrls.length > 0) {
      onPrimaryFileChange?.(selected)
      return
    }
    if (index <= 0) return
    const next = [...files]
    const [selectedFile] = next.splice(index, 1)
    next.unshift(selectedFile)
    onPrimaryFileChange?.(null)
    onFilesChange(next)
  }

  return (
    <div className={styles.imageUpload}>
      <input id={inputId} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple={maxFiles !== 1} disabled={disabled} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = '' }} />
      <label htmlFor={inputId} className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''} ${disabled ? styles.dropzoneDisabled : ''}`} onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); if (!disabled) addFiles(event.dataTransfer.files) }}>
        <strong>{uploadTitle}</strong>
        <span>{uploadHint}</span>
      </label>
      {validationError && <p className={styles.imageError} role="alert">{validationError}</p>}
      {progress && <p className={styles.uploadProgress} role="status">Uploading image {progress.completed} of {progress.total}…</p>}
      {(existingImageUrls.length > 0 || previews.length > 0) && <div className={styles.previewGrid} aria-label={`Selected ${previewLabel} images`}>
        {existingImageUrls.map((url, index) => {
          const isPrimary = !primaryFile && index === 0
          return <article className={styles.previewCard} key={url}>
            <img src={url} alt={`Saved ${previewLabel} image ${index + 1}`} />
            {isPrimary
              ? <span className={styles.primaryImageLabel}>Primary</span>
              : canSelectPrimary && <button type="button" className={styles.removeImageButton} style={{ left: 8, right: 'auto', borderColor: '#72eaff', color: '#72eaff' }} disabled={disabled} onClick={() => setExistingPrimary(index)} aria-label={`Set saved ${previewLabel} image ${index + 1} as primary`}>Set as Primary</button>}
            <button type="button" className={styles.removeImageButton} disabled={disabled} onClick={() => removeExistingImage(index)} aria-label={`Remove saved ${previewLabel} image ${index + 1}`}>Remove</button>
          </article>
        })}
        {previews.map((preview, index) => {
          const isPrimary = primaryFile === preview.file || (!primaryFile && existingImageUrls.length === 0 && index === 0)
          return <article className={styles.previewCard} key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
            <img src={preview.url} alt={`Selected ${previewLabel} image ${index + 1}`} />
            {isPrimary
              ? <span className={styles.primaryImageLabel}>Primary</span>
              : canSelectPrimary && <button type="button" className={styles.removeImageButton} style={{ left: 8, right: 'auto', borderColor: '#72eaff', color: '#72eaff' }} disabled={disabled} onClick={() => setFilePrimary(index)} aria-label={`Set selected ${previewLabel} image ${index + 1} as primary`}>Set as Primary</button>}
            <button type="button" className={styles.removeImageButton} disabled={disabled} onClick={() => removeFile(index)} aria-label={`Remove selected ${previewLabel} image ${index + 1}`}>Remove</button>
          </article>
        })}
      </div>}
    </div>
  )
}
