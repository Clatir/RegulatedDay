/**
 * Restoring a backup (spec „Przywracanie w aplikacji: wybrane rekordy albo cały folder do nowego folderu”, T117): the
 * records a backup holds, chosen ones taken back as edits (the history keeps what was before), the whole backup into a
 * new folder only – the old one gets the marker „przeniesiono do …”, this computer works in the new one; the CSV export
 * into a folder with an earlier one (D323).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { newRequest } from '@shared/model/requests'
import { createDailyBackup, listBackups } from '../../src/main/data/backup'
import { DataHub, MOVED_FILE, PENDING_MOVE_FILE } from '../../src/main/data/hub'
import { writeZipFile } from '../../src/main/data/zip'

let root: string
let dirA: string
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-restore-'))
  dirA = join(root, 'a')
  await DataHub.createFirst(dirA, [{ rel: 'requests/r1.json', value: newRequest('r1', 0, { person: null, estimateMin: null, note: 'stara' }) }, { rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function hubFor(folders: string[] = []) {
  return new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '0.7.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined,
    onFolder: (dir) => folders.push(dir)
  })
}

async function backupOfA(): Promise<string> {
  const r = await createDailyBackup(dirA, join(dirA, 'backups'), '2026-10-27')
  expect(r.ok).toBe(true)
  return (await listBackups(join(dirA, 'backups')))[0]!.path
}

const note = async (hub: DataHub) => ((await hub.service!.folder.recordView('requests/r1.json')) as { note: string }).note

describe('przywracanie kopii – przypadki z przeglądu', () => {
  it('po przywróceniu całego folderu numery zdarzeń tego komputera idą dalej (nie od zera – identyfikatory się nie powtarzają)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      for (let i = 0; i < 5; i++) hub.service!.folder.append({ day: '2026-10-27', dom: 'meta', k: 'observe.alive', at: Date.now() })
      await hub.service!.folder.log.flush()
      const before = hub.service!.folder.clock.last.n
      const zip = await backupOfA()
      expect(await hub.restoreWhole(zip, join(root, 'c'))).toMatchObject({ ok: true })
      expect(hub.service!.folder.clock.last.n).toBeGreaterThan(before)
    } finally {
      await hub.close('quit')
    }
  })

  it('nowy folder nie otworzył się: ten komputer zostaje w starym (spec: stary zamyka się dopiero po sukcesie), „Spróbuj ponownie” kończy przeniesienie', async () => {
    const folders: string[] = []
    let failFirst = true
    const hub = new DataHub({
      ...(hubFor(folders) as unknown as { o: ConstructorParameters<typeof DataHub>[0] }).o,
      start: async (o) => {
        if (failFirst && o.dataDir.endsWith('c')) {
          failFirst = false
          throw new Error('dysk zajęty')
        }
        return (await import('../../src/main/data/service')).DataService.start(o)
      }
    })
    const target = join(root, 'c')
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      expect(await hub.restoreWhole(zip, target, 7)).toEqual({ to: resolve(target), ok: false, error: 'dysk zajęty' })
      // Back in the folder before, working; the restored copy waits beside the list with why.
      expect(hub.status).toBe('open')
      expect(hub.folder).toBe(dirA)
      expect((await hub.view()).pendingMove).toEqual({ to: resolve(target), error: 'dysk zajęty' })
      expect(existsSync(join(dirA, MOVED_FILE))).toBe(false)
      expect(folders).toEqual([])
      expect(await hub.moveTo(resolve(target))).toEqual({ ok: true, error: null })
      expect(hub.folder).toBe(resolve(target))
      expect(folders).toEqual([resolve(target)])
      expect(JSON.parse(readFileSync(join(dirA, MOVED_FILE), 'utf8'))).toMatchObject({ to: resolve(target), at: 7 })
      expect((await hub.view()).pendingMove).toBeNull()
    } finally {
      await hub.close('quit')
    }
  })

  it('przywrócona kopia, której folder się nie otworzył, czeka w „Dane” także po ponownym uruchomieniu (z przeglądu)', async () => {
    const failing = (folders: string[] = []) =>
      new DataHub({
        ...(hubFor(folders) as unknown as { o: ConstructorParameters<typeof DataHub>[0] }).o,
        start: async (o) => {
          if (o.dataDir.endsWith('c')) throw new Error('dysk zajęty')
          return (await import('../../src/main/data/service')).DataService.start(o)
        }
      })
    const target = join(root, 'c')
    const first = failing()
    try {
      expect(await first.open(dirA)).toBe(true)
      expect(await first.restoreWhole(await backupOfA(), target, 9)).toMatchObject({ ok: false })
    } finally {
      await first.close('quit')
    }
    // The app started again, in the folder the backup came from.
    const folders: string[] = []
    const again = hubFor(folders)
    try {
      expect(await again.open(dirA)).toBe(true)
      expect((await again.view()).pendingMove).toEqual({ to: resolve(target), error: 'dysk zajęty' })
      expect(await again.moveTo(resolve(target))).toEqual({ ok: true, error: null })
      expect(folders).toEqual([resolve(target)])
      expect(JSON.parse(readFileSync(join(dirA, MOVED_FILE), 'utf8'))).toMatchObject({ to: resolve(target), at: 9 })
      expect(existsSync(join(root, 'appdata', PENDING_MOVE_FILE))).toBe(false)
    } finally {
      await again.close('quit')
    }
  })

  it('„Przejdź” do folderu bez danych (nie ma go albo OneDrive nie przyniósł rd.json): odmowa, zanim cokolwiek się zamknie (z przeglądu)', async () => {
    const folders: string[] = []
    const hub = hubFor(folders)
    const half = join(root, 'half')
    mkdirSync(join(half, 'requests'), { recursive: true })
    writeFileSync(join(half, 'requests', 'r1.json'), '{}')
    try {
      expect(await hub.open(dirA)).toBe(true)
      const service = hub.service
      const missing = await hub.moveTo(join(root, 'nie-ma'))
      expect(missing.ok).toBe(false)
      expect(missing.error).toContain('nie ma na tym komputerze')
      const noData = await hub.moveTo(half)
      expect(noData.ok).toBe(false)
      expect(noData.error).toContain('danych Regulated Day')
      expect(hub.service).toBe(service)
      expect(hub.folder).toBe(dirA)
      expect(hub.status).toBe('open')
      expect(folders).toEqual([])
    } finally {
      await hub.close('quit')
    }
  })

  it('folder, który się nie otworzy mimo danych: poprzedni pracuje dalej – nic w nim się nie zamknęło, bez ponowień nowego (z przeglądu)', async () => {
    const folders: string[] = []
    const hub = new DataHub({
      ...(hubFor(folders) as unknown as { o: ConstructorParameters<typeof DataHub>[0] }).o,
      start: async (o) => {
        if (o.dataDir.endsWith('d')) throw new Error('nie da się')
        return (await import('../../src/main/data/service')).DataService.start(o)
      }
    })
    const other = join(root, 'd')
    await DataHub.createFirst(other, [{ rel: 'rd.json', value: { schema: 1 } }], 'pcb', 0)
    try {
      expect(await hub.open(dirA)).toBe(true)
      const service = hub.service
      expect(await hub.moveTo(other)).toEqual({ ok: false, error: 'nie da się' })
      expect(hub.service).toBe(service)
      expect(hub.folder).toBe(dirA)
      expect(hub.status).toBe('open')
      expect(folders).toEqual([])
      // The folder before is the one working: its presence was never closed.
      const presence = join(dirA, '.presence', 'pca.json')
      if (existsSync(presence)) expect((JSON.parse(readFileSync(presence, 'utf8')) as { state: string }).state).not.toBe('closed')
    } finally {
      await hub.close('quit')
    }
  })

  it('znacznik niesie drogę od starego folderu: komputer z OneDrive w innym miejscu znajduje nowy folder (z przeglądu)', async () => {
    const zip = await backupOfA()
    const a = hubFor()
    try {
      expect(await a.open(dirA)).toBe(true)
      expect(await a.restoreWhole(zip, join(root, 'b'), 5)).toMatchObject({ ok: true })
    } finally {
      await a.close('quit')
    }
    // The other computer: the same two folders under another profile's OneDrive.
    const elsewhere = join(root, 'inny-profil')
    cpSync(dirA, join(elsewhere, 'a'), { recursive: true })
    cpSync(join(root, 'b'), join(elsewhere, 'b'), { recursive: true })
    const other = hubFor()
    try {
      expect(await other.open(join(elsewhere, 'a'))).toBe(true)
      expect(await other.movedTo()).toEqual({ to: resolve(elsewhere, 'b'), at: 5, by: 'pca' })
      expect((await other.view()).moved).toEqual({ to: resolve(elsewhere, 'b'), at: 5, by: 'pca' })
    } finally {
      await other.close('quit')
    }
  })

  it('znacznik, który OneDrive przyniósł bez innej zmiany, dociera do okna (z przeglądu: baner dopiero po zmianie danych)', async () => {
    const hub = hubFor()
    const signature = () => (hub as unknown as { signature(): Promise<string> }).signature()
    try {
      expect(await hub.open(dirA)).toBe(true)
      // What the window would read, once the folder's first checks settled.
      let before = ''
      await vi.waitFor(async () => {
        const a = await signature()
        before = await signature()
        expect(before).toBe(a)
      })
      writeFileSync(join(dirA, MOVED_FILE), JSON.stringify({ to: join(root, 'b'), rel: '../b', at: 1, by: 'pcb' }))
      const after = await signature()
      expect(after).not.toBe(before)
      expect(after).toContain('"by":"pcb"')
    } finally {
      await hub.close('quit')
    }
  })

  it('cały folder do folderu w obecnym folderze danych: odmowa, nic nie powstaje (z przeglądu)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      await expect(hub.restoreWhole(zip, join(dirA, 'Nowy folder'))).rejects.toThrow('leży w obecnym folderze danych')
      expect(existsSync(join(dirA, 'Nowy folder'))).toBe(false)
      expect(hub.folder).toBe(dirA)
    } finally {
      await hub.close('quit')
    }
  })

  it('edycja, którą położył wcześniejszy przebieg kolejki, ma wynik „zapisana”, nie „czeka” (z przeglądu)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const f = hub.service!.folder
      // A run of the queue already chained (a check of the folder): it lays the entry before the edit's own run.
      void f.queue.apply(f.records)
      const out = await f.edit([{ rel: 'requests/r1.json', edits: [{ path: ['note'], base: 'stara', value: 'nowa' }] }])
      expect(out.map((o) => o.status)).toEqual(['applied'])
      expect(await note(hub)).toBe('nowa')
    } finally {
      await hub.close('quit')
    }
  })

  it('wybrane rekordy: wynik każdego – przywrócony albo „już taki jak w kopii” (z przeglądu: sukces bez zmiany)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      await hub.edit([{ rel: 'requests/r1.json', edits: [{ path: ['note'], base: 'stara', value: 'nowa' }] }])
      expect(await hub.restoreRecords(zip, ['requests/r1.json', 'rd.json'])).toEqual(
        expect.arrayContaining([
          { rel: 'requests/r1.json', status: 'applied' },
          { rel: 'rd.json', status: 'same' }
        ])
      )
    } finally {
      await hub.close('quit')
    }
  })

  it('kopia z nazwami wpisów „./…” – rekordy z listy dają się przywrócić', async () => {
    const zip = join(root, 'odd.zip')
    const bytes = Buffer.from(JSON.stringify(newRequest('r1', 0, { person: null, estimateMin: null, note: 'z kopii' })))
    await writeZipFile(zip, [{ name: './requests/r1.json', read: () => ({ data: bytes, mtime: new Date() }) }])
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      expect(await hub.backupRecords(zip)).toEqual(['requests/r1.json'])
      await hub.restoreRecords(zip, ['requests/r1.json'])
      expect(await note(hub)).toBe('z kopii')
    } finally {
      await hub.close('quit')
    }
  })
})

describe('przywracanie kopii', () => {
  it('wybrane rekordy wracają jako Twoja zmiana; rekordu spoza kopii nie ma', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      expect((await hub.backups()).map((b) => b.path)).toEqual([zip])
      expect(await hub.backupRecords(zip)).toEqual(expect.arrayContaining(['rd.json', 'requests/r1.json']))
      await hub.edit([{ rel: 'requests/r1.json', edits: [{ path: ['note'], base: 'stara', value: 'nowa' }] }])
      expect(await note(hub)).toBe('nowa')
      await hub.restoreRecords(zip, ['requests/r1.json'])
      expect(await note(hub)).toBe('stara')
      await expect(hub.restoreRecords(zip, ['requests/r9.json'])).rejects.toThrow('w kopii nie ma rekordu')
    } finally {
      await hub.close('quit')
    }
  })

  it('cały folder do nowego: w starym znacznik „przeniesiono do …”, ten komputer pracuje w nowym; folder z czymkolwiek – odmowa', async () => {
    const folders: string[] = []
    const hub = hubFor(folders)
    const target = join(root, 'c')
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      // A folder with anything in it is never written over.
      const busy = join(root, 'busy')
      mkdirSync(busy)
      writeFileSync(join(busy, 'x.txt'), 'x')
      await expect(hub.restoreWhole(zip, busy)).rejects.toThrow('nie jest pusty')
      expect(existsSync(join(dirA, MOVED_FILE))).toBe(false)
      expect(await hub.restoreWhole(zip, target, 123)).toEqual({ to: resolve(target), ok: true, error: null })
      expect(hub.folder).toBe(resolve(target))
      expect(folders).toEqual([resolve(target)])
      expect(existsSync(join(target, 'requests', 'r1.json'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dirA, MOVED_FILE), 'utf8'))).toEqual({ to: resolve(target), rel: relative(dirA, target), at: 123, by: 'pca' })
      expect(await hub.movedTo()).toBeNull()
    } finally {
      await hub.close('quit')
    }
    // Another computer still in the old folder sees where it went.
    const other = hubFor()
    try {
      expect(await other.open(dirA)).toBe(true)
      expect(await other.movedTo()).toEqual({ to: resolve(target), at: 123, by: 'pca' })
    } finally {
      await other.close('quit')
    }
  })

  it('rekordy kopii dla okna (D321): rodzaj i nazwa z interfejsu – prośba jej notatką, ustawienia; bez logów i ocen', async () => {
    const zip = await backupOfA()
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const list = await hub.backupContents(zip)
      expect(list).toEqual(expect.arrayContaining([
        { rel: 'requests/r1.json', kind: 'request', date: null, name: 'stara', person: null, at: null },
        { rel: 'rd.json', kind: 'settings', date: null, name: null, person: null, at: null }
      ]))
      expect(list.some((r) => r.kind === 'log' || r.kind === 'presence' || r.kind === 'grades')).toBe(false)
    } finally {
      await hub.close('quit')
    }
  })

  it('przejście tego komputera do folderu, do którego przeniesiono dane (baner „Przejdź”): otwarty i zapamiętany', async () => {
    const zip = await backupOfA()
    const target = join(root, 'b')
    const a = hubFor()
    try {
      expect(await a.open(dirA)).toBe(true)
      expect(await a.restoreWhole(zip, target, 123)).toMatchObject({ ok: true })
    } finally {
      await a.close('quit')
    }
    const folders: string[] = []
    const other = hubFor(folders)
    try {
      expect(await other.open(dirA)).toBe(true)
      const moved = await other.movedTo()
      expect(await other.moveTo(moved!.to)).toEqual({ ok: true, error: null })
      expect(other.folder).toBe(resolve(target))
      expect(folders).toEqual([resolve(target)])
    } finally {
      await other.close('quit')
    }
  })
})

describe('dni zapisane raz w rd.json (D320, T509)', () => {
  it('przywrócenie starszego rd.json (z kopii, bez nich) nie zabiera pierwszego dnia rytuału ani gry (z przeglądu: gra od nowa)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const zip = await backupOfA()
      await hub.edit([{ rel: 'rd.json', edits: [{ path: ['ritualFrom'], base: undefined, value: '2026-10-01' }, { path: ['gameFrom'], base: undefined, value: '2026-10-02' }, { path: ['note'], base: undefined, value: 'nowa' }] }])
      await hub.restoreRecords(zip, ['rd.json'])
      const rd = (await hub.service!.folder.recordView('rd.json'))!
      expect(rd).toMatchObject({ ritualFrom: '2026-10-01', gameFrom: '2026-10-02' })
      expect(rd.note).toBeUndefined()
    } finally {
      await hub.close('quit')
    }
  })
})

describe('gra dla okna (T510)', () => {
  it('pytania okna w trakcie liczenia gry dostają to samo liczenie – nigdy drugie obok (z przeglądu)', async () => {
    const hub = hubFor()
    try {
      expect(await hub.open(dirA)).toBe(true)
      const spy = vi.spyOn(hub.service!.folder, 'gameState')
      const [a, b] = await Promise.all([hub.game(), hub.game()])
      expect(a).toBe(b)
      expect(spy).toHaveBeenCalledTimes(1)
      // After it ended, a new ask counts again.
      await hub.game()
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      await hub.close('quit')
    }
  })
})

describe('eksport CSV do folderu z poprzednim eksportem (D323)', () => {
  it('pliki eksportu już w folderze – zastąpienie po pytaniu; inne pliki i brak folderu nie liczą się', async () => {
    const dir = join(root, 'csv')
    expect(await DataHub.csvFilesIn(dir)).toEqual([])
    mkdirSync(dir)
    writeFileSync(join(dir, 'notatki.txt'), 'x')
    expect(await DataHub.csvFilesIn(dir)).toEqual([])
    writeFileSync(join(dir, 'Bloki.csv'), 'x')
    writeFileSync(join(dir, 'checkiny.csv'), 'x')
    expect(await DataHub.csvFilesIn(dir)).toEqual(['bloki.csv', 'checkiny.csv'])
    // A list that cannot be read is not an empty folder (z przeglądu): a file in place of the folder.
    await expect(DataHub.csvFilesIn(join(dir, 'notatki.txt'))).rejects.toThrow('nie mogę odczytać folderu')
  })
})
