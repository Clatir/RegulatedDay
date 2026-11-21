/**
 * „Wycofaj” zaplanowanej zmiany ustawień w folderze danych (UX14, E2): jedno pole listy „settings” przez kolejkę jak każda zmiana
 * ustawień – zmiana dopisana w tym czasie na innym komputerze zostaje, zmiana wycofana tam też to nie pytanie, zmiana zmieniona tam –
 * pytanie (nic nie znika po cichu); „Cofnij” kładzie ją z powrotem; reszta pliku zostaje.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { inverseEdit, recordEdit } from '@shared/data/merge'
import { rdFrom } from '@shared/model/rd'
import { settingsOn, type SettingsChange } from '@shared/model/settings'
import { withdrawnRd, withoutPlannedCategory } from '@shared/model/settingsWithdraw'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-11-21'
let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-withdraw-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function open() {
  const now = placeLogical(DAY, 10 * 60)
  return DataFolder.open({ fs: nodeFs, dataDir, stateDir, computer: 'pca', computerName: 'PC A', appVersion: '1.34.0', clock: { wall: () => now, mono: () => now }, holidays: marketDay, oneDriveRunning: () => true })
}
const write = (v: unknown) => writeFileSync(join(dataDir, paths.settings), JSON.stringify(v))
const read = () => JSON.parse(readFileSync(join(dataDir, paths.settings), 'utf8')) as Record<string, unknown>
const ids = (file: Record<string, unknown>) => (file.settings as SettingsChange[]).map((c) => c.id)
const ch = (id: string, from: string, patch: Record<string, unknown>): SettingsChange => ({ id, from, at: null, made: 1, patch })

const PLANNED = ch('z', '2026-11-25', { reserve: 20 })
const FILE = { schema: 1, przyszle: { x: 1 }, settings: [ch('a', '2026-11-01', { reserve: 12 }), PLANNED] }

/** What the window sends for „Wycofaj”: the edit from rd.json as it saw it. */
function withdrawEntry(seen: Record<string, unknown>) {
  const out = withdrawnRd(seen, 'z', DAY)
  if (!('raw' in out)) throw new Error(`odmowa: ${out.refused}`)
  return recordEdit(paths.settings, seen, out.raw)!
}

describe('wycofanie zaplanowanej zmiany w folderze danych', () => {
  it('zapis przez kolejkę: zmiany nie ma, od jej daty obowiązuje to, co przed nią; reszta pliku zostaje; „Cofnij” ją przywraca', async () => {
    write(FILE)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    const entry = withdrawEntry(seen)
    expect((await folder.edit([entry]))[0]!.status).toBe('applied')
    const file = read()
    expect(ids(file)).toEqual(['a'])
    expect(file.przyszle).toEqual({ x: 1 })
    expect(settingsOn(rdFrom(file).settings, '2026-11-25').reserve).toBe(12)

    const back = inverseEdit(entry, (await folder.recordView(paths.settings))!, null)!
    expect((await folder.edit([back]))[0]!.status).toBe('applied')
    expect(settingsOn(rdFrom(read()).settings, '2026-11-25').reserve).toBe(20)
    expect((rdFrom(read()).settings.find((c) => c.id === 'z'))).toEqual(PLANNED)
  })

  it('zmiana dopisana w tym czasie na innym komputerze zostaje (bez pytania)', async () => {
    write(FILE)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    // The other computer's rd.json came meanwhile, with a change of its own.
    write({ ...FILE, settings: [...FILE.settings, ch('inny', '2026-11-27', { reserve: 5 })] })
    expect((await folder.edit([withdrawEntry(seen)]))[0]!.status).toBe('applied')
    expect(ids(read())).toEqual(['a', 'inny'])
  })

  it('zmiana wycofana już na innym komputerze: nic do zapisania, bez pytania', async () => {
    write(FILE)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    write({ ...FILE, settings: [FILE.settings[0]] })
    expect((await folder.edit([withdrawEntry(seen)]))[0]!.status).toBe('applied')
    expect(ids(read())).toEqual(['a'])
  })

  it('zmiana zmieniona w tym czasie na innym komputerze: pytanie, plik bez zmian', async () => {
    write(FILE)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    write({ ...FILE, settings: [FILE.settings[0], { ...PLANNED, patch: { reserve: 18 } }] })
    expect((await folder.edit([withdrawEntry(seen)]))[0]!.status).toBe('conflict')
    expect(ids(read())).toEqual(['a', 'z'])
  })
})

describe('„Usuń” podkategorii, której dodanie czeka na datę (T2353)', () => {
  const costs = { head: 1, emotions: 1, senses: 1, body: 0 }
  const ADD = ch('n', '2026-11-25', { categories: { nowa: { cls: 'work', kind: 'other', place: 'computer', costs } } })
  const MIXED = ch('m', '2026-11-28', { reserve: 5, categories: { nowa: { costs: { ...costs, head: 2 } } } })
  const WITH = { schema: 1, categories: { nowa: { name: 'Nowa', color: null, archived: false, group: 'g-praca' } }, settings: [FILE.settings[0], ADD, MIXED] }

  it('jeden zapis przez kolejkę: zmiana dodająca i wpis podkategorii znikają, z innej zmiany tylko jej część; reszta zostaje', async () => {
    write(WITH)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    const out = withoutPlannedCategory(seen, 'nowa', DAY)!
    expect((await folder.edit([recordEdit(paths.settings, seen, out.raw)!]))[0]!.status).toBe('applied')
    const file = read()
    expect(ids(file)).toEqual(['a', 'm'])
    expect((file.settings as SettingsChange[])[1]!.patch).toEqual({ reserve: 5 })
    expect(file.categories).toEqual({})
    expect(settingsOn(rdFrom(file).settings, '2026-11-30').categories.nowa).toBeUndefined()
  })

  it('wpis podkategorii przemianowany w tym czasie na innym komputerze: pytanie o niego, nic nie ginie po cichu', async () => {
    write(WITH)
    const folder = await open()
    const seen = (await folder.recordView(paths.settings))!
    write({ ...WITH, categories: { nowa: { ...WITH.categories.nowa, name: 'Inna nazwa' } } })
    const out = withoutPlannedCategory(seen, 'nowa', DAY)!
    expect((await folder.edit([recordEdit(paths.settings, seen, out.raw)!]))[0]!.status).toBe('conflict')
    expect((read().categories as Record<string, { name: string }>).nowa!.name).toBe('Inna nazwa')
  })
})
