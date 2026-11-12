/**
 * The title and the icon of a page for a link attachment (D410, T807) – pure: the main process fetches the page and its
 * icon (`main/data/linkFetch.ts`), this reads them. The page's text is never trusted: only its title (`og:title`, then
 * `<title>`) as plain text, and the address of an icon – which is fetched only over http or https and kept only when its
 * bytes are a raster image (never SVG, whose scripts and links a data URL would carry).
 */
/** The most of a page read for its title (the head comes first). */
export const PAGE_BYTES_MAX = 512 * 1024
/** The largest icon kept in the record. */
export const ICON_BYTES_MAX = 64 * 1024
/** The longest title kept. */
export const TITLE_MAX = 160

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', bdquo: '„', rdquo: '”', ldquo: '“', rsquo: '’', lsquo: '‘', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™' }

/** HTML character references as text (numeric ones and the common named ones; an unknown one stays as written). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return m
      return String.fromCodePoint(code)
    }
    return NAMED[ref.toLowerCase()] ?? m
  })
}

/** A title as plain text: references decoded, no control characters, whitespace as single spaces, cut to `TITLE_MAX`. */
export function cleanTitle(raw: string): string | null {
  const t = decodeEntities(raw)
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return null
  const points = Array.from(t)
  return points.length > TITLE_MAX ? `${points.slice(0, TITLE_MAX - 1).join('').trimEnd()}…` : t
}

const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g

/** The attributes of a tag's inside (`<meta …>`), names in lower case. */
function attrsOf(inside: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of inside.matchAll(ATTR)) {
    const k = m[1]!.toLowerCase()
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

export interface PageMeta {
  title: string | null
  /** Addresses of icons to try, the best first (http/https only), the site's /favicon.ico last. */
  icons: string[]
}

const httpUrl = (href: string, base: string): string | null => {
  try {
    const u = new URL(decodeEntities(href.trim()), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * The title and the icons of a page (`pageUrl` – where it was read from, after redirects): `og:title` before `<title>`
 * (sites put their name into the second), comments and scripts skipped; icons of `<link rel="icon">` (and „shortcut icon”,
 * „apple-touch-icon”) that are no SVG, then /favicon.ico of the page's origin.
 */
export function parsePageMeta(html: string, pageUrl: string): PageMeta {
  const text = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  let base = pageUrl
  let og: string | null = null
  const icons: string[] = []
  for (const m of text.matchAll(/<(base|meta|link)\b([^>]*)>/gi)) {
    const tag = m[1]!.toLowerCase()
    const a = attrsOf(m[2]!)
    if (tag === 'base' && a.href) base = httpUrl(a.href, pageUrl) ?? base
    else if (tag === 'meta' && og == null && (a.property ?? a.name ?? '').toLowerCase() === 'og:title' && a.content) og = cleanTitle(a.content)
    else if (tag === 'link' && a.href) {
      const rel = (a.rel ?? '').toLowerCase().split(/\s+/)
      if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) continue
      if ((a.type ?? '').toLowerCase().includes('svg') || /\.svgz?(?:[?#]|$)/i.test(a.href)) continue
      const u = httpUrl(a.href, base)
      if (u && !icons.includes(u)) icons.push(u)
    }
  }
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(text)
  const title = og ?? (t ? cleanTitle(t[1]!) : null)
  try {
    const fav = new URL('/favicon.ico', pageUrl).href
    if (/^https?:/.test(fav) && !icons.includes(fav)) icons.push(fav)
  } catch {
    /* no origin */
  }
  return { title, icons }
}

/** The character set a page says it is in (its header, then a `<meta charset>` of its start); utf-8 by default. */
export function charsetOf(contentType: string | null, head: Uint8Array): string {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1]
  if (fromHeader) return fromHeader.toLowerCase()
  const start = new TextDecoder('latin1').decode(head.subarray(0, 2048))
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(start)?.[1]
  return (fromMeta ?? 'utf-8').toLowerCase()
}

/** The page's bytes as text in its character set (an unknown one – utf-8). */
export function pageText(bytes: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** The kind of a raster image by its first bytes (never by what the server says); null – no image this keeps (SVG too). */
export function imageKindOf(b: Uint8Array): 'png' | 'gif' | 'jpeg' | 'webp' | 'bmp' | 'x-icon' | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x)
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png'
  if (b.length >= 6 && at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'gif'
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'jpeg'
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp'
  if (b.length >= 14 && at(0, 0x42, 0x4d)) return 'bmp'
  if (b.length >= 6 && at(0, 0x00, 0x00, 0x01, 0x00) && (b[4]! | (b[5]! << 8)) > 0) return 'x-icon'
  return null
}

const base64 = (b: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** The icon kept in the record: a raster image of at most `ICON_BYTES_MAX` as a data URL of its own kind; else null. */
export function iconDataUrl(bytes: Uint8Array): string | null {
  if (!bytes.length || bytes.length > ICON_BYTES_MAX) return null
  const kind = imageKindOf(bytes)
  return kind ? `data:image/${kind};base64,${base64(bytes)}` : null
}
