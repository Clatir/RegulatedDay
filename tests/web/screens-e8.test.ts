/**
 * The screens' fixes of 0.19.0 without a DOM (the review of E8): the order of a routine's steps is a change (A6-02),
 * „Przyjmij nowsze” answers only field conflicts (A6-05), the anchors offered never close a cycle (A6-06), a double
 * click runs a saving action once (A6-04), a session's start after its end moves the end (A7-02), the questions name
 * blocks and say numbers in Polish (A6-20, A6-23).
 */
import { describe, expect, it } from 'vitest'
import type { DataView, EditQuestion, RdApi } from '@shared/api'
import { diffRecords, recordEdit, setAt } from '@shared/data/merge'
import { rdFrom } from '@shared/model/rd'
import { planBlock } from '@shared/model/plan'
import { sessionWithEnd, sessionWithStart, type SessionDef } from '@shared/model/settings'
import { newerChoices, questionsText } from '@renderer/app/Questions'
import { anchorCandidates } from '@renderer/features/plan/blockView'
import { oneAtATime } from '@renderer/lib/busy'
import { valueText } from '@renderer/lib/recordText'
import { resetSettingsFrom, saveSettings, setFromDate, useSettingsFrom } from '@renderer/features/settings/settingsStore'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { finishRecords, newLecture, patchWizard, resetWizard, useWizard } from '@renderer/features/wizard/wizardStore'
import { moveToNowPatch } from '@renderer/features/today/TodayPage'
import { placeLogical } from '@shared/time/day'

describe('kolejność kroków rutyny (A6-02)', () => {
  const before = { id: 'r', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 5 }] }
  const after = { ...before, normal: [before.normal[1]!, before.normal[0]!] }

  it('zamiana kroków to zmiana całej listy, zapisana w tej kolejności', () => {
    expect(diffRecords(before, after)).toEqual([{ path: ['normal'], before: before.normal, after: after.normal }])
    const e = recordEdit('routines/r.json', before, after)!
    expect(e.edits).toHaveLength(1)
    expect((setAt(before, e.edits[0]!.path, e.edits[0]!.value) as typeof before).normal.map((s) => s.id)).toEqual(['kot', 'woda'])
  })

  it('zmiana jednego kroku bez zmiany kolejności dalej idzie polem kroku', () => {
    const one = { ...before, normal: [{ ...before.normal[0]!, min: 3 }, before.normal[1]!] }
    expect(diffRecords(before, one)).toEqual([{ path: ['normal', '#woda', 'min'], before: 2, after: 3 }])
  })
})

describe('„Przyjmij nowsze” (A6-05)', () => {
  const q = (o: Partial<EditQuestion>): EditQuestion => ({ id: 'q', rel: 'routines/r.json', kind: 'conflict', at: 100, theirsAt: 200, fields: [], ...o }) as EditQuestion
  it('rozstrzyga tylko konflikty pól według czasu; usunięty i uszkodzony czekają na swoje przyciski', () => {
    expect(newerChoices([q({ id: 'a' }), q({ id: 'b', theirsAt: 50 }), q({ id: 'c', kind: 'removed', theirsAt: null }), q({ id: 'd', kind: 'broken' })])).toEqual([
      { id: 'a', choice: 'theirs' },
      { id: 'b', choice: 'mine' }
    ])
  })
})

describe('kotwice bloku (A6-06)', () => {
  it('lista „po bloku” pomija bloki, których łańcuch kotwic prowadzi do edytowanego', () => {
    const plan = [
      planBlock({ id: 'praca', categoryId: 'inne', startMin: 9 * 60, durationMin: 60 }),
      planBlock({ id: 'obiad', categoryId: 'inne', anchor: 'praca', durationMin: 30 }),
      planBlock({ id: 'spacer', categoryId: 'inne', anchor: 'obiad', durationMin: 30 }),
      planBlock({ id: 'inne', categoryId: 'inne', startMin: 15 * 60, durationMin: 30 })
    ]
    expect(anchorCandidates(plan, 'praca').map((b) => b.id)).toEqual(['inne'])
    expect(anchorCandidates(plan, 'spacer').map((b) => b.id)).toEqual(['praca', 'obiad', 'inne'])
  })
})

describe('podwójne kliknięcie przycisku, który zapisuje (A6-04)', () => {
  it('drugie kliknięcie w trakcie zapisu jest pomijane; po końcu – znów działa', async () => {
    let runs = 0
    let release!: () => void
    const busy: boolean[] = []
    const run = oneAtATime((b) => busy.push(b))
    const first = run(() => new Promise<void>((r) => ((runs += 1), (release = r))))
    expect(await run(async () => void (runs += 10))).toBeUndefined()
    release()
    await first
    await run(async () => void (runs += 100))
    expect(runs).toBe(101)
    expect(busy).toEqual([true, false, true, false])
  })
})

