/**
 * The screens' fixes of 0.26.0 without a DOM (the review of E8, 5.3): a time typed in the ritual and the days not closed
 * – a refused text is never saved as the field's start (A6-14), the hours of the change of time (A8-09); the Monday
 * „Strona B” step closes at once in the window (A6-15).
 */
import { describe, expect, it } from 'vitest'
import type { FolderProbe, HistoryRecord } from '@shared/api'
import { failedFinish } from '@renderer/features/wizard/wizardStore'
import { retryMessage } from '@renderer/features/settings/DataSection'
import { chosenRecord, recordKey } from '@renderer/features/history/HistoryPage'
import { dropSettled, type TimelineItem } from '@renderer/features/plan/Timeline'
import { instantOf, savedInstant, SKIPPED_HOUR, typedOf } from '@renderer/features/ritual/dayTime'
import { sideBShown } from '@renderer/features/today/SideBStep'
import { newUserBlock } from '@shared/engine/planEdit'
import { ESTIMATE_RANGE } from '@shared/model/requests'
import { STEP_RANGE } from '@shared/model/routines'
import { durationParser } from '@renderer/components/fields'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { modalOpen, onModal, tabTarget } from '@renderer/lib/escape'
import { closeSideB, patchBlockDraft, setBlockDraft, useUi } from '@renderer/store/ui'

describe('godzina wpisana w rytuale (A6-14, A8-09)', () => {
  // 25.10.2026: 02:00–02:59 twice, in the logical day 24.10 (minute 1440 + 160 = 02:40).
  const AUTUMN = '2026-10-24'
  const firstOccurrence = Date.UTC(2026, 9, 25, 0, 40)
  const secondOccurrence = Date.UTC(2026, 9, 25, 1, 40)

  it('pole startuje z chwili wiersza: druga 02:40 zostaje drugą, pierwsza – pierwszą (bez przesunięcia o godzinę)', () => {
    expect(typedOf(AUTUMN, secondOccurrence)).toEqual({ min: 1600, pick: 'second' })
    expect(typedOf(AUTUMN, firstOccurrence)).toEqual({ min: 1600, pick: 'first' })
    expect(instantOf(AUTUMN, typedOf(AUTUMN, secondOccurrence))).toEqual({ ok: true, at: secondOccurrence })
    // Typed by hand: the first occurrence unless the second is chosen.
    expect(instantOf(AUTUMN, { min: 1600, pick: 'first' })).toEqual({ ok: true, at: firstOccurrence })
  })

  it('godzina, której nie ma (28.03.2027 02:30), jest odrzucana z komunikatem, a nie zapisywana jako 03:00', () => {
    expect(instantOf('2027-03-27', { min: 1440 + 150, pick: 'first' })).toEqual({ ok: false, message: SKIPPED_HOUR })
  })

  it('„Zapisz” po odrzuconym tekście nie wysyła godziny, do której wróciło pole – powtarza komunikat', () => {
    const start = typedOf('2026-10-21', Date.UTC(2026, 9, 21, 15, 30))
    expect(savedInstant('2026-10-21', { refused: 'Godzina 0:00–23:59' }, start)).toEqual({ ok: false, message: 'Godzina 0:00–23:59' })
    expect(savedInstant('2026-10-21', null, start)).toEqual({ ok: true, at: Date.UTC(2026, 9, 21, 15, 30) })
    expect(savedInstant('2026-10-21', { min: 18 * 60, pick: 'first' }, start)).toEqual({ ok: true, at: Date.UTC(2026, 9, 21, 16, 0) })
  })
})

describe('przeciągnięty blok nie wraca na chwilę na stare miejsce (A6-16)', () => {
  const item = (startMin: number): TimelineItem => ({ id: 'a', startMin, endMin: startMin + 60, title: 'Praca', marks: [], color: '#888', background: false })

  it('blokada upuszczenia trwa, dopóki nowe elementy dnia pokazują blok na starym miejscu', () => {
    const drop = { id: 'a', start: 11 * 60 }
    // Items counted again from the day before the edit came back: the old start – still held.
    expect(dropSettled([item(10 * 60)], drop)).toBe(false)
    // The edit read back: the block at its new start – the hold ends.
    expect(dropSettled([item(11 * 60)], drop)).toBe(true)
    expect(dropSettled([], drop)).toBe(true)
  })
})

describe('szkic nowego bloku przetrwa przejście na inny ekran (A6-17)', () => {
  it('szkic dnia zostaje w stanie okna; zmiana pola idzie od najnowszego szkicu; czyszczenie innego dnia go nie rusza', () => {
    const b = newUserBlock('inne', 10 * 60, 60, DEFAULT_SETTINGS.categories.inne!)
    setBlockDraft('2026-10-21', b)
    // The page is drawn anew (another screen and back): the draft is in the window's state.
    patchBlockDraft('2026-10-21', { durationMin: 90 })
    patchBlockDraft('2026-10-21', { note: 'notatka' })
    expect(useUi.getState().blockDraft).toEqual({ date: '2026-10-21', block: { ...b, durationMin: 90, note: 'notatka' } })
    setBlockDraft('2026-10-22', null)
    expect(useUi.getState().blockDraft?.date).toBe('2026-10-21')
    setBlockDraft('2026-10-21', null)
    expect(useUi.getState().blockDraft).toBeNull()
  })
})

