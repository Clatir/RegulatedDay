import { existsSync, mkdirSync, mkdtempSync, promises as fsp, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DAILY_KEEP,
  WEEKLY_KEEP,
  backupDue,
  copyLatestTo,
  createDailyBackup,
  isoWeekOf,
  listBackups,
  readBackupEntry,
  restoreToFolder,
  type BackupResult
} from '../../src/main/data/backup'
import { withZip, writeZipFile, type ZipSource } from '../../src/main/data/zip'
import { addDays } from '../../src/shared/time/zone'

let root: string
let data: string
let backups: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-backup-'))
  data = join(root, 'RegulatedDay')
  backups = join(data, 'backups')
  mkdirSync(data)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

function put(dir: string, rel: string, content: string | Buffer): void {
  const file = join(dir, ...rel.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** Every file under `dir` by its relative path (forward slashes) with its bytes. */
function tree(dir: string, rel = ''): Record<string, Buffer> {
  const out: Record<string, Buffer> = {}
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) Object.assign(out, tree(dir, r))
    else out[r] = readFileSync(join(dir, ...r.split('/')))
  }
  return out
}

function made(r: BackupResult): Extract<BackupResult, { ok: true }> {
  if (!r.ok) throw new Error(`kopia nie powstała: ${r.error}`)
  return r
}

const event = (n: number) => `${JSON.stringify({ id: `e${n}`, n, what: 'start', note: 'zażółć gęślą jaźń' })}\n`
const zipNames = (file: string) => withZip(file, async (zip) => zip.entries.map((e) => e.name).sort())
const ownNames = (dir: string, re: RegExp) => (existsSync(dir) ? readdirSync(dir).filter((n) => re.test(n)).sort() : [])
const DAILY = /^\d{4}-\d{2}-\d{2}\.zip$/
const WEEKLY = /^\d{4}-W\d{2}\.zip$/

/** The data folder of the spec („Pliki na OneDrive”) with all its kinds of files; returns the data files' paths. */
function makeData(): string[] {
  const files: Record<string, string> = {
    'rd.json': '{"format":1,"people":["Łucja","Żaneta"]}\n',
    'rd-DESKTOP-ABC.json': '{"format":1,"people":["Łucja"]}\n',
    'templates/t1.json': '{"id":"t1","name":"Dzień wykładów"}',
    'schedule/s1.json': '{"id":"s1","blocks":[]}\n',
    'days/2026/2026-10-21.json': '{"date":"2026-10-21","note":"Ćwiczenia, łódź, źdźbło"}\n',
    'days/2026/2026-10-21-DESKTOP-ABC.json': '{"date":"2026-10-21","note":"kopia konfliktowa"}\n',
    'log/2026/2026-10-21/pca.jsonl': event(0) + event(1),
    'log/2026/2026-10-21/pca (1).jsonl': event(0),
    'log/2026/2026-10-21/pcb.jsonl': event(2),
    'requests/r1.json': '{"id":"r1"}\n',
    'routines/u1.json': '{"id":"u1"}\n',
    'grades/2026/pca.jsonl': '{"date":"2026-10-20","grade":4}\n'
  }
  for (const [rel, content] of Object.entries(files)) put(data, rel, content)
  // Never in a backup: presence, history, backups, temp files, files of other programs.
  put(data, '.presence/pca.json', '{"computer":"pca"}\n')
  put(data, '.history/x.json', '{"old":true}\n')
  put(data, '.history/days/2026/2026-10-21/1.json', '{"old":true}\n')
  put(data, 'backups/daily/2026-10-20.zip', Buffer.from('not a zip of ours'))
  put(data, 'backups/notes.txt', 'mine')
  put(data, '.foo.tmp-1234', 'half')
  put(data, 'templates/.t1.json.tmp-1a2b3c4d', '{"id":"t1","na')
  put(data, 'desktop.ini', '[.ShellClassInfo]')
  put(data, 'eksport.zip', Buffer.from([1, 2, 3]))
  return Object.keys(files).sort()
}

