/**
 * The screens of „Sprawy” (OPS2, D383, D384, D402, D408) without a DOM: the five lists as the page shows them (the header of
 * „Dziś”, „Zrobione” of 7 days and „Pokaż starsze”), where a sprawa stands in words, the names of sprawy (a task by its
 * title), the drop on the axis of „Dziś” (a task dropped at 10:00 is a block of 30 min „Inne” named by it – with what it
 * pushes apart and the bar's „Cofnij”), the morning plan's step, the ritual's lines, the shortcut field of the settings
 * and „Powtarzaj” not offered on a task's block.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { blockName } from '@shared/blockName'
import { paths } from '@shared/data/paths'
import { caseItems, morningCases, morningMinutes } from '@shared/engine/cases'
import { computeDay } from '@shared/engine/day'
import { rdFrom } from '@shared/model/rd'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom, type RequestRecord } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { morningOutcome } from '@renderer/features/today/MorningPlan'
import { nextFreeStart, queueRowText, startSearchFrom, submitTitle } from '@renderer/features/cases/casesUi'
import { oneAtATime } from '@renderer/lib/busy'
import { afterRequestAdded, backText, caseTitle, filterOf, isMorningChosen, morningChosen, sectionsOf, somedayText, statusParts } from '@renderer/features/cases/casesLogic'
import { planningOf, plannedText, planOnAxis } from '@renderer/features/cases/planOnAxis'
import { dropMinute, HOURS_PX, type AxisPoint } from '@renderer/features/plan/axisDrop'
import { repeatNote } from '@renderer/features/series/BlockSeries'
import { parseQuickKey, quickKeyNote, quickKeyShown } from '@renderer/features/settings/quickKey'
import { backupRecordText } from '@renderer/features/settings/DataSection'
import { recordTitle } from '@renderer/app/Questions'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

const TODAY = '2026-11-12'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const task = (id: string, p: Partial<Parameters<typeof newTask>[3]> = {}, createdAt = at(TODAY)) => newTask(id, createdAt, TODAY, { title: `zadanie ${id}`, ...p })!
const items = (raws: Array<Record<string, unknown>>, today = TODAY) => caseItems(raws.map((r) => requestFrom(r)!), today, () => undefined)

describe('listy strony „Sprawy” (D383, D402)', () => {
  it('pięć list w kolejności; nagłówek „Dziś” z sumą szacunków (zadania i prośby), bez sumy – samo „Dziś”', () => {
    const list = items([task('a', { list: 'today', estimateMin: 120 }), task('b', { list: 'today' }), newRequest('r', at(TODAY), { person: 'mama', estimateMin: 15, note: '' }), task('c', { list: 'someday' })])
    const s = sectionsOf(list, { showOlder: false })
    expect(s.map((x) => x.list)).toEqual(['inbox', 'today', 'week', 'someday', 'done'])
    expect(s.map((x) => x.title)).toEqual(['Skrzynka', 'Dziś · 2 h 30 min', 'W tym tygodniu', 'Kiedyś / Może', 'Zrobione'])
    expect(sectionsOf(items([task('x', { list: 'inbox' })]), { showOlder: false })[1]!.title).toBe('Dziś')
  })

  it('filtr nie zmienia sumy w nagłówku „Dziś”; nowsze zadanie na górze listy', () => {
    const list = items([task('old', { list: 'today', estimateMin: 60 }, at(TODAY, 8)), task('new', { list: 'today', estimateMin: 30 }, at(TODAY, 10))])
    const s = sectionsOf(list, { showOlder: false, keep: (x) => x.record.id === 'old' })
    expect(s[1]!.title).toBe('Dziś · 1 h 30 min')
    expect(s[1]!.items.map((x) => x.record.id)).toEqual(['old'])
    expect(sectionsOf(list, { showOlder: false })[1]!.items.map((x) => x.record.id)).toEqual(['new', 'old'])
  })

  it('nowa prośba: odmowa zapisu nic nie zmienia; zapisana otwiera listy, a filtry czyści tylko, gdy by ją ukryły', () => {
    expect(afterRequestAdded(null, [])).toBeNull()
    expect(afterRequestAdded(null, ['kind:task'])).toBeNull()
    expect(afterRequestAdded('r9', [])).toEqual({ bring: 'r9', clearFilters: false })
    expect(afterRequestAdded('r9', ['kind:request', 'person:?'])).toEqual({ bring: 'r9', clearFilters: false })
    expect(afterRequestAdded('r9', ['kind:task'])).toEqual({ bring: 'r9', clearFilters: true })
    expect(afterRequestAdded('r9', ['person:p1'])).toEqual({ bring: 'r9', clearFilters: true })
  })

  it('filtry: rodzaj i osoba; filtr osoby zostawia tylko prośby (zadanie nie ma osoby)', () => {
    const list = items([task('t'), newRequest('r1', 1, { person: 'p1', estimateMin: null, note: '' }), newRequest('r2', 1, { person: null, estimateMin: null, note: '' })])
    const ids = (f: string[]) => list.filter(filterOf(f)).map((x) => x.record.id).sort()
    expect(ids([])).toEqual(['r1', 'r2', 't'])
    expect(ids(['kind:task'])).toEqual(['t'])
    expect(ids(['kind:request'])).toEqual(['r1', 'r2'])
    expect(ids(['person:p1'])).toEqual(['r1'])
    expect(ids(['person:?'])).toEqual(['r2'])
    expect(ids(['person:p1', 'person:?'])).toEqual(['r1', 'r2'])
  })

  it('„Zrobione”: ostatnie 7 dni, starsze za „Pokaż starsze”', () => {
    const done = (id: string, day: string) => ({ ...task(id), list: 'done', state: 'done', doneAt: at(day) })
    const list = items([done('fresh', TODAY), done('week', '2026-11-06'), done('old', '2026-11-05')])
    const s = sectionsOf(list, { showOlder: false })[4]!
    expect(s.items.map((x) => x.record.id)).toEqual(['fresh', 'week'])
    expect(s.older).toBe(1)
    const all = sectionsOf(list, { showOlder: true })[4]!
    expect(all.items.map((x) => x.record.id)).toEqual(['fresh', 'week', 'old'])
    expect(all.older).toBe(0)
  })

  it('niezrobione o 04:00 wróciły do „W tym tygodniu” z dopiskiem; „zaplanowane” z godziną bloku; „porzucone”', () => {
    const rolled = items([task('t', { list: 'today' })], '2026-11-13')[0]!
    expect(rolled.list).toBe('week')
    expect(statusParts(rolled)).toEqual(['wróciło z „Dziś” 12.11.2026'])
    const planned = { ...task('p', { list: 'today' }), day: TODAY, block: 'b1', state: 'planned' }
    const day = dayFileFrom({ schema: 1, date: TODAY, blocks: [{ id: 'b1', categoryId: 'inne', startMin: lm('10:00'), durationMin: 30, origin: 'user', task: 'p' }] }, TODAY)
    const withBlock = caseItems([requestFrom(planned)!], TODAY, () => day)[0]!
    expect(statusParts(withBlock)).toEqual(['zaplanowane 12.11.2026 10:00'])
    // The day's file not read yet: the sprawa is „zaplanowane” as its record says, without the hour.
    expect(statusParts(caseItems([requestFrom(planned)!], TODAY, () => undefined)[0]!)).toEqual(['zaplanowane 12.11.2026'])
    const dropped = items([{ schema: 1, id: 'd', person: null, estimateMin: 10, note: 'x', createdAt: 1, state: 'dropped', day: null, block: null }])[0]!
    expect(statusParts(dropped)).toContain('porzucone')
  })
})

describe('nazwy spraw (D383: zadanie tytułem, nie „osoba: ?”)', () => {
  const rd = rdFrom({ people: [{ id: 'p1', name: 'Ania' }] })
  it('zadanie – tytuł; prośba – osoba i notatka; prośba bez osoby – „osoba: ?”', () => {
    expect(caseTitle(requestFrom(task('t', { title: 'Wymienić filtr' }))!, rd)).toBe('Wymienić filtr')
    expect(caseTitle(requestFrom(newRequest('r', 1, { person: 'p1', estimateMin: null, note: 'zakupy' }))!, rd)).toBe('Ania: zakupy')
    expect(caseTitle(requestFrom(newRequest('r2', 1, { person: null, estimateMin: null, note: '' }))!, rd)).toBe('osoba: ?')
  })

  it('Historia, kopie i pytania: zadanie nazwane tytułem', () => {
    const t = requestFrom(task('t1', { title: 'Wymienić filtr' }))!
    expect(recordTitle('requests/t1.json', [t])).toBe('Zadanie: Wymienić filtr')
    expect(recordTitle('requests/r9.json', [t])).toBe('Sprawa')
    expect(recordTitle('requests/r1.json', [requestFrom(newRequest('r1', 1, { person: null, estimateMin: null, note: '' }))!])).toBe('Prośba')
    const base = { date: null, person: null, at: Date.UTC(2026, 9, 12, 8) }
    expect(backupRecordText({ rel: 'requests/t1.json', kind: 'request', name: 'Wymienić filtr', task: true, ...base }, rd)).toBe('Zadanie: Wymienić filtr (dodane 12.10.2026)')
    expect(backupRecordText({ rel: 'requests/r1.json', kind: 'request', name: 'zakupy', ...base }, rd)).toBe('Prośba: zakupy (dodana 12.10.2026)')
  })

  it('pola sprawy w historii: tytuł, lista i rodzaj po ludzku', () => {
    expect(fieldText('requests/t1.json', ['title'], { rd })).toBe('tytuł')
    expect(fieldText('requests/t1.json', ['list'], { rd })).toBe('lista')
    expect(valueText('list', 'someday', { rd })).toBe('Kiedyś / Może')
    expect(valueText('kind', 'task', { rd })).toBe('zadanie')
  })
})

describe('upuszczenie na oś „Dziś” (D384): minuta pod wskaźnikiem', () => {
  const axis: AxisPoint = { rect: { left: 300, right: 700, top: 100, bottom: 100 + 720 * 1.1 }, lo: 6 * 60, hi: 18 * 60, ppm: 1.1 }
  it('minuta z pozycji na siatce 5 min; poza osią – nic; kolumna godzin też jest osią', () => {
    // 4 h under the top at 1.1 px a minute: 10:00.
    expect(dropMinute(axis, 400, 100 + 240 * 1.1)).toBe(10 * 60)
    expect(dropMinute(axis, 300 - HOURS_PX, 100 + 240 * 1.1)).toBe(10 * 60)
    expect(dropMinute(axis, 300 - HOURS_PX - 1, 200)).toBeNull()
    expect(dropMinute(axis, 400, 99)).toBeNull()
    expect(dropMinute(axis, 701, 200)).toBeNull()
    // Never so low that the block could not be drawn.
    expect(dropMinute(axis, 400, 100 + 720 * 1.1)).toBe(18 * 60 - 5)
  })
})

const stubWindow = (records: RawRecord[], days: Record<string, RawRecord | null>) => {
  const sent: EditEntry[][] = []
  const planPushed = vi.fn(async () => undefined)
  const state = { records: [...records], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in state.days)
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    planPushed
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  return { sent, planPushed }
}

/** „Dziś” as the window counts it: the plan of the day, its state (a model made like the one `useDay` gives). */
function dayOf(date: string, plan = [block({ id: 'a', cat: 'inne', at: '10:00', min: 60, origin: 'user' }), block({ id: 'b', cat: 'inne', at: '11:00', min: 60, origin: 'user' })]) {
  const s = new Scenario({ date, plan }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { date, ctx, state: computeDay(ctx), data: { dayFile: null } } as unknown as DayModel
}

describe('sprawa przeciągnięta na oś (D384, D367, planOnAxis)', () => {
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
    useUi.setState({ toasts: [] })
  })

  it('zadanie upuszczone na 10:00: blok 30 min „Inne” nazwany tytułem; zajęte miejsce rozsuwa kolejne bloki; „Cofnij” w toaście i w pasku', async () => {
    const t = task('t1', { title: 'Zadzwonić do banku' })
    // Blocks of yours live in the day's file (the push writes only blocks still in it, T764).
    const { sent, planPushed } = stubWindow([t], { [TODAY]: { schema: 1, date: TODAY, blocks: dayOf(TODAY).ctx.plan.map((b) => ({ ...b })) } })
    const model = dayOf(TODAY)
    const r = requestFrom(t)!
    // Counted once, before the write: the same block and the same pushed starts the edit gets.
    const plan = planningOf(model, TODAY, r, lm('10:00'))
    expect(plan.block).toMatchObject({ categoryId: 'inne', startMin: lm('10:00'), durationMin: 30, task: 't1', origin: 'user' })
    expect(plan.pushed.map((p) => [p.block.id, p.startMin])).toEqual([['a', lm('10:30')], ['b', lm('11:30')]])

    const res = await planOnAxis(model, TODAY, r, 'Zadzwonić do banku', lm('10:00'))
    expect(res.saved).toBe(true)
    expect(res.block).toMatchObject({ categoryId: 'inne', startMin: lm('10:00'), durationMin: 30, task: 't1' })
    // The block is named by the task, its category stays the colour (D408).
    expect(blockName(res.block!, { rd: rdFrom({}), settings: model.state.settings, routines: [], requests: [r] })).toBe('Zadzwonić do banku')
    // One edit of the queue: the day's file (the new block and the two pushed) and the record „zaplanowane”.
    expect(sent).toHaveLength(1)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
    const after = res.undo.find((u) => u.rel === paths.day(TODAY))!.after
    expect(dayFileFrom(after, TODAY).blocks.map((b) => [b.id, b.startMin]).sort()).toEqual([['a', lm('10:30')], ['b', lm('11:30')], [res.block!.id, lm('10:00')]].sort())
    expect(planPushed).toHaveBeenCalledWith(TODAY, 2, expect.objectContaining({ rel: paths.day(TODAY) }), null, undefined, 0)
    // The toast „Cofnij” says where.
    const [toast] = useUi.getState().toasts
    expect(toast).toMatchObject({ text: plannedText('Zadzwonić do banku', res.block!), action: { label: 'Cofnij' } })
    expect(toast!.text).toBe('Zaplanowano „Zadzwonić do banku” na 10:00')
  })

  it('wolne miejsce: nic nie rozsunięte, bar nie dostaje „Przesunięto N bloków”', async () => {
    const t = task('t1')
    const { planPushed } = stubWindow([t], { [TODAY]: null })
    const res = await planOnAxis(dayOf(TODAY), TODAY, requestFrom(t)!, 'x', lm('14:00'))
    expect(res.saved).toBe(true)
    expect(planPushed).not.toHaveBeenCalled()
  })

  it('dzień miniony (przed dziś): nic nie rozsuwa (D367)', () => {
    const t = requestFrom(task('t1'))!
    expect(planningOf(dayOf('2026-11-10'), TODAY, t, lm('10:00')).pushed).toEqual([])
  })

  it('prośba na osi to blok próśb (jak w planie porannym)', async () => {
    const q = newRequest('r1', at(TODAY), { person: 'mama', estimateMin: 20, note: 'zakupy' })
    stubWindow([q], { [TODAY]: null })
    const res = await planOnAxis(dayOf(TODAY), TODAY, requestFrom(q)!, 'Mama: zakupy', lm('14:00'))
    expect(res.block).toMatchObject({ categoryId: 'prosby', requests: ['r1'], durationMin: 20 })
  })
})

