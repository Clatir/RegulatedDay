/**
 * The title and icon of a page from the network (D410, T807) – on a fake `fetch` (never the real network): redirects by
 * hand, each to http or https and a few at most, at most 512 KB of the page, an icon kept only as a raster image of at
 * most 64 KB, a time limit, any failure – nothing.
 */
import { describe, expect, it } from 'vitest'
import { MAX_REDIRECTS, fetchPageMeta, type Fetcher } from '../../src/main/data/linkFetch'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const html = (body: string, type = 'text/html; charset=utf-8') => new Response(body, { status: 200, headers: { 'content-type': type } })
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })

/** A fake network: the answer for each address (a function – made per request), the requests in order. */
function net(routes: Record<string, () => Response | Promise<Response>>): { fetcher: Fetcher; asked: string[]; inits: unknown[] } {
  const asked: string[] = []
  const inits: unknown[] = []
  const fetcher: Fetcher = async (url, init) => {
    asked.push(url)
    inits.push(init)
    const r = routes[url]
    if (!r) return new Response('nie ma', { status: 404 })
    return r()
  }
  return { fetcher, asked, inits }
}

describe('pobranie tytułu i ikony (T807)', () => {
  it('tytuł i ikona strony; zapytanie bez ciasteczek i pamięci', async () => {
    const n = net({
      'https://example.com/a': () => html('<html><head><title>Przykład – strona</title><link rel="icon" href="/i.png"></head></html>'),
      'https://example.com/i.png': () => new Response(PNG, { headers: { 'content-type': 'text/plain' } })
    })
    expect(await fetchPageMeta(n.fetcher, 'https://example.com/a')).toEqual({ title: 'Przykład – strona', iconDataUrl: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}` })
    expect(n.inits[0]).toMatchObject({ redirect: 'follow', credentials: 'omit', cache: 'no-store' })
  })

  it('przekierowanie do innego protokołu albo więcej niż kilka – nic', async () => {
    const toFile = net({ 'https://e.com/': () => redirect('file:///C:/Windows/win.ini') })
    expect(await fetchPageMeta(toFile.fetcher, 'https://e.com/')).toBeNull()
    expect(toFile.asked).toEqual(['https://e.com/'])
    const routes: Record<string, () => Response> = {}
    for (let i = 0; i <= MAX_REDIRECTS + 1; i++) routes[`https://e.com/${i}`] = () => redirect(`/${i + 1}`)
    const loop = net(routes)
    expect(await fetchPageMeta(loop.fetcher, 'https://e.com/0')).toBeNull()
    expect(loop.asked).toHaveLength(MAX_REDIRECTS + 1)
    const ok = net({ 'http://e.com/': () => redirect('https://e.com/x'), 'https://e.com/x': () => html('<title>Po przekierowaniu</title>') })
    expect((await fetchPageMeta(ok.fetcher, 'http://e.com/'))!.title).toBe('Po przekierowaniu')
  })

  it('czyta najwyżej 512 KB strony: tytuł dalej się nie liczy', async () => {
    const n = net({ 'https://e.com/': () => html(`<html>${' '.repeat(600 * 1024)}<title>Za daleko</title></html>`) })
    expect(await fetchPageMeta(n.fetcher, 'https://e.com/')).toEqual({ title: null, iconDataUrl: null })
  })

  it('ikona: SVG, za duża albo nie obraz – bez ikony; tytuł zostaje', async () => {
    const big = new Uint8Array(70 * 1024)
    big.set(PNG)
    const n = net({
      'https://e.com/': () => html('<title>T</title><link rel="icon" href="/a.png"><link rel="icon" href="/b.ico">'),
      'https://e.com/a.png': () => new Response(big),
      'https://e.com/b.ico': () => new Response('<svg onload="alert(1)"/>', { headers: { 'content-type': 'image/x-icon' } }),
      'https://e.com/favicon.ico': () => new Response('<html>')
    })
    expect(await fetchPageMeta(n.fetcher, 'https://e.com/')).toEqual({ title: 'T', iconDataUrl: null })
  })

  it('błąd sieci, odpowiedź nie 2xx, przekroczony czas – nic, bez wyjątku', async () => {
    expect(await fetchPageMeta(async () => Promise.reject(new Error('ENOTFOUND')), 'https://e.com/')).toBeNull()
    expect(await fetchPageMeta(net({ 'https://e.com/': () => new Response('x', { status: 500 }) }).fetcher, 'https://e.com/')).toBeNull()
    const slow: Fetcher = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    expect(await fetchPageMeta(slow, 'https://e.com/', 20)).toBeNull()
    expect(await fetchPageMeta(net({}).fetcher, 'javascript:alert(1)')).toBeNull()
  })

  it('nie HTML (PDF) – bez tytułu, ikona strony z /favicon.ico', async () => {
    const n = net({ 'https://e.com/plik.pdf': () => html('%PDF', 'application/pdf'), 'https://e.com/favicon.ico': () => new Response(PNG) })
    expect(await fetchPageMeta(n.fetcher, 'https://e.com/plik.pdf')).toMatchObject({ title: null, iconDataUrl: expect.stringMatching(/^data:image\/png/) })
  })
})

/**
 * A fetch that behaves like Electron's `session.fetch` (T835): with `redirect: 'manual'` a redirect is refused („Redirect
 * was cancelled”), with `follow` the network stack follows it – only to http or https (anything else: ERR_UNSAFE_REDIRECT)
 * – and the answer says where it ended (`url`, `redirected`).
 */
function electronNet(routes: Record<string, () => Response>): Fetcher {
  return async (url, init) => {
    let at = url
    for (let hop = 0; hop < 20; hop++) {
      const r = routes[at]?.() ?? new Response('nie ma', { status: 404 })
      const to = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null
      if (!to) {
        Object.defineProperty(r, 'url', { value: at })
        Object.defineProperty(r, 'redirected', { value: hop > 0 })
        return r
      }
      if ((init as { redirect: string }).redirect === 'manual') throw new TypeError('Redirect was cancelled')
      const next = new URL(to, at)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new TypeError('net::ERR_UNSAFE_REDIRECT')
      at = next.href
    }
    throw new TypeError('net::ERR_TOO_MANY_REDIRECTS')
  }
}

describe('jak Electron: przekierowania idą przez stos sieciowy (T835)', () => {
  it('google.com → www, http → https, ikona przez przekierowanie', async () => {
    const f = electronNet({
      'http://google.com/': () => redirect('https://google.com/'),
      'https://google.com/': () => redirect('https://www.google.com/'),
      'https://www.google.com/': () => html('<title>Google</title>'),
      'https://www.google.com/favicon.ico': () => redirect('https://www.gstatic.com/f.png'),
      'https://www.gstatic.com/f.png': () => new Response(PNG)
    })
    expect(await fetchPageMeta(f, 'http://google.com/')).toEqual({ title: 'Google', iconDataUrl: expect.stringMatching(/^data:image\/png;base64,/) })
  })

  it('przekierowanie poza http/https – nic', async () => {
    const f = electronNet({ 'https://e.com/': () => redirect('file:///C:/Windows/win.ini') })
    expect(await fetchPageMeta(f, 'https://e.com/')).toBeNull()
  })
})