describe('kopia dzienna (spec „Kopie zapasowe”)', () => {
  it('ZIP ma dokładnie pliki danych z ich bajtami; przywrócony folder jest ich wierną kopią', async () => {
    const expected = makeData()
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(r.file).toBe(join(backups, 'daily', '2026-10-21.zip'))
    expect(r.files).toBe(expected.length)
    expect(r.skipped).toEqual([])
    expect(r.bytes).toBe(statSync(r.file).size)
    expect(await zipNames(r.file)).toEqual(expected)

    const out = join(root, 'przywrócony')
    expect(await restoreToFolder(r.file, out)).toBe(expected.length)
    expect(tree(out)).toEqual(Object.fromEntries(expected.map((rel) => [rel, readFileSync(join(data, ...rel.split('/')))])))
    // No temp file of the ZIP is left beside it.
    expect(readdirSync(join(backups, 'daily')).filter((n) => n.includes('.tmp-'))).toEqual([])
  })

  it('backupDue: prawda przed kopią, fałsz po niej, prawda dla następnego dnia', async () => {
    makeData()
    expect(await backupDue(backups, '2026-10-21')).toBe(true)
    made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(await backupDue(backups, '2026-10-21')).toBe(false)
    expect(await backupDue(backups, '2026-10-22')).toBe(true)
  })

  it('druga kopia tego samego dnia zastępuje pierwszą – zostaje dokładnie jeden plik, z nowszymi danymi', async () => {
    makeData()
    made(await createDailyBackup(data, backups, '2026-10-21'))
    put(data, 'rd.json', '{"format":1,"people":["Łucja","Żaneta","Óla"]}\n')
    made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(ownNames(join(backups, 'daily'), DAILY).filter((n) => n.startsWith('2026-10-21'))).toEqual(['2026-10-21.zip'])
    expect((await readBackupEntry(join(backups, 'daily', '2026-10-21.zip'), 'rd.json'))?.toString('utf8')).toContain('Óla')
  })

  it('rotacja przez 70 dni: 14 dziennych i 8 tygodniowych (najnowsza dzienna każdego minionego tygodnia); cudze pliki zostają', async () => {
    const foreign = ['daily/notes.txt', 'daily/2026-01-01-other.zip', 'weekly/notes.txt', 'weekly/2025-W01-other.zip', 'notes.txt']
    for (const rel of foreign) put(backups, rel, 'cudzy')
    const dates = Array.from({ length: 70 }, (_, i) => addDays('2026-01-01', i))
    for (const date of dates) {
      put(data, 'rd.json', `${JSON.stringify({ date })}\n`)
      const r = made(await createDailyBackup(data, backups, date))
      expect(r.rotateError).toBeUndefined()
    }
    expect(ownNames(join(backups, 'daily'), DAILY)).toEqual(dates.slice(-DAILY_KEEP).map((d) => `${d}.zip`))
    // The last date (2026-03-11) is in W11: W03–W10 are the 8 newest past weeks.
    const weeks = Array.from({ length: WEEKLY_KEEP }, (_, i) => i + 3)
    expect(ownNames(join(backups, 'weekly'), WEEKLY)).toEqual(weeks.map((w) => `2026-W${String(w).padStart(2, '0')}.zip`))
    for (const w of weeks) {
      // Week n of 2026 starts on Monday 2025-12-29 + 7(n-1): its newest daily is its Sunday.
      const sunday = addDays('2025-12-29', 7 * w - 1)
      const rd = await readBackupEntry(join(backups, 'weekly', `2026-W${String(w).padStart(2, '0')}.zip`), 'rd.json')
      expect(JSON.parse(rd!.toString('utf8'))).toEqual({ date: sunday })
    }
    for (const rel of foreign) expect(readFileSync(join(backups, ...rel.split('/')), 'utf8')).toBe('cudzy')
    const listed = await listBackups(backups)
    expect(listed.filter((b) => b.kind === 'daily')).toHaveLength(DAILY_KEEP)
    expect(listed.filter((b) => b.kind === 'weekly')).toHaveLength(WEEKLY_KEEP)
  }, 120_000)

  it('pliki tymczasowe kopii przerwanej awarią znikają po godzinie; świeże i cudze zostają', async () => {
    makeData()
    const daily = join(backups, 'daily')
    put(daily, '.2026-10-19.zip.tmp-0123abcd', 'pół ZIP-a')
    put(daily, '.2026-10-21.zip.tmp-89abcdef', 'pół ZIP-a')
    put(daily, '.other.zip.tmp-0123abcd', 'cudzy')
    const old = new Date(Date.now() - 2 * 3600_000)
    utimesSync(join(daily, '.2026-10-19.zip.tmp-0123abcd'), old, old)
    utimesSync(join(daily, '.other.zip.tmp-0123abcd'), old, old)
    made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(existsSync(join(daily, '.2026-10-19.zip.tmp-0123abcd'))).toBe(false)
    expect(existsSync(join(daily, '.2026-10-21.zip.tmp-89abcdef'))).toBe(true)
    expect(existsSync(join(daily, '.other.zip.tmp-0123abcd'))).toBe(true)
  })
})

