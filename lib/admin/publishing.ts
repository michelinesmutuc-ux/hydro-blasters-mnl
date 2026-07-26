export const WEBSITE_PUBLICATION_NEEDED_EVENT = 'hydro-website-publication-needed'
const WEBSITE_PUBLICATION_NEEDED_KEY = 'hydro-website-publication-needed'

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
