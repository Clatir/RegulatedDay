/**
 * A window of the app stays on its own page (T663, T755): a link clicked in it, a file or a link dropped on it never loads
 * in the window (a link of a note goes through `openLink` – the default browser), and no new window opens from it. In the
 * development run its own address (the dev server's) may reload.
 */
import type { WebContents } from 'electron'

export function keepOnPage(contents: Pick<WebContents, 'setWindowOpenHandler' | 'on'>, devUrl: string | undefined = process.env.ELECTRON_RENDERER_URL): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (e, url) => {
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault()
  })
}