describe('kopia odporna na zapisy w trakcie pakowania', () => {
  it('log dopisywany w trakcie kopii trafia do niej jako początek pliku, z całymi liniami', async () => {
    const rel = 'log/2026/2026-10-21/pca.jsonl'
    const log = join(data, ...rel.split('/'))
    const initial = 20_000
    const start = Array.from({ length: initial }, (_, i) => event(i)).join('')
    put(data, rel, start)
    for (let i = 0; i < 300; i++) put(data, `days/2026/2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}.json`, `{"i":${i}}\n`)
    let done = false
    let n = initial
    const backup = createDailyBackup(data, backups, '2026-10-21').finally(() => (done = true))
    const appender = (async () => {
      while (!done) await fsp.appendFile(log, event(n++))
    })()
    const r = made(await backup)
    await appender
    expect(n).toBeGreaterThan(initial)
    const archived = (await readBackupEntry(r.file, rel))!
    const final = readFileSync(log)
    expect(archived.length).toBeGreaterThanOrEqual(Buffer.byteLength(start))
    expect(final.subarray(0, archived.length).equals(archived)).toBe(true)
    const lines = archived.toString('utf8').split('\n')
    expect(lines.pop()).toBe('')
    expect(lines.length).toBeGreaterThanOrEqual(initial)
    lines.forEach((line, i) => expect((JSON.parse(line) as { n: number }).n).toBe(i))
  })

  it('ucięta ostatnia linia logu nie trafia do kopii; rekord bez końca linii zostaje bajt w bajt', async () => {
    put(data, 'log/2026/2026-10-21/pca.jsonl', `${event(0)}${event(1)}{"id":"e2","n":2,"wh`)
    put(data, 'grades/2026/pca.jsonl', '{"grade":4')
    put(data, 'templates/t1.json', '{"id":"t1"}')
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    expect((await readBackupEntry(r.file, 'log/2026/2026-10-21/pca.jsonl'))?.toString('utf8')).toBe(event(0) + event(1))
    expect((await readBackupEntry(r.file, 'grades/2026/pca.jsonl'))?.length).toBe(0)
    expect((await readBackupEntry(r.file, 'templates/t1.json'))?.toString('utf8')).toBe('{"id":"t1"}')
  })

  it('plik usunięty w trakcie kopii jest pominięty i wymieniony', async () => {
    makeData()
    const victim = join(data, 'requests', 'r1.json')
    const realOpen = fsp.open
    vi.spyOn(fsp, 'open').mockImplementation(async (path, flags, mode) => {
      if (String(path) === victim) rmSync(victim, { force: true })
      return realOpen(path, flags, mode)
    })
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(r.skipped).toEqual(['requests/r1.json'])
    vi.restoreAllMocks()
    expect(await zipNames(r.file)).not.toContain('requests/r1.json')
    expect(await zipNames(r.file)).toContain('rd.json')
  })

  it('plik chwilowo zablokowany (EBUSY) jest czytany ponownie i trafia do kopii', async () => {
    makeData()
    const held = join(data, 'days', '2026', '2026-10-21.json')
    const realOpen = fsp.open
    let refusals = 0
    vi.spyOn(fsp, 'open').mockImplementation(async (path, flags, mode) => {
      if (String(path) === held && refusals < 3) {
        refusals++
        throw Object.assign(new Error(`EBUSY: resource busy or locked, open '${held}'`), { code: 'EBUSY' })
      }
      return realOpen(path, flags, mode)
    })
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    vi.restoreAllMocks()
    expect(refusals).toBe(3)
    expect((await readBackupEntry(r.file, 'days/2026/2026-10-21.json'))?.equals(readFileSync(held))).toBe(true)
  })

  it('plik nieczytelny mimo ponowień: kopia się nie udaje, nazywa plik, a wcześniejsza kopia dnia zostaje nietknięta', async () => {
    makeData()
    const first = made(await createDailyBackup(data, backups, '2026-10-21'))
    const before = readFileSync(first.file)
    const held = join(data, 'log', '2026', '2026-10-21', 'pcb.jsonl')
    const realOpen = fsp.open
    vi.spyOn(fsp, 'open').mockImplementation(async (path, flags, mode) => {
      if (String(path) === held) throw Object.assign(new Error(`EPERM: operation not permitted, open '${held}'`), { code: 'EPERM' })
      return realOpen(path, flags, mode)
    })
    const r = await createDailyBackup(data, backups, '2026-10-21')
    vi.restoreAllMocks()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('log/2026/2026-10-21/pcb.jsonl')
    expect(readFileSync(first.file).equals(before)).toBe(true)
    expect(ownNames(join(backups, 'daily'), DAILY)).toEqual(['2026-10-20.zip', '2026-10-21.zip'])
    expect(readdirSync(join(backups, 'daily')).filter((n) => n.includes('.tmp-'))).toEqual([])
  })

  it('folder danych niedostępny albo zła data: wynik { ok: false }, żadnego pliku kopii', async () => {
    const missing = await createDailyBackup(join(root, 'nie-ma'), backups, '2026-10-21')
    expect(missing.ok).toBe(false)
    put(root, 'plik', 'to nie folder')
    expect((await createDailyBackup(join(root, 'plik'), backups, '2026-10-21')).ok).toBe(false)
    expect((await createDailyBackup(data, backups, '2026-13-01')).ok).toBe(false)
    expect(await backupDue(backups, '2026-10-21')).toBe(true)
    expect(ownNames(join(backups, 'daily'), DAILY)).toEqual([])
  })
})

