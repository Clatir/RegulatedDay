/**
 * The bar's quiet lines of the computers and their files (spec „Kilka komputerów”, „Pliki na OneDrive”; A8-02, A8-07)
 * and OneDrive taken for not running only after 5 min without its process (A3-14).
 */
import { describe, expect, it } from 'vitest'
import { NO_SYNC, syncLines } from '@shared/sync/syncLines'
import { ONEDRIVE_DOWN_MS, OneDriveWatch } from '../../src/main/onedrive'

const at = (hhmm: string, day = '2026-10-28') => Date.parse(`${day}T${hhmm}:00+01:00`)

describe('ciche linie synchronizacji', () => {
  it('nic, gdy wszystko działa', () => {
    expect(syncLines(NO_SYNC, at('14:30'), '2026-10-28')).toEqual([])
  })

  it('teksty ze specyfikacji, bez kropki; „Brak zmian” z godziną, z innego dnia z datą', () => {
    const lines = syncLines({ oneDriveDown: true, sharedWith: ['PC B'], asleep: [{ name: 'PC A', since: at('14:20') }], clockAhead: [{ name: 'PC B', minutes: 4 }], dayAhead: true, battery: true }, at('14:40'), '2026-10-28')
    expect(lines.map((l) => l.text)).toEqual([
      'Zegar innego komputera jest ponad dobę z przodu – działania automatyczne czekają',
      'Zegar PC B wyprzedza ten komputer o 4 min – sprawdź czas w Windows',
      'OneDrive nie działa na tym komputerze',
      'Pytania mogą pojawić się też na PC B',
      'Brak zmian z PC A od 14:20',
      'Oszczędzanie baterii może wstrzymać OneDrive'
    ])
    expect(lines.every((l) => !l.dot)).toBe(true)
    expect(lines.at(-1)).toMatchObject({ id: 'battery:2026-10-28', actions: [{ id: 'ok', label: 'OK' }] })
    expect(syncLines({ ...NO_SYNC, asleep: [{ name: 'PC A', since: at('23:10', '2026-10-27') }] }, at('09:00'), '2026-10-28')[0]!.text).toBe('Brak zmian z PC A od 27.10 23:10')
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
