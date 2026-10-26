/**
 * The app's address (spec „Powiadomienia i dźwięki”): a notification's click opens the icon's panel on its line, also
 * after a restart – `regulatedday://panel?line=<id>&day=<RRRR-MM-DD>`. The address only opens a view, never changes
 * anything, and the command line gives the app only an address in this exact format; anything else is ignored.
 */
export interface PanelTarget {
  line: string | null
  day: string | null
}

const LINE = /^[a-z0-9][a-z0-9-]{0,63}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The target of an address of `scheme`; null = not an address of the app (or not in its exact format). */
export function parseAppUrl(text: string, scheme: string): PanelTarget | null {
  if (text.length > 200) return null
  const prefix = `${scheme}://panel`
  if (!text.startsWith(prefix)) return null
  const rest = text.slice(prefix.length).replace(/^\/(?=\?|$)/, '')
  if (rest === '') return { line: null, day: null }
  if (!rest.startsWith('?')) return null
  const target: PanelTarget = { line: null, day: null }
  for (const part of rest.slice(1).split('&')) {
    const [k, v, ...more] = part.split('=')
    if (more.length || v === undefined) return null
    if (k === 'line' && LINE.test(v) && target.line == null) target.line = v
    else if (k === 'day' && DAY.test(v) && target.day == null) target.day = v
    else return null
  }
  return target
}

/** The address of a panel's line (a notification's activation). */
export function appUrl(scheme: string, target: PanelTarget): string {
  const q = [target.line ? `line=${target.line}` : null, target.day ? `day=${target.day}` : null].filter(Boolean).join('&')
  return `${scheme}://panel${q ? `?${q}` : ''}`
}

/** The one address in a command line (Windows passes it as an argument); more than one, or none: null. */
export function urlFromArgv(argv: readonly string[], scheme: string): PanelTarget | null {
  const found = argv.filter((a) => a.startsWith(`${scheme}:`))
  if (found.length !== 1) return null
  return parseAppUrl(found[0]!, scheme)
}
