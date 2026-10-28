/**
 * The bar's quiet lines of the computers and their files (spec „Kilka komputerów”, „Pliki na OneDrive”; A8-02, A8-07)
 * and OneDrive taken for not running only after 5 min without its process (A3-14).
 */
import { describe, expect, it } from 'vitest'
import { NO_SYNC, quitNotice, syncLines } from '@shared/sync/syncLines'
import { ONEDRIVE_DOWN_MS, OneDriveWatch } from '../../src/main/onedrive'
import { backupStatus } from '../../src/main/data/hub'

const at = (hhmm: string, day = '2026-10-28') => Date.parse(`${day}T${hhmm}:00+01:00`)

describe('ciche linie synchronizacji', () => {
  it('nic, gdy wszystko działa', () => {
    expect(syncLines(NO_SYNC, at('14:30'), '2026-10-28')).toEqual([])
  })

  it('teksty ze specyfikacji, bez kropki; „Brak zmian” z godziną, z innego dnia z datą', () => {
    const lines = syncLines({ oneDriveDown: true, sharedWith: ['PC B'], asleep: [{ id: 'pca', name: 'PC A', since: at('14:20') }], clockAhead: [{ id: 'pcb', name: 'PC B', minutes: 4 }], dayAhead: true, battery: true, backupFailed: false, unsynced: 0, folderAway: false }, at('14:40'), '2026-10-28', 'pca')
    expect(lines.map((l) => l.text)).toEqual([
      'Zegar innego komputera jest ponad dobę z przodu – działania automatyczne czekają',
      'Zegar PC B wyprzedza ten komputer o 4 min – sprawdź czas w Windows',
      'OneDrive nie działa na tym komputerze',
      'Pytania mogą pojawić się też na PC B',
      'Brak zmian z PC A od 14:20',
      'Oszczędzanie baterii może wstrzymać OneDrive'
    ])
    expect(lines.every((l) => !l.dot)).toBe(true)
    expect(lines.at(-1)).toMatchObject({ id: 'battery:2026-10-28:pca', actions: [{ id: 'ok', label: 'OK' }] })
    expect(syncLines({ ...NO_SYNC, asleep: [{ id: 'pca', name: 'PC A', since: at('23:10', '2026-10-27') }] }, at('09:00'), '2026-10-28')[0]!.text).toBe('Brak zmian z PC A od 27.10 23:10')
  })
})

describe('OneDrive nie działa dopiero po 5 min (A3-14)', () => {
  it('krótki restart nic nie zmienia; 5 min bez procesu – nie działa; odpowiedź „działa” od razu wraca', async () => {
    let now = at('10:00')
    let up = true
    const logs: string[] = []
    const w = new OneDriveWatch({ ask: async () => up, inOneDrive: () => true, log: (_l, m) => logs.push(m), now: () => now })
    await w.check()
    up = false
    await w.check()
    now += 60_000
    await w.check()
    expect(w.running).toBe(true)
    now += ONEDRIVE_DOWN_MS
    await w.check()
    expect(w.running).toBe(false)
    expect(logs).toEqual([expect.stringContaining('OneDrive nie działa')])
    up = true
    await w.check()
    expect(w.running).toBe(true)
  })

  it('folder poza OneDrive – zawsze działa; pomocnik niedostępny – zostaje ostatnia odpowiedź', async () => {
    const outside = new OneDriveWatch({ ask: async () => false, inOneDrive: () => false, log: () => undefined })
    await outside.check()
    expect(outside.running).toBe(true)
    let now = at('10:00')
    const w = new OneDriveWatch({ ask: async () => Promise.reject(new Error('pomocnik nie działa')), inOneDrive: () => true, log: () => undefined, now: () => now })
    await w.check()
    now += 2 * ONEDRIVE_DOWN_MS
    expect(w.running).toBe(true)
  })
})

describe('OneDrive po przeglądzie 0.23.0', () => {
  it('jedna odpowiedź „nie działa” i nic więcej – stan nie zmienia się sam z czasem; proces liczy się od razu', async () => {
    let now = at('10:00')
    let answer: () => Promise<boolean> = async () => false
    const w = new OneDriveWatch({ ask: () => answer(), inOneDrive: () => true, log: () => undefined, now: () => now })
    await w.check()
    expect([w.running, w.processRunning]).toEqual([true, false])
    now += 2 * ONEDRIVE_DOWN_MS
    answer = async () => Promise.reject(new Error('pomocnik nie działa'))
    await w.check()
    expect(w.running).toBe(true)
  })
})

describe('kopia zapasowa i zmiany czekające na folder (A3-06, A3-07)', () => {
  it('nieudana kopia – cicha linia od razu; zmiany czekające – z polską liczbą', () => {
    const lines = (s: Partial<typeof NO_SYNC>) => syncLines({ ...NO_SYNC, ...s }, at('14:40'), '2026-10-28').map((l) => l.text)
    expect(lines({ backupFailed: true })).toEqual(['Kopia zapasowa się nie udała – następna próba za godzinę'])
    expect(lines({ unsynced: 1, folderAway: true })).toEqual(['1 zmiana zapisze się po powrocie folderu danych'])
    expect(lines({ unsynced: 3, folderAway: true })).toEqual(['3 zmiany zapiszą się po powrocie folderu danych'])
    expect(lines({ unsynced: 12, folderAway: true })).toEqual(['12 zmian zapisze się po powrocie folderu danych'])
    // The folder there, a file held (OneDrive, an antivirus): they wait for it (A3-07 review).
    expect(lines({ unsynced: 2 })).toEqual(['2 zmiany czekają na zapis w folderze danych'])
  })

  it('przy wyjściu: powiadomienie tylko, gdy folderu w tej chwili nie ma i są zmiany', () => {
    expect(quitNotice(3, false)).toBe('3 zmiany zapiszą się po powrocie folderu danych (przy następnym starcie).')
    expect(quitNotice(3, true)).toBeNull()
    expect(quitNotice(0, false)).toBeNull()
  })

  it('okno ostrzega po 3 dniach bez kopii – od najnowszej kopii, bez żadnej od założenia folderu', () => {
    const now = at('14:40')
    expect(backupStatus({ failed: null, lastOk: '2026-10-26' }, null, now).stale).toBe(false)
    expect(backupStatus({ failed: null, lastOk: '2026-10-25' }, null, now).stale).toBe(true)
    // 3 whole days: at 04:30, before the day's own backup is due, a backup of 25.10 is not 3 days old yet.
    expect(backupStatus({ failed: null, lastOk: '2026-10-25' }, null, at('04:30')).stale).toBe(false)
    // Not known yet (before the first look at the backups): no warning.
    expect(backupStatus({ failed: null, lastOk: null, known: false }, at('10:00', '2026-10-01'), now).stale).toBe(false)
    expect(backupStatus({ failed: { error: 'plik zajęty' }, lastOk: null }, at('10:00', '2026-10-27'), now)).toEqual({ failed: 'plik zajęty', lastOk: null, stale: false })
    expect(backupStatus({ failed: null, lastOk: null }, at('10:00', '2026-10-24'), now).stale).toBe(true)
    expect(backupStatus({ failed: null, lastOk: null }, null, now).stale).toBe(false)
  })
})
