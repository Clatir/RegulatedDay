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
/** The most of a tag's inside its attributes are read from (a longer one – its start): the attribute pattern backtracks. */
const TAG_INSIDE_MAX = 2048

/** The attributes of a tag's inside (`<meta …>`), names in lower case – of its first `TAG_INSIDE_MAX` characters. */
function attrsOf(inside: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of inside.slice(0, TAG_INSIDE_MAX).matchAll(ATTR)) {
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

/** Elements whose content is no markup (a „<title>” inside a script is no title). */
const RAW_TEXT = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'xmp'])
const isLetter = (c: number) => (c >= 97 && c <= 122) || (c >= 48 && c <= 57)
/** After a tag's name: a space, „/”, „>” or the end – „<titlex>” is no title. */
const endsName = (c: string | undefined) => c === undefined || c === '>' || c === '/' || /^[ \t\n\r\f]$/.test(c)

/** A tag's name in lower case at `at` (after „<”), at most 16 letters; '' – none. */
function nameAt(lower: string, at: number): string {
  let e = at
  while (e < lower.length && e - at < 16 && isLetter(lower.charCodeAt(e))) e++
  return e > at && endsName(lower[e]) ? lower.slice(at, e) : ''
}

/**
 * The tags `<base>`, `<meta>` and `<link>` and the first `<title>` of a page outside comments and raw-text elements, in one
 * pass from start to end (T834): every search goes forward, and an opening that is never closed (a comment, a script, a
 * tag without „>”) ends the reading – hostile markup never costs more than its length.
 */
function scanPage(html: string): { tags: Array<{ name: string; inside: string }>; title: string | null } {
  // ASCII letters only to lower case: the same length, so indices stay.
  const lower = html.replace(/[A-Z]+/g, (m) => m.toLowerCase())
  const tags: Array<{ name: string; inside: string }> = []
  let title: string | null = null
  for (let i = 0; i < lower.length; ) {
    const lt = lower.indexOf('<', i)
    if (lt < 0) break
    if (lower.startsWith('<!--', lt)) {
      const end = lower.indexOf('-->', lt + 4)
      if (end < 0) break
      i = end + 3
      continue
    }
    const name = nameAt(lower, lt + 1)
    if (!name) {
      i = lt + 1
      continue
    }
    const gt = lower.indexOf('>', lt + 1 + name.length)
    if (gt < 0) break
    if (RAW_TEXT.has(name) || name === 'title') {
      const close = lower.indexOf(`</${name}`, gt + 1)
      if (close < 0) break
      if (name === 'title' && title == null) title = html.slice(gt + 1, close)
      i = close + 2 + name.length
      continue
    }
    if (name === 'base' || name === 'meta' || name === 'link') tags.push({ name, inside: html.slice(lt + 1 + name.length, gt) })
    i = gt + 1
  }
  return { tags, title }
}

/**
 * The title and the icons of a page (`pageUrl` – where it was read from, after redirects): `og:title` before `<title>`
 * (sites put their name into the second), comments and scripts skipped; icons of `<link rel="icon">` (and „shortcut icon”,
 * „apple-touch-icon”) that are no SVG, then /favicon.ico of the page's origin. Linear in the page's length (T834).
 */
export function parsePageMeta(html: string, pageUrl: string): PageMeta {
  const page = scanPage(html)
  let base = pageUrl
  let og: string | null = null
  const icons: string[] = []
  for (const { name: tag, inside } of page.tags) {
    const a = attrsOf(inside)
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
  const title = og ?? (page.title != null ? cleanTitle(page.title) : null)
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
  const fromMeta = /<meta[^>]{0,256}?charset\s*=\s*["']?([\w.:-]+)/i.exec(start)?.[1]
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
