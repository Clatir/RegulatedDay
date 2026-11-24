/**
 * `hub.quickUndo` po rundzie 2 przeglądu N11 (D607): odmowa w całości i wyjątek odczytu oddają paczkę (`again`), częściowe cofnięcie mówi prawdziwe
 * liczby („Cofnięto 2 z 4 · 2 nie dały się cofnąć”).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { DataHub } from '../../src/main/data/hub'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cases-list2-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function open() {
  const dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
  const hub = new DataHub({
    userData: join(root, 'appdata-pca'),
    computer: () => 'pca',
    computerName: 'PCA',
    appVersion: '1.13.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
  expect(await hub.open(dir)).toBe(true)
  return { dir, hub }
}
const files = (dir: string) => readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))
const FOUR = ['A', 'B', 'C', 'D']

describe('hub.quickUndo – odczyt, odmowa, częściowe cofnięcie (N11, D607, runda 2)', () => {
  it('pełna odmowa i wyjątek odczytu oddają paczkę (`again`); nieznana paczka – bez `again`', async () => {
    const { dir, hub } = await open()
    try {
      const { batch } = await hub.quickAddMany(FOUR)
      const real = hub.edit.bind(hub)
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => entries.map(() => ({ status: 'broken' as const })))
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, again: true })
      vi.mocked(hub.edit).mockImplementation(real)
      // A read that throws: nothing is written, the list is given back.
      vi.spyOn(hub.service!.folder, 'recordView').mockRejectedValueOnce(new Error('EIO'))
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, again: true, undone: 0, kept: 0 })
      expect(files(dir)).toHaveLength(4)
      expect(await hub.quickUndo(batch)).toEqual({ ok: true, error: null, undone: 4, kept: 0 })
      expect(await hub.quickUndo(batch)).not.toHaveProperty('again')
      expect(await hub.quickUndo('nie-ma')).not.toHaveProperty('again')
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('częściowe cofnięcie: prawdziwe `undone` i zdanie „Cofnięto 2 z 4 · 2 nie dały się cofnąć”, paczka zużyta', async () => {
    const { hub } = await open()
    try {
      const { batch } = await hub.quickAddMany(FOUR)
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => entries.map((_, i) => ({ status: i < 2 ? ('applied' as const) : ('broken' as const) })))
      expect(await hub.quickUndo(batch)).toEqual({ ok: false, error: 'Cofnięto 2 z 4 · 2 nie dały się cofnąć', undone: 2, kept: 0 })
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, error: 'Tego zapisu nie da się już cofnąć.' })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('zdanie częściowego cofnięcia (runda 3): zapisane osobno od czekających na pytanie, zostawione (zmienione od zapisu) i niezapisane', async () => {
    const { dir, hub } = await open()
    try {
      const { batch } = await hub.quickAddMany(['A', 'B', 'C', 'D', 'E'])
      // „A” and „B” changed since the save: they stay.
      for (const title of ['A', 'B']) {
        const n = files(dir).find((f) => (JSON.parse(readFileSync(join(dir, 'requests', f), 'utf8')) as { title: string }).title === title)!
        const before = (await hub.service!.folder.recordView(`requests/${n}`))!
        await hub.edit([recordEdit(`requests/${n}`, before, { ...before, title: `${title} zmieniona` })!])
      }
      // The undo of „C”, „D”, „E”: one written, one a question of the queue, one refused.
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => entries.map((_, i) => ({ status: i === 0 ? ('applied' as const) : i === 1 ? ('changedElsewhere' as const) : ('broken' as const) })))
      expect(await hub.quickUndo(batch)).toEqual({ ok: false, error: 'Cofnięto 1 z 5 · 2 zostały, bo się zmieniły · 1 czeka na odpowiedź · 1 nie dała się cofnąć', undone: 1, kept: 2 })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('wyjątek z zapisu cofnięcia (nie z odczytu): paczka zużyta, „Nie wiadomo, co cofnięto”, bez `again`', async () => {
    const { hub } = await open()
    try {
      const { batch } = await hub.quickAddMany(FOUR)
      vi.spyOn(hub, 'edit').mockRejectedValue(new Error('EIO'))
      const r = await hub.quickUndo(batch)
      expect(r).toMatchObject({ ok: false, error: 'Nie wiadomo, co cofnięto – sprawdź listę spraw.' })
      expect(r).not.toHaveProperty('again')
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, error: 'Tego zapisu nie da się już cofnąć.' })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })
})