describe('„Strona B” w poniedziałek (A6-15)', () => {
  it('„Dalej” albo „Pomiń” chowa krok w tym oknie od razu – zanim plik dnia przyjmie odpowiedź', () => {
    const monday = '2026-11-02'
    expect(sideBShown(monday, false, useUi.getState().sideBClosed)).toBe(true)
    closeSideB(monday)
    expect(sideBShown(monday, false, useUi.getState().sideBClosed)).toBe(false)
    // Another Monday, a day already answered in its file, a day that is not Monday.
    expect(sideBShown('2026-11-09', false, useUi.getState().sideBClosed)).toBe(true)
    expect(sideBShown('2026-11-09', true, null)).toBe(false)
    expect(sideBShown('2026-11-03', false, null)).toBe(false)
  })
})

describe('okna dialogowe trzymają fokus i skróty stron czekają (A6-21)', () => {
  it('Tab z ostatniego wraca na pierwszy, Shift+Tab z pierwszego (albo z pudełka) idzie na ostatni', () => {
    expect(tabTarget(3, 2, false)).toBe(0)
    expect(tabTarget(3, 0, true)).toBe(2)
    expect(tabTarget(3, -1, true)).toBe(2)
    expect(tabTarget(3, -1, false)).toBe(0)
    expect(tabTarget(3, 1, false)).toBeNull()
    expect(tabTarget(0, -1, false)).toBe(-1)
  })

  it('póki okno jest otwarte, Ctrl+N i Ctrl+1 … stron nie działają; dwa zamknięcia tego samego okna liczą się raz', () => {
    expect(modalOpen()).toBe(false)
    const off = onModal()
    expect(modalOpen()).toBe(true)
    off()
    off()
    expect(modalOpen()).toBe(false)
  })
})

describe('Historia po „Przywróć tę wersję” (A7-10)', () => {
  it('wybrany rekord jest brany z bieżącej listy – po przywróceniu nie jest już „usunięty”', () => {
    const before: HistoryRecord[] = [{ kind: 'request', id: 'r1', rel: 'requests/r1.json', versions: 2, last: 1, exists: false }]
    const after: HistoryRecord[] = [{ ...before[0]!, versions: 3, last: 2, exists: true }]
    const key = recordKey(before[0]!)
    expect(chosenRecord(before, key)?.exists).toBe(false)
    expect(chosenRecord(after, key)).toEqual(after[0])
    expect(chosenRecord(after, 'request/r2')).toBeNull()
    expect(chosenRecord(null, key)).toBeNull()
  })
})

describe('kreator po nieudanym „Zakończ” (A7-11)', () => {
  const probe = (hasData: boolean): FolderProbe => ({ path: 'C:\OneDrive\RD', exists: true, empty: !hasData, hasData, unreadable: null, entries: hasData ? 5 : 0, inOneDrive: true })

  it('przycisk wolny z powodem; dane zapisane przed błędem – kreator kolejnego komputera na podsumowaniu', () => {
    const p = failedFinish({ probe: probe(false) }, 'Folder nie otworzył się w czasie.', probe(true), 2)
    expect(p).toMatchObject({ busy: false, step: 2, probe: { hasData: true } })
    expect(p.error).toContain('kliknij „Zakończ” jeszcze raz')
  })

  it('bez danych w folderze – zostaje pierwszym komputerem, sam powód', () => {
    expect(failedFinish({ probe: probe(false) }, 'Brak miejsca.', probe(false), 2)).toEqual({ busy: false, probe: probe(false), error: 'Brak miejsca.' })
    // The folder could not be looked at again: the probe before stays.
    expect(failedFinish({ probe: probe(false) }, 'Brak miejsca.', null, 2).probe).toEqual(probe(false))
  })
})

describe('„Spróbuj ponownie” przeniesienia (A7-20)', () => {
  it('nieudana próba mówi, że znów się nie udało, i dlaczego', () => {
    expect(retryMessage({ ok: false, error: 'brak dostępu' })).toEqual({ text: 'Folder dalej się nie otwiera: brak dostępu', kind: 'error' })
    expect(retryMessage({ ok: true, error: null }).kind).toBe('success')
  })
})

describe('szacunek prośby i czas kroku spoza zakresu (A6-19)', () => {
  it('za długa wartość jest odrzucana z komunikatem, a nie obcinana po cichu', () => {
    expect(durationParser(ESTIMATE_RANGE)('10h')).toEqual({ ok: false, message: 'Najdłużej 8 h.' })
    expect(durationParser(ESTIMATE_RANGE)('1h30')).toEqual({ ok: true, value: 90 })
    expect(durationParser(STEP_RANGE)('5h')).toMatchObject({ ok: false })
  })
})
