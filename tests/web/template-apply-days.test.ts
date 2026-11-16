/**
 * „Zastosuj do… → Dziś” w oknie (D546, D547, D550, bez DOM): z blokami minionymi do zaliczenia zmiana plików dni i ich fakty idą JEDNYM
 * krokiem procesu głównego (`applyTemplateDays`, nie `edit`); linia liczy to, co przyjął – reszta „bez zaliczenia” z powodem, dzień zamknięty
 * „punkty przeliczono”; odmowa kroku – nic nie zapisane. „Cofnij”: najpierw ocena (`judgeTemplateUndo` – odmowa: nic, linia zostaje), potem
 * pliki i fakty jednym krokiem (`undoTemplateDays`), blok zmieniony od tego czasu zostaje. „Nie dodawaj minionych” – zwykła zmiana.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, RawRecord, RdApi, TemplateApplyResult, TemplateUndoJudged } from '@shared/api'
import { setAt } from '@shared/data/merge'
import { templateBlockId } from '@shared/engine/createDay'
import { dayFileFrom, planBlock, type Template } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { applyToDays } from '@renderer/features/templates/applyDays'
import { useData } from '@renderer/store/data'
import { UndoNotDone, useGroupLine } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'

// Thursday at 10:00 – the window's clock and the day's „now”. The default day has sessions 08:00–11:00 and 14:00–17:00.
const THU = '2026-11-19'
const AT = placeLogical(THU, 10 * 60)

const empty: Template = { id: 'zwykly', name: 'Zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [] }] }
const training: Template = {
  id: 'trening',
  name: 'Trening',
  dayType: 'zwykly',
  // Wednesday's own – never the template of the Thursday of the test.
  weekdays: [3],
  archived: false,
  versions: [
    {
      from: '2026-01-01',
      budgetMin: null,
      maxMin: null,
      blocks: [
        planBlock({ id: 'rano', categoryId: 'sport', startMin: 6 * 60, durationMin: 60, origin: 'template' }),
        planBlock({ id: 'po', categoryId: 'journaling', anchor: 'rano', durationMin: 15, origin: 'template' }),
        planBlock({ id: 'wieczor', categoryId: 'nauka', startMin: 21 * 60, durationMin: 60, origin: 'template' })
      ]
    }
  ]
}
const id = (b: string) => templateBlockId(THU, 'trening', b)
const dateOf = (rel: string) => /(\d{4}-\d{2}-\d{2})\.json$/.exec(rel)![1]!
const WRITTEN = ['pca-1', 'pca-2', 'pca-3', 'pca-4']

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
  useGroupLine.setState({ lines: {} })
})

type Facts = TemplateApplyResult['facts'][number]
function stub(o: { facts?: Partial<Facts>; apply?: Error; judged?: TemplateUndoJudged } = {}) {
  const files: Record<string, RawRecord | null> = {}
  const lay = (entries: EditEntry[]) =>
    entries.map((e) => {
      const date = dateOf(e.rel)
      files[date] = e.remove ? null : e.edits.reduce<RawRecord>((r, f) => setAt(r, f.path, f.value) as RawRecord, e.create ? {} : (files[date] ?? {}))
      return { status: 'applied' as const }
    })
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.map((d) => [d, files[d] ?? null])),
    dayData: async (date) => ({ date, dayFile: files[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }) as DayData,
    edit: vi.fn(async (entries: EditEntry[]) => lay(entries)),
    applyTemplateDays: vi.fn(async (entries: EditEntry[]) => {
      if (o.apply) throw o.apply
      return { outcomes: lay(entries), facts: [{ day: THU, written: WRITTEN, taken: [id('rano'), id('po')], skipped: [], closed: false, regradeFailed: null, ...o.facts }] }
    }),
    judgeTemplateUndo: vi.fn(async () => o.judged ?? { ok: true as const, kept: [{ day: THU, blocks: [] }] }),
    undoTemplateDays: vi.fn(async (entries: EditEntry[]) => ({ ok: true as const, outcomes: lay(entries), undone: [{ day: THU, blocks: [] }], closed: [], regradeFailed: [] })),
    dataView: async () => ({ today: THU }) as DataView
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: { today: THU } as DataView, templates: [empty, training] })
  return { files, rd }
}
const inPlan = (files: Record<string, RawRecord | null>) => {
  const f = dayFileFrom(files[THU] ?? {}, THU)
  return f.blocks.map((b) => b.id).filter((x) => !f.cancelled.includes(x))
}
const line = () => useGroupLine.getState().lines.template!

describe('„Zastosuj” dziś – plik i fakty jednym krokiem (D547)', () => {
  it('„Dodaj jako zrealizowane”: jedno `applyTemplateDays` z blokami do zaliczenia, bez osobnego `edit`; „Cofnij” – ocena, potem pliki i fakty razem', async () => {
    const s = stub()
    expect(await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'done' }, AT)).toBe(true)
    expect(s.rd.edit).not.toHaveBeenCalled()
    expect(s.rd.applyTemplateDays).toHaveBeenCalledWith([expect.objectContaining({ rel: expect.stringContaining(THU) })], [{ day: THU, ids: [id('rano'), id('po')], entry: 0 }])
    expect(inPlan(s.files).sort()).toEqual([id('po'), id('rano'), id('wieczor')].sort())
    expect(line().text).toBe('„Trening” – 1 dzień: dodano 3 bloki (w tym 2 zrealizowane)')
    await line().undo()
    expect(s.rd.judgeTemplateUndo).toHaveBeenCalledWith([{ day: THU, written: WRITTEN }])
    expect(s.rd.undoTemplateDays).toHaveBeenCalledWith([expect.objectContaining({ rel: expect.stringContaining(THU) })], [{ day: THU, written: WRITTEN, entry: 0 }], [{ day: THU, blocks: [] }])
    expect(inPlan(s.files)).toEqual([])
  })

  it('proces główny przyjął mniej: w linii „bez zaliczenia” z powodem; dzień zamknięty – „punkty przeliczono”', async () => {
    stub({ facts: { taken: [id('rano')], skipped: [{ id: id('po'), why: 'ran' }], closed: true } })
    await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'done' }, AT)
    expect(line().text).toBe('„Trening” – 1 dzień: dodano 3 bloki (w tym 1 zrealizowany) · 1 bez zaliczenia (w tym czasie coś trwało) · 1 dzień był zamknięty – punkty przeliczono')
  })

  it('odmowa kroku – nic nie zapisane, okno zostaje', async () => {
    const s = stub({ apply: new Error('nie wszystkie logi dnia 2026-11-19 są teraz czytelne – spróbuj za chwilę') })
    expect(await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'done' }, AT)).toBe(false)
    expect(inPlan(s.files)).toEqual([])
    expect(useUi.getState().toasts.map((t) => t.text).join(' ')).toContain('nie wszystkie logi dnia')
  })

  it('„Cofnij” odmówione przy ocenie – nic nie cofnięte, linia zostaje', async () => {
    const s = stub({ judged: { ok: false, why: 'tych zdarzeń nie ma już w logu dnia' } })
    await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'done' }, AT)
    await expect(line().undo()).rejects.toBeInstanceOf(UndoNotDone)
    expect(s.rd.undoTemplateDays).not.toHaveBeenCalled()
    expect(inPlan(s.files)).toHaveLength(3)
  })

  it('„Cofnij” z blokiem zmienionym od tego czasu: ten blok zostaje w pliku, reszta wraca; komunikat o nim', async () => {
    const s = stub({ judged: { ok: true, kept: [{ day: THU, blocks: [id('rano')] }] } })
    await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'done' }, AT)
    expect(await line().undo()).toBe('1 blok zmieniony od tego czasu – został')
    expect(s.rd.undoTemplateDays).toHaveBeenCalledWith(expect.any(Array), [{ day: THU, written: WRITTEN, entry: 0 }], [{ day: THU, blocks: [id('rano')] }])
    expect(inPlan(s.files)).toEqual([id('rano')])
  })

  it('„Nie dodawaj minionych”: zwykła zmiana bez faktów, minione policzone w linii', async () => {
    const s = stub()
    expect(await applyToDays(training, [THU], 'fill', { hours: 'plan', past: 'skip' }, AT)).toBe(true)
    expect(inPlan(s.files)).toEqual([id('wieczor')])
    expect(s.rd.applyTemplateDays).not.toHaveBeenCalled()
    expect(s.rd.edit).toHaveBeenCalledTimes(1)
    expect(line().text).toBe('„Trening” – 1 dzień: dodano 1 blok · pominięto 2 (minione)')
  })
})
