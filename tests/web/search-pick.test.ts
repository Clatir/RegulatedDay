/**
 * What Enter in the search leaves for the screen it opens (SNT6, T653): one pick, used once by the screen it is meant
 * for; going anywhere by hand drops it, so it never fires later on a screen the user opened for another reason.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { closeToast, navigate, openDay, openPick, openRitual, takeFoundPick, takePick, useUi } from '@renderer/store/ui'

beforeEach(() => {
  // The store commits the active field first; there is no document in this environment.
  Object.assign(globalThis, { document: { activeElement: null }, HTMLInputElement: class {}, HTMLTextAreaElement: class {} })
  useUi.setState({ page: 'today', day: null, focus: null, pick: null })
  for (const x of useUi.getState().toasts) closeToast(x.id)
})

describe('wybór z wyszukiwarki w stanie okna', () => {
  it('openPick otwiera ekran i dzień naraz i zostawia wybór', () => {
    openPick({ page: 'today', day: '2026-03-02' }, { kind: 'block', id: 'a', date: '2026-03-02' })
    const s = useUi.getState()
    expect([s.page, s.day, s.pick]).toEqual(['today', '2026-03-02', { kind: 'block', id: 'a', date: '2026-03-02' }])
  })

  it('bez dnia nie rusza wybranego dnia (inny ekran niż „Dziś”)', () => {
    useUi.setState({ day: '2026-03-02' })
    openPick({ page: 'requests' }, { kind: 'request', id: 'r1' })
    expect(useUi.getState().day).toBe('2026-03-02')
    expect(useUi.getState().page).toBe('requests')
  })

  it('takePick oddaje wybór jeden raz, tylko temu, kto go przyjmuje', () => {
    openPick({ page: 'routines' }, { kind: 'routine', id: 'x' })
    expect(takePick((p) => p.kind === 'template')).toBeNull()
    expect(useUi.getState().pick).not.toBeNull()
    expect(takePick((p) => p.kind === 'routine')).toEqual({ kind: 'routine', id: 'x' })
    expect(useUi.getState().pick).toBeNull()
    expect(takePick(() => true)).toBeNull()
  })

  it('przejście ręczne (menu, dzień, rytuał) gubi niewykorzystany wybór', () => {
    for (const go of [() => navigate('stats'), () => openDay('2026-01-01'), () => openRitual()]) {
      openPick({ page: 'templates' }, { kind: 'template', id: 't' })
      go()
      expect(useUi.getState().pick).toBeNull()
    }
  })

  it('takeFoundPick: rekord jest – oddany i zużyty; rekordu nie ma – wybór zużyty z komunikatem, nie czeka na późniejszą synchronizację', () => {
    openPick({ page: 'requests' }, { kind: 'request', id: 'r1' })
    expect(takeFoundPick((p) => p.kind === 'request', (p) => p.id === 'r1', 'Tej prośby nie ma już.')).toEqual({ kind: 'request', id: 'r1' })
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts).toHaveLength(0)

    openPick({ page: 'requests' }, { kind: 'request', id: 'gone' })
    expect(takeFoundPick((p) => p.kind === 'request', (p) => p.id === 'r1', 'Tej prośby nie ma już.')).toBeNull()
    expect(useUi.getState().pick).toBeNull()
    expect(useUi.getState().toasts.map((x) => x.text)).toEqual(['Tej prośby nie ma już.'])
  })

  it('takeFoundPick: wybór dla innego ekranu zostaje nietknięty, bez komunikatu', () => {
    openPick({ page: 'routines' }, { kind: 'routine', id: 'x' })
    expect(takeFoundPick((p) => p.kind === 'request', () => false, 'nie')).toBeNull()
    expect(useUi.getState().pick).toEqual({ kind: 'routine', id: 'x' })
    expect(useUi.getState().toasts).toHaveLength(0)
  })
})