describe('krok próśb w planie porannym (D384): prośby i zadania z „Dziś”', () => {
  it('zadania z „Dziś” i prośby niezaplanowane (nie „Kiedyś / Może”); zadanie ze Skrzynki nie', () => {
    const list = items([task('today', { list: 'today' }), task('inbox'), task('week', { list: 'week' }), newRequest('r', 1, { person: 'mama', estimateMin: 20, note: '' }), { ...newRequest('r2', 1, { person: null, estimateMin: 15, note: '' }), list: 'someday' }])
    const m = morningCases(list)
    expect(m.tasks.map((x) => x.record.id)).toEqual(['today'])
    expect(m.requests.map((x) => x.record.id)).toEqual(['r'])
    // The place is looked for once for all: the requests as one block (at least 5 min), then each task.
    expect(morningMinutes(m.requests.map((x) => x.record), m.tasks.map((x) => x.record))).toBe(20 + 30)
  })
})

describe('rytuał wieczorny: teksty spraw (D402)', () => {
  it('wróciły / wrócą o 04:00; niedziela – liczba spraw w „Kiedyś / Może”', () => {
    expect(backText(true)).toBe('Niezrobione z „Dziś” wrócą o 04:00 do „W tym tygodniu”:')
    expect(backText(false)).toBe('Niezrobione z „Dziś” wróciły do „W tym tygodniu”:')
    expect(somedayText(1)).toBe('Na liście „Kiedyś / Może”: 1 sprawa – przejrzyj ją raz w tygodniu.')
    expect(somedayText(5)).toContain('5 spraw')
  })
})

