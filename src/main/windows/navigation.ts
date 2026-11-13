/**
 * A window of the app stays on its own page (T663, T755): a link clicked in it, a file or a link dropped on it never loads
 * in the window (a link of a note goes through `openLink` – the default browser), and no new window opens from it. In the
 * development run its own address (the dev server's) may reload.
 */
import type { WebContents } from 'electron'

export function keepOnPage(contents: Pick<WebContents, 'setWindowOpenHandler' | 'on'>, devUrl: string | undefined = process.env.ELECTRON_RENDERER_URL): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const dev = devUrl ? originOf(devUrl) : null
  contents.on('will-navigate', (e, url) => {
    // The same origin only (scheme, host, port) – never a prefix of the text: „http://localhost:5173@evil.example/” and
    // „http://localhost:51730/” begin with the dev server's address and are elsewhere.
    if (!dev || originOf(url) !== dev) e.preventDefault()
  })
}

/** The origin of an address; null – not an address (or one without an origin of its own, as file: or data:). */
function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin
    return o && o !== 'null' ? o : null
  } catch {
    return null
  }
}
