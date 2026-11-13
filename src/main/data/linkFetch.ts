/**
 * The title and icon of a page for a link attachment (D410, T807), from the network: in the main process only, through a
 * session of its own without cookies, cache or anything kept (`session.fromPartition` without „persist:” – `index.ts`
 * gives its `fetch`), about 5 s for the page and as much for the icon, at most 512 KB of the page and 64 KB of an icon.
 * Redirects (T835): Electron's `session.fetch` refuses a redirect with `redirect: 'manual'` instead of answering it, so the
 * network stack follows them (`follow` – Chromium goes only to http and https, at most 20 times) and where it ended is
 * checked to be http or https; a fetch that answers a redirect itself (3xx) is followed by hand, at most `MAX_REDIRECTS`.
 * What is read is pure work of `shared/linkMeta.ts`. Any failure is no title (null) – the link keeps its host, without a
 * message.
 */
import { ICON_BYTES_MAX, PAGE_BYTES_MAX, iconDataUrl, pageText, parsePageMeta } from '@shared/linkMeta'

/** A `fetch` of the session of its own (tests: a fake one; never the real network in tests). */
export type Fetcher = (url: string, init: { redirect: 'follow'; signal: AbortSignal; credentials: 'omit'; cache: 'no-store'; headers: Record<string, string> }) => Promise<Response>

export const META_TIMEOUT_MS = 5000
export const MAX_REDIRECTS = 4
/** Icons tried at most (the page's own first, /favicon.ico last). */
const ICONS_TRIED = 3

const isHttp = (u: string): boolean => {
  try {
    const p = new URL(u).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

/** The first `max` bytes of a body (the rest is not read: the stream is cancelled); more than `max` – `over`. */
async function readUpTo(res: Response, max: number): Promise<{ bytes: Uint8Array; over: boolean }> {
  const reader = res.body?.getReader()
  if (!reader) return { bytes: new Uint8Array(), over: false }
  const parts: Uint8Array[] = []
  let n = 0
  let over = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      n += value.length
      if (n > max) {
        over = true
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const out = new Uint8Array(Math.min(n, max + 1))
  let at = 0
  for (const p of parts) {
    const take = Math.min(p.length, out.length - at)
    out.set(p.subarray(0, take), at)
    at += take
    if (at >= out.length) break
  }
  return { bytes: out, over }
}

/** A GET whose redirects the fetch follows (or – one that answers them – by hand, at most `MAX_REDIRECTS`), each to http or https; null – not 2xx there. */
async function get(fetcher: Fetcher, url: string, signal: AbortSignal, accept: string): Promise<{ res: Response; url: string | null } | null> {
  let at = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isHttp(at)) return null
    const res = await fetcher(at, { redirect: 'follow', signal, credentials: 'omit', cache: 'no-store', headers: { Accept: accept } })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      await res.body?.cancel().catch(() => undefined)
      if (!next) return null
      at = new URL(next, at).href
      continue
    }
    // A fetch that followed by itself: where it ended must be http(s) too.
    if (res.type === 'opaqueredirect' || !res.ok || (res.url && !isHttp(res.url))) {
      await res.body?.cancel().catch(() => undefined)
      return null
    }
    // Where it ended is known only from the answer (T835): Electron's may have none after following – then no address
    // relative to the page is guessed from the one asked for.
    return { res, url: res.url || null }
  }
  return null
}

/** `fn` with a signal that aborts after `ms`; its rejection (also the abort's) is null. */
async function within<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fn(ctl.signal)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The page's title and its icon (as a data URL of a raster image); null – nothing could be read. */
export async function fetchPageMeta(fetcher: Fetcher, url: string, timeoutMs = META_TIMEOUT_MS): Promise<{ title: string | null; iconDataUrl: string | null } | null> {
  if (!isHttp(url)) return null
  const page = await within(timeoutMs, async (signal) => {
    const got = await get(fetcher, url, signal, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1')
    if (!got) return null
    const type = got.res.headers.get('content-type')
    if (type && !/html|xml/i.test(type)) {
      await got.res.body?.cancel().catch(() => undefined)
      return { meta: { title: null, icons: got.url ? [new URL('/favicon.ico', got.url).href] : [] } }
    }
    const { bytes } = await readUpTo(got.res, PAGE_BYTES_MAX)
    return { meta: parsePageMeta(pageText(bytes.subarray(0, PAGE_BYTES_MAX), type), got.url) }
  })
  if (!page) return null
  const icon = await within(timeoutMs, async (signal) => {
    for (const href of page.meta.icons.slice(0, ICONS_TRIED)) {
      const got = await get(fetcher, href, signal, 'image/png,image/x-icon,image/*;q=0.8').catch(() => null)
      if (!got) continue
      const { bytes, over } = await readUpTo(got.res, ICON_BYTES_MAX)
      const data = over ? null : iconDataUrl(bytes)
      if (data) return data
    }
    return null
  })
  return { title: page.meta.title, iconDataUrl: icon }
}