describe('skrót szybkiego zapisu w Ustawieniach (D385, D402)', () => {
  it('wpisany skrót walidowany przed zapisem: Ctrl lub Alt i jeden klawisz', () => {
    expect(parseQuickKey('ctrl+alt+k')).toEqual({ ok: true, value: 'Ctrl+Alt+K' })
    // The Windows key (D408): typed as „Win” (or „Windows”), saved as Electron's „Super”, shown as „Win” again.
    expect(parseQuickKey('win+alt+n')).toEqual({ ok: true, value: 'Super+Alt+N' })
    expect(parseQuickKey('Alt+Windows+F5')).toEqual({ ok: true, value: 'Super+Alt+F5' })
    expect(quickKeyShown('Super+Alt+N')).toBe('Win+Alt+N')
    expect(parseQuickKey('Alt+Shift+F5')).toEqual({ ok: true, value: 'Alt+Shift+F5' })
    expect(parseQuickKey('Ctrl+Spacja')).toEqual({ ok: true, value: 'Ctrl+Space' })
    for (const bad of ['', 'N', 'Shift+N', 'Ctrl+Alt', 'Ctrl+Alt+KK', 'Ctrl+Ctrl+K', 'Win+N', 'Win+Shift+N', 'Ctrl+Ą']) expect(parseQuickKey(bad), bad).toMatchObject({ ok: false })
    expect(quickKeyShown('Ctrl+Space')).toBe('Ctrl+Spacja')
  })

  it('uwaga pod polem: działa, wyłączony, „Skrót zajęty przez inny program”', () => {
    expect(quickKeyNote({ key: 'Super+Alt+N', state: 'taken' }, 'Super+Alt+N')).toEqual({ text: expect.stringContaining('Skrót zajęty przez inny program'), warn: true })
    expect(quickKeyNote({ key: 'Super+Alt+N', state: 'on' }, 'Super+Alt+N').warn).toBe(false)
    expect(quickKeyNote({ key: null, state: 'off' }, null).text).toContain('Wyłączony')
    expect(quickKeyNote(null, 'Super+Alt+N').warn).toBe(false)
  })
})

