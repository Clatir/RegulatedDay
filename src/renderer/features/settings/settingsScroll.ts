/**
 * Bringing a part of the settings page into view (UX14): the table of contents, the box „Szukaj w ustawieniach” and Ctrl K all
 * end here. A section or a group's heading goes to the top of the window (their boxes keep a margin under the bar „od jutra”),
 * a field to the middle and stays marked (`data-found`, an outline – no animation, so it shows with the animations off too) for
 * a moment.
 */
const FOUND_MS = 2200

/** The id is the test id of a section, a group's heading or a field's row; false: it is not on the page now. */
export function scrollToSetting(id: string): boolean {
  const el = document.querySelector(`[data-testid="${id}"]`)
  if (!el) return false
  const field = id.startsWith('field-')
  el.scrollIntoView({ block: field ? 'center' : 'start' })
  if (field) {
    el.setAttribute('data-found', '')
    window.setTimeout(() => el.removeAttribute('data-found'), FOUND_MS)
  }
  return true
}