describe('dodatkowe miejsce poza OneDrive', () => {
  it('copyLatestTo kopiuje najnowszą kopię dzienną, ponownie niczego nie robi, cudze pliki zostawia', async () => {
    makeData()
    const extra = join(root, 'D', 'Kopie RD')
    put(extra, 'notes.txt', 'cudzy')
    put(extra, 'daily/notes.txt', 'cudzy')
    expect(await copyLatestTo(join(root, 'brak'), extra)).toBeNull()
    made(await createDailyBackup(data, backups, '2026-10-20'))
    const newest = made(await createDailyBackup(data, backups, '2026-10-21'))
    expect(await copyLatestTo(backups, extra)).toBe('2026-10-21.zip')
    expect(ownNames(join(extra, 'daily'), DAILY)).toEqual(['2026-10-21.zip'])
    expect(readFileSync(join(extra, 'daily', '2026-10-21.zip')).equals(readFileSync(newest.file))).toBe(true)
    const snapshot = tree(extra)
    expect(await copyLatestTo(backups, extra)).toBeNull()
    expect(tree(extra)).toEqual(snapshot)
    made(await createDailyBackup(data, backups, '2026-10-22'))
    expect(await copyLatestTo(backups, extra)).toBe('2026-10-22.zip')
    expect(ownNames(join(extra, 'daily'), DAILY)).toEqual(['2026-10-21.zip', '2026-10-22.zip'])
    expect(readFileSync(join(extra, 'notes.txt'), 'utf8')).toBe('cudzy')
    expect(readFileSync(join(extra, 'daily', 'notes.txt'), 'utf8')).toBe('cudzy')
  })
})