describe('„Powtarzaj” na bloku zadania i próśb (D408)', () => {
  it('blok zadania i blok próśb: krótkie wyjaśnienie; inne bloki – nic', () => {
    expect(repeatNote(planBlock({ id: 'z', categoryId: 'inne', startMin: 600, durationMin: 30, task: 't1' }))).toBe('Blok zadania należy do jednego dnia – zadanie nie powtarza się w serii.')
    expect(repeatNote(planBlock({ id: 'p', categoryId: 'prosby', startMin: 600, durationMin: 30, requests: ['r1'] }))).toBe('Blok próśb należy do jednego dnia – nie powtarza się w serii.')
    expect(repeatNote(planBlock({ id: 'u', categoryId: 'inne', startMin: 600, durationMin: 30 }))).toBeNull()
    expect(repeatNote(planBlock({ id: 's', categoryId: 'trading', startMin: 600, durationMin: 30, origin: 'session' }))).toBeNull()
  })
})

describe('plan poranny: zadania z „Dziś” zaznaczone od razu, prośby nie (D408)', () => {
  const offered = () => morningCases(items([task('t1', { list: 'today' }), task('t2', { list: 'today' }), newRequest('r1', 1, { person: 'mama', estimateMin: 20, note: '' })]))
  it('bez ruchu użytkownika: wszystkie zadania, żadna prośba', () => {
    const c = morningChosen(offered(), [])
    expect([c.requests, [...c.tasks].sort()]).toEqual([[], ['t1', 't2']])
  })
  it('zmiana zaznaczenia odwraca wybór: zadanie odznaczone, prośba zaznaczona', () => {
    expect(morningChosen(offered(), ['t1', 'r1'])).toEqual({ requests: ['r1'], tasks: ['t2'] })
    expect(isMorningChosen('task', 't1', [])).toBe(true)
    expect(isMorningChosen('task', 't1', ['t1'])).toBe(false)
    expect(isMorningChosen('request', 'r1', [])).toBe(false)
    expect(isMorningChosen('request', 'r1', ['r1'])).toBe(true)
  })
})

