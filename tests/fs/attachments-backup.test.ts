/**
 * Attachments in the backups (D410, T809): the records in every backup, the files only in the weekly one and the one
 * before an update (streamed – any size, never whole in memory); a whole backup restored brings the files back; files
 * taken back with their records never write over one there and a backup without them removes nothing.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyLatestTo, createDailyBackup, createUpdateBackup, restoreAttachmentFiles, restoreToFolder } from '../../src/main/data/backup'
import { withZip, writeZipFile } from '../../src/main/data/zip'

let root: string
let data: string
let backups: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-att-backup-'))
  data = join(root, 'RegulatedDay')
  backups = join(data, 'backups')
  mkdirSync(data)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function put(dir: string, rel: string, content: string | Buffer): void {
  const file = join(dir, ...rel.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

const record = (id: string, fileName: string) => `${JSON.stringify({ schema: 1, id, kind: 'file', name: fileName, file: { fileName, size: 1 }, owner: { scope: 'day', date: '2026-11-12', blockId: 'b' }, addedAt: 1, removedAt: null })}\n`
const names = (file: string) => withZip(file, async (zip) => zip.entries.map((e) => e.name).sort())
/** A file of a few MB with every byte known (streamed in chunks of 1 MB). */
const big = Buffer.from(Array.from({ length: 3 * 1024 * 1024 + 17 }, (_, i) => (i * 31) % 251))

function makeData(): void {
  put(data, 'rd.json', '{"format":1}\n')
  put(data, 'attachments/a1.json', record('a1', 'film.mp4'))
  put(data, 'attachments/a1/film.mp4', big)
  put(data, 'attachments/a2.json', record('a2', 'notatki.json'))
  put(data, 'attachments/a2/notatki.json', '{"to":"plik, nie rekord"}')
  // A copy cut short: hidden, never in a backup.
  put(data, 'attachments/a1/.film.mp4.tmp-0123abcd', 'pół')
  // A record whose file is gone (deleted after 30 days elsewhere, or not here yet).
  put(data, 'attachments/a3.json', record('a3', 'brak.pdf'))
}

