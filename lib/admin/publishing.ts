export const WEBSITE_PUBLICATION_NEEDED_EVENT = 'hydro-website-publication-needed'
const WEBSITE_PUBLICATION_NEEDED_KEY = 'hydro-website-publication-needed'
const CATALOGUE_WRITE_PENDING_KEY = 'hydro-catalogue-write-pending'

export function hasUnpublishedWebsiteChanges() {
  return typeof window !== 'undefined' && window.localStorage.getItem(WEBSITE_PUBLICATION_NEEDED_KEY) === 'true'
}

export function markWebsiteChangesUnpublished() {
  window.localStorage.setItem(WEBSITE_PUBLICATION_NEEDED_KEY, 'true')
  window.dispatchEvent(new Event(WEBSITE_PUBLICATION_NEEDED_EVENT))
}

export function markWebsiteChangesPublished() {
  window.localStorage.removeItem(WEBSITE_PUBLICATION_NEEDED_KEY)
  window.dispatchEvent(new Event(WEBSITE_PUBLICATION_NEEDED_EVENT))
}

export function markCatalogueWritePending() {
  window.sessionStorage.setItem(CATALOGUE_WRITE_PENDING_KEY, 'true')
}

export function markCatalogueWriteComplete() {
  window.sessionStorage.removeItem(CATALOGUE_WRITE_PENDING_KEY)
}

export function isCatalogueWritePending() {
  return window.sessionStorage.getItem(CATALOGUE_WRITE_PENDING_KEY) === 'true'
}
