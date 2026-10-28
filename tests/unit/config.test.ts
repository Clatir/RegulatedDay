import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigStore, computerId, machineGuidOf, presenceWindowsId, renewComputerId } from '../../src/main/config'

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

describe('identyfikator komputera i identyfikator Windows (A3-05)', () => {
  it('dane aplikacji skopiowane z innego komputera (inny identyfikator Windows) dają nowy identyfikator', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-id-'))
    try {
      const first = await computerId(dir, null, 'aaaaaaaa-0000-0000-0000-000000000001')
      expect(first.created).toBe(true)
      const again = await computerId(dir, first.id, 'aaaaaaaa-0000-0000-0000-000000000001')
      expect(again).toEqual({ id: first.id, created: false, copiedFrom: null })
      const copied = await computerId(dir, first.id, 'bbbbbbbb-0000-0000-0000-000000000002')
      expect(copied.copiedFrom).toBe(first.id)
      expect(copied.id).not.toBe(first.id)
      expect(JSON.parse(readFileSync(join(dir, 'computer-id'), 'utf8'))).toEqual({ id: copied.id, windowsId: 'bbbbbbbb-0000-0000-0000-000000000002' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('plik sprzed zapamiętywania identyfikatora Windows zostaje tym komputerem; nieczytelny identyfikator Windows niczego nie zmienia', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-id-'))
    try {
      writeFileSync(join(dir, 'computer-id'), JSON.stringify({ id: 'abcdef0123456789' }))
      expect(await computerId(dir, null, null)).toEqual({ id: 'abcdef0123456789', created: false, copiedFrom: null })
      expect(await computerId(dir, null, 'cccccccc-0000-0000-0000-000000000003')).toEqual({ id: 'abcdef0123456789', created: false, copiedFrom: null })
      expect(JSON.parse(readFileSync(join(dir, 'computer-id'), 'utf8')).windowsId).toBe('cccccccc-0000-0000-0000-000000000003')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nieudany zapis nowego identyfikatora nie wraca do identyfikatora drugiego komputera', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-id-'))
    try {
      const first = await computerId(dir, null, 'aaaaaaaa-0000-0000-0000-000000000001')
      chmodSync(join(dir, 'computer-id'), 0o444)
      await expect(computerId(dir, first.id, 'bbbbbbbb-0000-0000-0000-000000000002')).rejects.toThrow()
    } finally {
      chmodSync(join(dir, 'computer-id'), 0o666)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('obecność w folderze mówi, czyj jest identyfikator profilu skopiowanego przed 0.17.0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-id-'))
    try {
      mkdirSync(join(dir, '.presence'))
      writeFileSync(join(dir, '.presence', 'abcdef0123456789.json'), JSON.stringify({ computer: 'abcdef0123456789', windowsId: 'aaaaaaaa-0000-0000-0000-000000000001' }))
      expect(await presenceWindowsId(dir, 'abcdef0123456789')).toBe('aaaaaaaa-0000-0000-0000-000000000001')
      expect(await presenceWindowsId(dir, 'nieznany0000')).toBeNull()
      const renewed = await renewComputerId(dir, 'bbbbbbbb-0000-0000-0000-000000000002', 'abcdef0123456789')
      expect(renewed.copiedFrom).toBe('abcdef0123456789')
      expect(JSON.parse(readFileSync(join(dir, 'computer-id'), 'utf8'))).toEqual({ id: renewed.id, windowsId: 'bbbbbbbb-0000-0000-0000-000000000002' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('MachineGuid z wyniku „reg query”', () => {
    const out = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    3F2504E0-4F89-11D3-9A0C-0305E82C3301\r\n\r\n'
    expect(machineGuidOf(out)).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301')
    expect(machineGuidOf('ERROR: nie znaleziono')).toBeNull()
  })
})