describe('kopie zapasowe z załącznikami (D410, T809)', () => {
  it('dzienna: tylko rekordy; tygodniowa (z najnowszej dziennej minionego tygodnia): rekordy i pliki', async () => {
    makeData()
    const daily = await createDailyBackup(data, backups, '2026-11-08')
    expect(daily.ok).toBe(true)
    expect(await names(join(backups, 'daily', '2026-11-08.zip'))).toEqual(['attachments/a1.json', 'attachments/a2.json', 'attachments/a3.json', 'rd.json'])
    // Monday of the next week: the daily of Sunday becomes the weekly of its week, with the files.
    const next = await createDailyBackup(data, backups, '2026-11-09')
    expect(next.ok && next.rotateError).toBeFalsy()
    const weekly = join(backups, 'weekly', '2026-W45.zip')
    expect(await names(weekly)).toEqual(['attachments/a1.json', 'attachments/a1/film.mp4', 'attachments/a2.json', 'attachments/a2/notatki.json', 'attachments/a3.json', 'rd.json'])
    const out = join(root, 'przywrócony')
    await restoreToFolder(weekly, out)
    expect(readFileSync(join(out, 'attachments', 'a1', 'film.mp4')).equals(big)).toBe(true)
    expect(readFileSync(join(out, 'attachments', 'a2', 'notatki.json'), 'utf8')).toBe('{"to":"plik, nie rekord"}')
    expect(existsSync(join(out, 'attachments', 'a1', '.film.mp4.tmp-0123abcd'))).toBe(false)
  })

  it('przed aktualizacją: rekordy i pliki', async () => {
    makeData()
    const r = await createUpdateBackup(data, backups, '1.13.0', '1.14.0')
    expect(r?.ok).toBe(true)
    const file = join(backups, 'aktualizacje', '1.13.0-do-1.14.0.zip')
    expect(await names(file)).toEqual(['attachments/a1.json', 'attachments/a1/film.mp4', 'attachments/a2.json', 'attachments/a2/notatki.json', 'attachments/a3.json', 'rd.json'])
    const out = join(root, 'z-aktualizacji')
    await restoreToFolder(file, out)
    expect(readFileSync(join(out, 'attachments', 'a1', 'film.mp4')).equals(big)).toBe(true)
  })

  it('przed aktualizacją ponad próg (D412): sama lista załączników, linia w logu z łącznym rozmiarem; do progu – z plikami', async () => {
    makeData()
    const logs: string[] = []
    const total = big.length + Buffer.byteLength('{"to":"plik, nie rekord"}')
    const r = await createUpdateBackup(data, backups, '1.13.0', '1.14.0', { filesMax: total - 1, log: (_level, msg) => logs.push(msg) })
    expect(r?.ok).toBe(true)
    expect(await names(join(backups, 'aktualizacje', '1.13.0-do-1.14.0.zip'))).toEqual(['attachments/a1.json', 'attachments/a2.json', 'attachments/a3.json', 'rd.json'])
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain(`${total} B`)
    const exact = await createUpdateBackup(data, backups, '1.14.0', '1.15.0', { filesMax: total, log: (_level, msg) => logs.push(msg) })
    expect(exact?.ok).toBe(true)
    expect(await names(join(backups, 'aktualizacje', '1.14.0-do-1.15.0.zip'))).toContain('attachments/a1/film.mp4')
    expect(logs).toHaveLength(1)
  })

  it('dodatkowe miejsce dostaje kopie tygodniowe folderu (z plikami)', async () => {
    makeData()
    await createDailyBackup(data, backups, '2026-11-08')
    await createDailyBackup(data, backups, '2026-11-09')
    const extra = join(root, 'dysk-zewnętrzny')
    expect(await copyLatestTo(backups, extra)).toBe('2026-11-09.zip')
    expect(await names(join(extra, 'weekly', '2026-W45.zip'))).toContain('attachments/a1/film.mp4')
  })

  it('pliki z rekordami z kopii: brakujący wraca, istniejącego nie nadpisuje, kopia bez plików niczego nie usuwa', async () => {
    makeData()
    await createDailyBackup(data, backups, '2026-11-08')
    await createDailyBackup(data, backups, '2026-11-09')
    const weekly = join(backups, 'weekly', '2026-W45.zip')
    rmSync(join(data, 'attachments', 'a1'), { recursive: true })
    put(data, 'attachments/a2/notatki.json', 'nowsza treść')
    expect((await restoreAttachmentFiles(weekly, new Set(['a1', 'a2']), data)).sort()).toEqual(['attachments/a1/film.mp4'])
    expect(readFileSync(join(data, 'attachments', 'a1', 'film.mp4')).equals(big)).toBe(true)
    expect(readFileSync(join(data, 'attachments', 'a2', 'notatki.json'), 'utf8')).toBe('nowsza treść')
    // The daily backup has no files: nothing comes back and nothing goes.
    expect(await restoreAttachmentFiles(join(backups, 'daily', '2026-11-09.zip'), new Set(['a1', 'a2']), data)).toEqual([])
    expect(existsSync(join(data, 'attachments', 'a1', 'film.mp4'))).toBe(true)
    expect(existsSync(join(data, 'attachments', 'a2', 'notatki.json'))).toBe(true)
  })

  it('folder danych niedostępny: pliki z kopii nie tworzą go w jego miejscu', async () => {
    makeData()
    await createDailyBackup(data, backups, '2026-11-08')
    await createDailyBackup(data, backups, '2026-11-09')
    const weekly = join(root, 'w.zip')
    writeFileSync(weekly, readFileSync(join(backups, 'weekly', '2026-W45.zip')))
    rmSync(data, { recursive: true, force: true })
    await expect(restoreAttachmentFiles(weekly, new Set(['a1']), data)).rejects.toThrow()
    expect(existsSync(data)).toBe(false)
  })
})