describe('sesja: początek po końcu (A7-02)', () => {
  const ny: SessionDef = { id: 'ny', name: 'NY', zone: 'America/New_York', startMin: 8 * 60, endMin: 11 * 60, markets: ['NYSE'] }
  it('przesuwa koniec z zachowaniem długości – sesja nie znika', () => {
    expect(sessionWithStart(ny, 13 * 60)).toMatchObject({ startMin: 13 * 60, endMin: 16 * 60 })
    expect(sessionWithStart(ny, 9 * 60)).toMatchObject({ startMin: 9 * 60, endMin: 11 * 60 })
    expect(sessionWithEnd(ny, 7 * 60)).toMatchObject({ endMin: 7 * 60 + 1440 })
    // Through midnight (23:00–07:00): a new start never makes it longer than a day nor past what a session can be.
    const night: SessionDef = { ...ny, startMin: 23 * 60, endMin: 31 * 60 }
    expect(sessionWithStart(night, 0)).toMatchObject({ startMin: 0, endMin: 8 * 60 })
    expect(sessionWithStart(night, 22 * 60)).toMatchObject({ startMin: 22 * 60, endMin: 31 * 60 })
    expect(sessionWithStart(night, 6 * 60).endMin - 6 * 60).toBeLessThanOrEqual(1440)
  })
})

describe('kreator: pusty wykład (A7-19)', () => {
  it('wykład dodany i zostawiony jak powstał nie trafia do folderu; bez nazwy, ale ustawiony – trafia', () => {
    resetWizard()
    patchWizard({ lectures: [newLecture('2026-10-28'), { ...newLecture('2026-10-28'), name: 'Analiza' }, { ...newLecture('2026-10-28'), weekday: 3, to: '2027-02-01' }] })
    const rels = finishRecords(useWizard.getState(), 1000, 'pca').map((r) => r.rel)
    expect(rels.filter((r) => r.startsWith('schedule/'))).toHaveLength(2)
  })
})

describe('ustawienia od dziś / od daty (A7-13, T513)', () => {
  it('data ≤ dziś odrzucona, po dziś przyjęta; wyjście z Ustawień wraca do „od jutra”', () => {
    useSettingsFrom.setState({ mode: 'date', date: '2026-11-05' })
    expect(setFromDate('2026-10-28', '2026-10-28')).toBe(false)
    expect(useSettingsFrom.getState().date).toBe('2026-11-05')
    expect(setFromDate('2026-10-29', '2026-10-28')).toBe(true)
    expect(useSettingsFrom.getState().date).toBe('2026-10-29')
    resetSettingsFrom()
    expect(useSettingsFrom.getState()).toEqual({ mode: 'tomorrow', date: null })
  })
})

describe('teksty pytań kolejki (A6-20, A6-23)', () => {
  it('polska odmiana liczby zmian', () => {
    expect(questionsText(1)).toBe('Jedna Twoja zmiana spotkała się ze zmianą z innego komputera.')
    expect(questionsText(2)).toBe('2 Twoje zmiany spotkały się ze zmianą z innego komputera.')
    expect(questionsText(5)).toBe('5 Twoich zmian spotkało się ze zmianą z innego komputera.')
    expect(questionsText(22)).toBe('22 Twoje zmiany spotkały się ze zmianą z innego komputera.')
  })

  it('lista bloków po nazwach, inne listy z odmianą', () => {
    const n = { rd: rdFrom(undefined), blockName: () => null }
    expect(valueText('blocks', [{ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60 }], n)).toBe('Inne obowiązki 10:00, 1 h')
    expect(valueText('x', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], n)).toBe('22 pozycje')
  })
})

describe('zmiana „od dziś” przy dniu, którego nie da się teraz odczytać (A7-08, A7-09)', () => {
  it('nic się nie zapisuje (nigdy zgadnięty typ dnia), komunikat mówi dlaczego', async () => {
    let edits = 0
    const rd: Partial<RdApi> = {
      dayData: async () => {
        throw new Error('folder zamknięty')
      },
      edit: async () => (edits++, [])
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: '2026-10-28' } as DataView })
    useUi.setState({ toasts: [] })
    useSettingsFrom.setState({ mode: 'today', date: null })
    expect(await saveSettings({ dayTypes: { zwykly: { budgetMin: 420 } } })).toBe(false)
    expect(edits).toBe(0)
    expect(useUi.getState().toasts.some((t) => t.text.includes('„od dziś” nie została zapisana'))).toBe(true)
    resetSettingsFrom()
  })
})

describe('„Przesuń na teraz” (A1-04, przegląd 0.21.0)', () => {
  it('nowy start to pełna minuta teraz – plik dnia przyjmuje tylko pełne minuty – bez kotwicy', () => {
    const p = moveToNowPatch('2026-10-28', placeLogical('2026-10-28', 19 * 60 + 40) + 37_000)
    expect(p).toEqual({ startMin: 19 * 60 + 40, anchor: null })
    expect(planBlock({ id: 'ds', categoryId: 'inne', durationMin: 60, ...p })?.startMin).toBe(19 * 60 + 40)
  })
})