describe('następne wolne miejsce (jedna reguła: Ctrl+N, „Zaplanuj” panelu i strony)', () => {
  const day = dayOf(TODAY)
  const where = (isToday: boolean, now: string) => ({ isToday, nowMin: lm(now), wakeMin: day.ctx.wakeMin })
  it('dziś – następny kwadrans po teraz (nie przed pobudką), inny dzień – godzina po pobudce', () => {
    expect(startSearchFrom({ isToday: true, nowMin: lm('10:10'), wakeMin: lm('07:00') })).toBe(lm('10:15'))
    expect(startSearchFrom({ isToday: true, nowMin: lm('10:15'), wakeMin: lm('07:00') })).toBe(lm('10:15'))
    expect(startSearchFrom({ isToday: true, nowMin: lm('05:00'), wakeMin: lm('07:00') })).toBe(lm('07:00'))
    expect(startSearchFrom({ isToday: false, nowMin: lm('10:10'), wakeMin: lm('07:00') })).toBe(lm('08:00'))
  })
  it('wolne miejsce omija bloki planu: po zajętym oknie 10:00–12:00; przed nim, gdy mieści się przed pierwszym blokiem', () => {
    expect(nextFreeStart(day.state, where(true, '10:10'), 30)).toBe(lm('12:00'))
    const early = day.ctx.wakeMin + 60
    expect(nextFreeStart(day.state, where(false, '10:10'), 30)).toBe(early + 30 <= lm('10:00') ? early : lm('12:00'))
  })
})

