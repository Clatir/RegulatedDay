import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigStore } from '../../src/main/config'

describe('config.json nieczytelny przy starcie (FI B114)', () => {
  it('zmiany z sesji czekają i zapisują się na ustawienia pliku, gdy da się go przeczytać', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-config-'))
    try {
      const file = join(dir, 'config.json')
      // A folder in its place: the read fails with something other than „no file”, as with a file held by an antivirus.
      mkdirSync(file)
      const store = new ConfigStore(dir)
      await store.load()
      expect(store.loadFailed).not.toBeNull()
      await store.update({ prefs: { ...store.get().prefs, zoom: 1.25 } })
      let read: number | null = null
      store.retryLoad(20, (c) => (read = c.prefs.zoom))
      rmSync(file, { recursive: true })
      writeFileSync(file, `${JSON.stringify({ format: 1, autostart: { enabled: true }, nieznane: 'zostaje' })}\n`)
      await expect.poll(() => read, { timeout: 5000 }).toBe(1.25)
      const saved = JSON.parse(readFileSync(file, 'utf8')) as { prefs: { zoom: number }; autostart: { enabled: boolean }; nieznane: string }
      expect(saved.prefs.zoom).toBe(1.25)
      expect(saved.autostart.enabled).toBe(true)
      expect(saved.nieznane).toBe('zostaje')
      expect(store.loadFailed).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
