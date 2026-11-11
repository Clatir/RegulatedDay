/**
 * A link of a note (D388, T663): only http and https open (in the default browser); the window checks it before asking
 * the main process, the main process checks it again before `shell.openExternal`. Anything else stays text.
 */
export function safeLinkUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
}