describe('prośba w kroku planu porannego – notatka raz', () => {
  const rd = rdFrom({ people: [{ id: 'p1', name: 'Anna' }] })
  it('osoba i notatka w jednym tekście; zadanie – tytuł', () => {
    const [req] = items([newRequest('r1', 1, { person: 'p1', estimateMin: 15, note: 'oddzwonić' })])
    const text = queueRowText(req!, rd)
    expect(text).toBe('Anna: oddzwonić')
    expect(text.match(/oddzwonić/g)).toHaveLength(1)
    expect(queueRowText(items([task('t', { title: 'Wymienić filtr' })])[0]!, rd)).toBe('Wymienić filtr')
  })
})

describe('pole tytułu zapisuje raz (nowe zadanie)', () => {
  it('drugi Enter w czasie zapisu nic nie robi; pole czyszczone od razu, oddane po nieudanym zapisie', async () => {
    const saved: string[] = []
    const fields: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const run = oneAtATime()
    const o = { set: (t: string) => fields.push(t), save: async (t: string) => (saved.push(t), await gate, true), done: vi.fn() }
    const first = submitTitle(run, 'Napisać raport', o)
    const second = submitTitle(run, 'Napisać raport', o)
    expect(fields).toEqual([''])
    release()
    await Promise.all([first, second])
    expect(saved).toEqual(['Napisać raport'])
    expect(o.done).toHaveBeenCalledTimes(1)
    // A save that did not happen gives the title back (and does not close).
    const back: string[] = []
    const fail = { set: (t: string) => back.push(t), save: async () => false, done: vi.fn() }
    await submitTitle(oneAtATime(), 'x', fail)
    expect(back).toEqual(['', 'x'])
    expect(fail.done).not.toHaveBeenCalled()
    // An empty title saves nothing.
    await submitTitle(oneAtATime(), '  ', fail)
    expect(back).toEqual(['', 'x'])
  })
})

describe('plan poranny – co ekran mówi po „Dodaj do planu” (planMorning)', () => {
  const name = (id: string) => ({ t1: 'Wymienić filtr', r1: 'Anna: oddzwonić' })[id] ?? id
  it('nic nie powstało: zaznaczenie zostaje, komunikat w kroku', () => {
    expect(morningOutcome({ saved: true, made: 0, skipped: ['t1'] }, name)).toEqual({ clear: false, note: 'Nic nie dodano – wybrane sprawy są już zaplanowane albo zrobione.' })
  })
  it('część powstała: zaznaczenie czyszczone, pominięte z nazwami', () => {
    expect(morningOutcome({ saved: true, made: 1, skipped: ['t1', 'r1'] }, name)).toEqual({ clear: true, note: 'Pominięto: Wymienić filtr, Anna: oddzwonić – są już zaplanowane albo zrobione.' })
  })
  it('wszystko powstało: czyszczone, bez komunikatu; zapis, który się nie udał: bez zmian i bez komunikatu', () => {
    expect(morningOutcome({ saved: true, made: 2, skipped: [] }, name)).toEqual({ clear: true, note: null })
    expect(morningOutcome({ saved: false, made: 0, skipped: [] }, name)).toEqual({ clear: false, note: null })
  })
})