describe('przywracanie', () => {
  it('restoreToFolder odmawia folderu, który nie jest pusty, i przyjmuje pusty', async () => {
    makeData()
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    const busy = join(root, 'zajęty')
    put(busy, 'mój.txt', 'zostaje')
    await expect(restoreToFolder(r.file, busy)).rejects.toThrow(/nie jest pusty/)
    expect(tree(busy)).toEqual({ 'mój.txt': Buffer.from('zostaje') })
    await expect(restoreToFolder(r.file, data)).rejects.toThrow(/nie jest pusty/)
    put(root, 'plik', 'x')
    await expect(restoreToFolder(r.file, join(root, 'plik'))).rejects.toThrow(/nie jest pusty/)
    const empty = join(root, 'pusty')
    mkdirSync(empty)
    expect(await restoreToFolder(r.file, empty)).toBe(r.files)
    expect(readFileSync(join(empty, 'rd.json'), 'utf8')).toContain('Żaneta')
  })

  it.each(['../evil.json', '..\\evil.json', 'days/../../evil.json', '/evil.json', 'C:/evil.json', 'days/2026/a:b.json'])(
    'restoreToFolder odrzuca cały ZIP z wpisem „%s” i niczego nie zapisuje',
    async (name) => {
      const content = (text: string): ZipSource['read'] => () => ({ data: Buffer.from(text), mtime: new Date() })
      const crafted = join(root, 'spreparowany.zip')
      await writeZipFile(crafted, [
        { name: 'rd.json', read: content('{}') },
        { name, read: content('{"evil":true}') }
      ])
      const out = join(root, 'cel', 'przywrócony')
      await expect(restoreToFolder(crafted, out)).rejects.toThrow(/niedozwolone ścieżki/)
      expect(existsSync(join(root, 'evil.json'))).toBe(false)
      expect(existsSync(join(root, 'cel', 'evil.json'))).toBe(false)
      expect(existsSync(join(root, 'cel'))).toBe(false)
    }
  )

  it('readBackupEntry czyta jeden rekord (także ze ścieżką z \\), null dla brakującego', async () => {
    makeData()
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    const day = await readBackupEntry(r.file, 'days\\2026\\2026-10-21.json')
    expect(day?.toString('utf8')).toBe('{"date":"2026-10-21","note":"Ćwiczenia, łódź, źdźbło"}\n')
    expect(await readBackupEntry(r.file, 'days/2026/2026-10-22.json')).toBeNull()
    expect(await readBackupEntry(r.file, '.presence/pca.json')).toBeNull()
  })

  it('uszkodzony ZIP (ucięty albo ze zmienionym bajtem) jest odrzucany, nigdy czytany jako pusty', async () => {
    put(data, 'rd.json', `${JSON.stringify({ people: Array.from({ length: 200 }, (_, i) => `Osoba ${i}`) })}\n`)
    const r = made(await createDailyBackup(data, backups, '2026-10-21'))
    const zip = readFileSync(r.file)
    const cut = join(root, 'ucięty.zip')
    writeFileSync(cut, zip.subarray(0, zip.length - 10))
    await expect(readBackupEntry(cut, 'rd.json')).rejects.toThrow(/Uszkodzony plik ZIP/)
    const flipped = Buffer.from(zip)
    // Inside rd.json's compressed data: after the local header (30 bytes), the name (7) and the timestamp (9).
    const at = 30 + 'rd.json'.length + 9 + 5
    flipped[at] = flipped[at]! ^ 0xff
    const bad = join(root, 'zmieniony.zip')
    writeFileSync(bad, flipped)
    await expect(readBackupEntry(bad, 'rd.json')).rejects.toThrow(/Uszkodzony plik ZIP/)
    await expect(restoreToFolder(bad, join(root, 'z-uszkodzonego'))).rejects.toThrow(/Uszkodzony plik ZIP/)
    expect(existsSync(join(root, 'z-uszkodzonego'))).toBe(false)
  })

  it('ZIP64 (ponad 65 535 wpisów) jest czytany', async () => {
    const count = 65_536
    const items: ZipSource[] = Array.from({ length: count }, (_, i) => ({ name: `days/${i}.json`, read: () => ({ data: Buffer.alloc(0), mtime: new Date() }) }))
    items.push({ name: 'rd.json', read: () => ({ data: Buffer.from('{"ostatni":"źdźbło"}'), mtime: new Date() }) })
    const file = join(root, 'duży.zip')
    expect((await writeZipFile(file, items)).files).toBe(count + 1)
    expect(await withZip(file, async (zip) => zip.entries.length)).toBe(count + 1)
    expect((await readBackupEntry(file, 'rd.json'))?.toString('utf8')).toBe('{"ostatni":"źdźbło"}')
  }, 60_000)
})

describe('tydzień ISO kopii tygodniowej', () => {
  it('z samej daty, w każdej strefie czasowej komputera', () => {
    const cases: Array<[string, string]> = [
      ['2026-01-01', '2026-W01'],
      ['2025-12-29', '2026-W01'],
      ['2025-12-28', '2025-W52'],
      ['2026-12-31', '2026-W53'],
      ['2027-01-03', '2026-W53'],
      ['2027-01-04', '2027-W01'],
      ['2021-01-03', '2020-W53'],
      ['2024-12-30', '2025-W01'],
      ['2026-10-26', '2026-W44']
    ]
    const tz = process.env.TZ
    try {
      for (const zone of ['Europe/Warsaw', 'Pacific/Kiritimati', 'America/Adak']) {
        process.env.TZ = zone
        for (const [date, week] of cases) expect(isoWeekOf(date)).toBe(week)
      }
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
    expect(isoWeekOf('2026-02-30')).toBeNull()
  })
})