describe('poprawki po przeglądzie (T836)', () => {
  it('plik załącznika nieczytelny przy pakowaniu (brak, zmieniony rozmiar) – pominięty, ZIP poprawny, kopia dalej (T836)', async () => {
    put(data, 'a.json', '{"a":1}')
    put(data, 'krótki.bin', 'abc')
    const out = join(root, 'z.zip')
    const r = await writeZipFile(out, [
      { name: 'a.json', read: () => ({ data: Buffer.from('{"a":1}'), mtime: new Date() }) },
      { name: 'attachments/x/brak.pdf', read: () => ({ path: join(data, 'nie-ma.pdf'), size: 10, mtime: new Date() }) },
      // Its stat said more than it holds now: a part already written – taken back.
      { name: 'attachments/x/krótki.bin', read: () => ({ path: join(data, 'krótki.bin'), size: 5 * 1024 * 1024, mtime: new Date() }) },
      { name: 'b.json', read: () => ({ data: Buffer.from('{"b":2}'), mtime: new Date() }) }
    ])
    expect(r.skipped).toEqual(['attachments/x/brak.pdf', 'attachments/x/krótki.bin'])
    expect(r.files).toBe(2)
    await withZip(out, async (zip) => {
      expect(zip.entries.map((e) => e.name)).toEqual(['a.json', 'b.json'])
      expect((await zip.read(zip.entries[1]!)).toString()).toBe('{"b":2}')
    })
  })

  it('tygodniowa: wpisy dziennej skopiowane bez ponownego pakowania, z czasem zmiany każdego pliku (T836)', async () => {
    makeData()
    const old = new Date('2020-03-04T05:06:08Z')
    utimesSync(join(data, 'rd.json'), old, old)
    await createDailyBackup(data, backups, '2026-11-08')
    await createDailyBackup(data, backups, '2026-11-09')
    const of = (file: string) => withZip(file, async (zip) => Object.fromEntries(zip.entries.map((e) => [e.name, e])))
    const daily = await of(join(backups, 'daily', '2026-11-08.zip'))
    const weekly = await of(join(backups, 'weekly', '2026-W45.zip'))
    expect(weekly['rd.json']!.unix).toBe(Math.floor(old.getTime() / 1000))
    for (const name of Object.keys(daily)) {
      const [d, w] = [daily[name]!, weekly[name]!]
      expect([w.crc, w.csize, w.size, w.method, w.time, w.date, w.unix], name).toEqual([d.crc, d.csize, d.size, d.method, d.time, d.date, d.unix])
    }
  })
})

describe('przywrócenie kopii bez plików dociąga pliki (T838)', () => {
  it('cały folder z kopii dziennej: pliki z obecnego folderu, a brakujące tam – z najnowszej tygodniowej', async () => {
    makeData()
    await createDailyBackup(data, backups, '2026-11-08')
    await createDailyBackup(data, backups, '2026-11-09')
    // a1 gone from the folder since (the weekly still has it); a2 still here.
    rmSync(join(data, 'attachments', 'a1'), { recursive: true })
    const out = join(root, 'nowy')
    await restoreToFolder(join(backups, 'daily', '2026-11-09.zip'), out, { from: data, backupsDir: backups })
    expect(readFileSync(join(out, 'attachments', 'a1', 'film.mp4')).equals(big)).toBe(true)
    expect(readFileSync(join(out, 'attachments', 'a2', 'notatki.json'), 'utf8')).toBe('{"to":"plik, nie rekord"}')
    // Nothing taken from the folder it came from.
    expect(existsSync(join(data, 'attachments', 'a2', 'notatki.json'))).toBe(true)
    expect(existsSync(join(out, 'attachments', 'a3'))).toBe(false)
  })
})
