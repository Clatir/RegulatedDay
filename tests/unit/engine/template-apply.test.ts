/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” (D540–D545): the template's blocks copied into a day's plan (gaps only, or
 * over the colliding blocks), the question asked only by a day without the template's blocks, and the template taken out of a day.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, sessionBlockId, templateBlockId } from '@shared/engine/createDay'
import { anchoredClosure, applyTemplate, asksMode, backInFile, foregroundRuns, judgeApply, revokeTemplate, takeGoneBy, templateDoneUndo, versionForDay, type ApplyDay, type ApplyTiming, type DayRun } from '@shared/engine/templateApply'
import type { AnyEvent } from '@shared/model/events'
import { ALL_DAYS_YES, dayFileFrom, planBlock, type PlanBlock, type Template } from '@shared/model/plan'
import type { SettingsChange } from '@shared/model/settings'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)

const ordinary: Template = {
  id: 'zwykly',
  name: 'Zwykły',
  dayType: 'zwykly',
  weekdays: [],
  archived: false,
  versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [planBlock({ id: 'rutyna', categoryId: 'rutyny', startMin: 6 * 60 + 15, durationMin: 30, origin: 'template' })] }]
}

/** The template applied: Wednesday's own (weekdays [3]), applied to other days. */
const training: Template = {
  id: 'trening',
  name: 'Trening',
  dayType: 'zwykly',
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

const THU = '2026-11-19'
const WED = '2026-11-18'

function dayOf(date: string, raw: Record<string, unknown> | null = null, begun: string[] = [], templates: Template[] = [ordinary, training]): ApplyDay {
  const dayFile = raw ? dayFileFrom(raw, date) : null
  const snapshot = createDay({ date, changes: [] as SettingsChange[], templates, lectures: [], series: [], dayFile, holidays, at: null })
  return { date, plan: dayPlan(snapshot, dayFile), snapshot, raw, begun: new Set(begun) }
}

/** The plan of the day after a change of its file. */
const planAfter = (day: ApplyDay, raw: Record<string, unknown>) => dayPlan(day.snapshot, dayFileFrom(raw, day.date))
const id = (date: string, b: string) => templateBlockId(date, 'trening', b)

describe('Zastosuj ten szablon do… – kolizje i pytanie', () => {
  it('blok szablonu nachodzący na blok dnia to kolizja – dzień bez bloków szablonu pyta', () => {
    const day = dayOf(THU)
    const j = judgeApply(training, day)
    expect(j.ofTemplate).toBe(false)
    expect(j.missing.find((m) => m.block.sourceId === 'rano')!.clash.map((b) => b.sourceId)).toEqual(['rutyna'])
    expect(j.missing.find((m) => m.block.sourceId === 'wieczor')!.clash).toEqual([])
    expect(asksMode(j)).toBe(true)
  })

  it('„Uzupełnij luki”: tylko bloki, które się mieszczą; zakotwiczony do pominiętego też zostaje poza planem', () => {
    const day = dayOf(THU)
    const r = applyTemplate(training, day, 'fill')
    const plan = planAfter(day, r.raw)
    expect(plan.map((b) => b.id)).toContain(id(THU, 'wieczor'))
    expect(plan.map((b) => b.id)).not.toContain(id(THU, 'rano'))
    expect(plan.map((b) => b.id)).not.toContain(id(THU, 'po'))
    expect(plan.some((b) => b.sourceId === 'rutyna')).toBe(true)
    expect(r).toMatchObject({ added: 1, cancelled: 0, skipped: 2 })
  })

  it('„Nadpisz plan”: kolidujący blok dnia odwołany, cały szablon w planie, w godzinach szablonu', () => {
    const day = dayOf(THU)
    const r = applyTemplate(training, day, 'overwrite')
    const plan = planAfter(day, r.raw)
    expect(plan.some((b) => b.sourceId === 'rutyna')).toBe(false)
    const rano = plan.find((b) => b.id === id(THU, 'rano'))!
    expect(rano).toMatchObject({ origin: 'template', sourceId: 'rano', startMin: 6 * 60 })
    expect(plan.find((b) => b.id === id(THU, 'po'))!.anchor).toBe(id(THU, 'rano'))
    expect(r).toMatchObject({ added: 3, cancelled: 1, skipped: 0 })
    // Typ dnia, pobudka i budżet bez zmian.
    expect(r.raw.dayType).toBeUndefined()
    expect(r.raw.wakeMin).toBeUndefined()
  })

  it('„Nadpisz” nie odwołuje zaczętego bloku – kolidujący blok szablonu zostaje poza planem', () => {
    const day = dayOf(THU, null, [templateBlockId(THU, 'zwykly', 'rutyna')])
    const r = applyTemplate(training, day, 'overwrite')
    const plan = planAfter(day, r.raw)
    expect(plan.some((b) => b.sourceId === 'rutyna')).toBe(true)
    expect(plan.map((b) => b.id)).not.toContain(id(THU, 'rano'))
    expect(r).toMatchObject({ cancelled: 0, skipped: 2 })
  })

  it('dzień z blokami tego szablonu nie pyta – „Nadpisz” działa wtedy jak „Uzupełnij luki”', () => {
    const first = dayOf(THU)
    const once = applyTemplate(training, first, 'fill')
    const day = dayOf(THU, once.raw)
    const j = judgeApply(training, day)
    expect(j.ofTemplate).toBe(true)
    expect(asksMode(j)).toBe(false)
    const r = applyTemplate(training, day, 'overwrite')
    expect(r).toMatchObject({ added: 0, cancelled: 0 })
    expect(planAfter(day, r.raw).some((b) => b.sourceId === 'rutyna')).toBe(true)
  })

  it('drugie zastosowanie niczego nie dubluje (te same id)', () => {
    const once = applyTemplate(training, dayOf(THU), 'overwrite')
    const day = dayOf(THU, once.raw)
    expect(judgeApply(training, day).missing).toEqual([])
    expect(applyTemplate(training, day, 'fill').added).toBe(0)
  })

  it('dzień bez kolizji nie pyta i dostaje cały szablon', () => {
    const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
    const day = dayOf(THU, null, [], [empty, training])
    const j = judgeApply(training, day)
    expect(asksMode(j)).toBe(false)
    expect(applyTemplate(training, day, 'fill').added).toBe(3)
  })

  it('własny dzień szablonu: odwołany blok wraca (bez kopii w pliku)', () => {
    const raw = { schema: 1, date: WED, cancelled: { [id(WED, 'wieczor')]: true } }
    const day = dayOf(WED, raw)
    const j = judgeApply(training, day)
    expect(j.ofTemplate).toBe(true)
    expect(j.missing.map((m) => m.block.sourceId)).toEqual(['wieczor'])
    const r = applyTemplate(training, day, 'fill')
    expect(r.raw.cancelled).toEqual({})
    expect(r.raw.blocks).toBeUndefined()
    expect(planAfter(day, r.raw).map((b) => b.id)).toContain(id(WED, 'wieczor'))
  })

  it('blok przeniesiony na inny dzień nie wraca', () => {
    const raw = { schema: 1, date: WED, movedTo: { [id(WED, 'wieczor')]: '2026-11-20' } }
    expect(judgeApply(training, dayOf(WED, raw)).missing).toEqual([])
  })

  it('„Nadpisz” nie odwołuje sesji dnia – blok szablonu na niej zostaje poza planem', () => {
    const day = dayOf(THU)
    const session = day.plan.find((b) => b.origin === 'session')!
    expect(session).toBeTruthy()
    const onSession: Template = { ...training, versions: [{ ...training.versions[0]!, blocks: [planBlock({ id: 'x', categoryId: 'nauka', startMin: session.startMin! + 10, durationMin: 20, origin: 'template' })] }] }
    const r = applyTemplate(onSession, day, 'overwrite')
    expect(r).toMatchObject({ added: 0, cancelled: 0, skipped: 1 })
    expect(planAfter(day, r.raw).map((b) => b.id)).toContain(session.id)
  })

  it('dzień przed pierwszą wersją bierze pierwszą', () => {
    expect(versionForDay(training, '2025-06-01')).toBe(training.versions[0])
  })
})

describe('Odwołaj ten szablon w…', () => {
  it('kopia wychodzi z pliku, blok własnego dnia szablonu – odwołany; inne bloki zostają', () => {
    const copied = applyTemplate(training, dayOf(THU), 'overwrite')
    const day = dayOf(THU, copied.raw)
    const r = revokeTemplate(training, day)
    const plan = planAfter(day, r.raw)
    expect(plan.some((b) => b.origin === 'template' && b.id.includes('trening'))).toBe(false)
    expect(plan.filter((b) => [id(THU, 'rano'), id(THU, 'po'), id(THU, 'wieczor')].includes(b.id))).toEqual([])
    expect(r.removed).toBe(3)

    const wed = dayOf(WED)
    const w = revokeTemplate(training, wed)
    expect(Object.keys(w.raw.cancelled as object).sort()).toEqual([id(WED, 'po'), id(WED, 'rano'), id(WED, 'wieczor')].sort())
    expect(planAfter(wed, w.raw).filter((b) => b.origin === 'template')).toEqual([])
  })

  it('zaczęty blok szablonu zostaje', () => {
    const wed = dayOf(WED, null, [id(WED, 'rano')])
    const r = revokeTemplate(training, wed)
    expect(r).toMatchObject({ removed: 2, begun: 1 })
    // „po” jest zakotwiczony do „rano” – „rano” zostaje, „po” i „wieczor” odwołane.
    expect(planAfter(wed, r.raw).map((b) => b.id)).toContain(id(WED, 'rano'))
  })

  it('dzień bez bloków szablonu – nic', () => {
    const r = revokeTemplate(training, dayOf(THU))
    expect(r).toMatchObject({ removed: 0, begun: 0 })
  })
})

describe('poprawki po przeglądzie (T1906, T1907)', () => {
  /** Thursday with its own block C 06:40–07:00 and D anchored to C – the template's „rano” 06:00–07:00 overlaps C only. */
  const withChain = (begunD: boolean) => {
    const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
    const raw = { schema: 1, date: THU, blocks: [
      { id: 'c', categoryId: 'inne', startMin: 6 * 60 + 40, durationMin: 20, fixed: false },
      { id: 'd', categoryId: 'inne', anchor: 'c', durationMin: 20, fixed: false }
    ] }
    return dayOf(THU, raw, begunD ? ['d'] : [], [empty, training])
  }

  it('„Nadpisz” nie odwołuje bloku, do którego zakotwiczony jest zaczęty', () => {
    const r = applyTemplate(training, withChain(true), 'overwrite')
    expect(r.cancelled).toBe(0)
    expect(planAfter(withChain(true), r.raw).map((b) => b.id)).toEqual(expect.arrayContaining(['c', 'd']))
  })

  it('„Nadpisz” liczy zakotwiczone, które wychodzą z odwołanym', () => {
    const day = withChain(false)
    const r = applyTemplate(training, day, 'overwrite')
    expect(r.cancelled).toBe(2)
    expect(planAfter(day, r.raw).map((b) => b.id)).not.toContain('d')
  })

  it('blok szablonu zdjęty kaskadą kotwic niczego nie odwołuje', () => {
    // „rano” na zaczętym A – nie wchodzi; „po” (07:00–07:30) na Twoim B – odwołałby B, ale bez „rano” nie wchodzi.
    const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
    const raw = { schema: 1, date: THU, blocks: [
      { id: 'a', categoryId: 'inne', startMin: 6 * 60, durationMin: 30, fixed: false },
      { id: 'b', categoryId: 'inne', startMin: 7 * 60 + 5, durationMin: 10, fixed: false }
    ] }
    const day = dayOf(THU, raw, ['a'], [empty, training])
    const r = applyTemplate(training, day, 'overwrite')
    expect(r).toMatchObject({ added: 1, cancelled: 0 })
    expect(planAfter(day, r.raw).map((b) => b.id)).toContain('b')
  })

  it('blok zdjęty z planu przez log (odwołany, zaparkowany) nie koliduje', () => {
    const day = { ...dayOf(THU), off: new Set([templateBlockId(THU, 'zwykly', 'rutyna')]) }
    const j = judgeApply(training, day)
    expect(asksMode(j)).toBe(false)
    expect(applyTemplate(training, day, 'fill').added).toBe(3)
  })

  it('zaczęty i potem usunięty blok szablonu nie wraca (D336)', () => {
    const raw = { schema: 1, date: WED, cancelled: { [id(WED, 'wieczor')]: true } }
    const day = dayOf(WED, raw, [id(WED, 'wieczor')])
    expect(judgeApply(training, day).missing).toEqual([])
  })

  it('„Nadpisz” odwołuje Twój blok, ale zostawia go w pliku (z załącznikami); „Zastosuj” po „Odwołaj” przywraca kopię', () => {
    const day = dayOf(THU, { schema: 1, date: THU, blocks: [{ id: 'moj', categoryId: 'inne', startMin: 6 * 60 + 30, durationMin: 20, fixed: false }] })
    const r = applyTemplate(training, day, 'overwrite')
    expect((r.raw.blocks as Array<{ id: string }>).map((b) => b.id)).toContain('moj')
    expect(r.raw.cancelled).toMatchObject({ moj: true })
    const revoked = revokeTemplate(training, dayOf(THU, r.raw))
    const back = applyTemplate(training, dayOf(THU, revoked.raw), 'fill')
    expect(planAfter(dayOf(THU, back.raw), back.raw).map((b) => b.id)).toContain(id(THU, 'wieczor'))
  })

  it('„Odwołaj” nie odwołuje sesji spoza pliku i migawki (przywróconej odpowiedzią „tak”)', () => {
    const withNy: Template = {
      ...training,
      versions: [{ ...training.versions[0]!, blocks: [...training.versions[0]!.blocks, planBlock({ id: 'ny', categoryId: 'sesja', startMin: 15 * 60 + 30, durationMin: 390, fixed: true, origin: 'template', session: { zone: 'America/New_York', markets: ['NYSE'], days: [...ALL_DAYS_YES] } })] }]
    }
    const day = dayOf(THU)
    const tak = planBlock({ id: sessionBlockId(THU, 'ny'), categoryId: 'sesja', startMin: 15 * 60 + 30, durationMin: 390, fixed: true, origin: 'session', sourceId: 'ny' })
    const r = revokeTemplate(withNy, { ...day, plan: [...day.plan.filter((b) => b.id !== tak.id), tak], snapshot: { ...day.snapshot, blocks: day.snapshot.blocks.filter((b) => b.id !== tak.id) } })
    expect(r.raw.sessions).toBeUndefined()
  })
})

describe('poprawki po drugim przeglądzie', () => {
  it('„Odwołaj” nie odwołuje bloku, do którego zakotwiczony jest zaczęty (zaczęty nie wypada z planu)', () => {
    const wed = dayOf(WED, null, [id(WED, 'po')])
    const r = revokeTemplate(training, wed)
    expect(r).toMatchObject({ removed: 1, begun: 2 })
    expect(planAfter(wed, r.raw).map((b) => b.id)).toEqual(expect.arrayContaining([id(WED, 'rano'), id(WED, 'po')]))
  })

  it('blok zakotwiczony do zaczętego i usuniętego nie jest liczony jako dodany', () => {
    const raw = { schema: 1, date: WED, cancelled: { [id(WED, 'rano')]: true, [id(WED, 'po')]: true } }
    const day = dayOf(WED, raw, [id(WED, 'rano')])
    const r = applyTemplate(training, day, 'fill')
    expect(r.added).toBe(0)
    expect(planAfter(day, r.raw).map((b) => b.id)).not.toContain(id(WED, 'po'))
  })

  it('kopia do dnia bez odwołań nie pisze pustej mapy „cancelled”', () => {
    const r = applyTemplate(training, dayOf(THU), 'fill')
    expect(r.raw.cancelled).toBeUndefined()
  })
})

describe('D546–D549 – dziś i dni minione', () => {
  const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
  /** Thursday without the ordinary template's routine: nothing of the day collides with „Trening” but what a test puts there. */
  const clean = (date: string, raw: Record<string, unknown> | null = null, runs: DayRun[] = []): ApplyDay => ({ ...dayOf(date, raw, [], [empty, training]), runs })
  const at = (h: number, m = 0) => h * 60 + m
  const timing = (o: Partial<ApplyTiming> & { nowMin: number }): ApplyTiming => ({ hours: 'plan', past: 'done', today: THU, ...o })
  const run = (t: Template, day: ApplyDay, tm: ApplyTiming | null, mode: 'fill' | 'overwrite' = 'fill') => {
    const j = judgeApply(t, day, tm)
    return { j, r: applyTemplate(t, day, mode, j) }
  }
  const startOf = (day: ApplyDay, raw: Record<string, unknown>, blockId: string) => planAfter(day, raw).find((b) => b.id === blockId)?.startMin
  const own = (id: string, startMin: number, durationMin: number, o: Partial<PlanBlock> = {}) => planBlock({ id, categoryId: 'inne', startMin, durationMin, origin: 'template', ...o })
  const tpl = (blocks: PlanBlock[]): Template => ({ ...training, versions: [{ ...training.versions[0]!, blocks }] })
  const tid = (b: string) => templateBlockId(THU, 'trening', b)

  it('dziś wg planu, „Dodaj jako zrealizowane”: minione w godzinach szablonu i do faktów, dalsze – niezaczęte', () => {
    const day = clean(THU)
    const { r } = run(training, day, timing({ nowMin: at(10) }))
    expect(r).toMatchObject({ added: 3, skipped: 0, left: { past: 0, ran: 0, outOfDay: 0 } })
    expect([...r.done].sort()).toEqual([id(THU, 'po'), id(THU, 'rano')].sort())
    expect(startOf(day, r.raw, id(THU, 'rano'))).toBe(6 * 60)
    expect(startOf(day, r.raw, id(THU, 'wieczor'))).toBe(21 * 60)
  })

  it('dziś wg planu, „Nie dodawaj minionych”: minione poza planem, policzone', () => {
    const day = clean(THU)
    const { r } = run(training, day, timing({ nowMin: at(10), past: 'skip' }))
    expect(r).toMatchObject({ added: 1, done: [], left: { past: 2, ran: 0, outOfDay: 0 } })
    const ids = planAfter(day, r.raw).map((b) => b.id)
    expect(ids).toContain(id(THU, 'wieczor'))
    expect(ids).not.toContain(id(THU, 'rano'))
    expect(ids).not.toContain(id(THU, 'po'))
  })

  it('blok, który wg planu właśnie trwa, nie jest miniony – dochodzi niezaczęty', () => {
    expect(run(training, clean(THU), timing({ nowMin: at(6, 30) })).r).toMatchObject({ added: 3, done: [] })
    // 07:05: „rano” (06:00–07:00) minął, „po” (07:00–07:15, za kotwicą) trwa.
    const { r } = run(training, clean(THU), timing({ nowMin: at(7, 5) }))
    expect(r).toMatchObject({ added: 3, done: [id(THU, 'rano')] })
  })

  it('miniony nachodzący na rzeczywisty bieg innego bloku – pominięty (fakty mają pierwszeństwo), zakotwiczony do niego też', () => {
    const day = clean(THU, null, [{ block: 'moj', start: at(6, 30), end: at(6, 50) }])
    const { r } = run(training, day, timing({ nowMin: at(10) }))
    expect(r).toMatchObject({ added: 1, done: [], left: { past: 0, ran: 2, outOfDay: 0 } })
    expect(planAfter(day, r.raw).map((b) => b.id)).not.toContain(id(THU, 'rano'))
  })

  it('bieg bloku w tle nie liczy się jako „coś trwało”; trwający bieg sięga do teraz', () => {
    const facts = {
      blocks: new Map([
        ['tlo', { runs: [{ from: 150, to: 170, bg: true }] }],
        ['pierwszy', { runs: [{ from: 150, to: 170, bg: false }, { from: 300, to: Number.POSITIVE_INFINITY, bg: false }] }]
      ])
    } as unknown as Parameters<typeof foregroundRuns>[0]
    expect(foregroundRuns(facts, THU)).toEqual([
      { block: 'pierwszy', start: at(6, 30), end: at(6, 50) },
      { block: 'pierwszy', start: at(9), end: Number.POSITIVE_INFINITY }
    ])
  })

  it('dwa minione bloki szablonu na siebie – zrealizowany tylko pierwszy', () => {
    const t = tpl([own('x', at(6), 60), own('y', at(6, 30), 60)])
    const { r } = run(t, clean(THU), timing({ nowMin: at(10) }))
    expect(r).toMatchObject({ done: [tid('x')], left: { ran: 1 } })
  })

  it('od teraz: offset dodatni – pierwszy elastyczny zaczyna się teraz, odstępy i kolejność zostają, zakotwiczony za kotwicą', () => {
    const day = clean(THU)
    const { r } = run(training, day, timing({ nowMin: at(11), hours: 'now' }))
    expect(r).toMatchObject({ added: 3, done: [], left: { past: 0, ran: 0, outOfDay: 0 } })
    expect(startOf(day, r.raw, id(THU, 'rano'))).toBe(at(11))
    expect(startOf(day, r.raw, id(THU, 'wieczor'))).toBe(at(26))
    const po = planAfter(day, r.raw).find((b) => b.id === id(THU, 'po'))!
    expect([po.startMin, po.anchor]).toEqual([null, id(THU, 'rano')])
  })

  it('od teraz: offset ujemny; blok stały zostaje na swojej godzinie', () => {
    const t = tpl([own('a', at(18), 30), own('f', at(19), 30, { fixed: true }), own('b', at(20), 30)])
    const day = clean(THU)
    const { r } = run(t, day, timing({ nowMin: at(11), hours: 'now' }))
    expect([startOf(day, r.raw, tid('a')), startOf(day, r.raw, tid('b')), startOf(day, r.raw, tid('f'))]).toEqual([at(11), at(13), at(19)])
  })

  it('od teraz: stały blok, który już minął, podlega wyborowi „Minione bloki”', () => {
    const t = tpl([own('f', at(6), 30, { fixed: true }), own('a', at(8), 30)])
    const skip = run(t, clean(THU), timing({ nowMin: at(11), hours: 'now', past: 'skip' })).r
    expect(skip).toMatchObject({ added: 1, done: [], left: { past: 1 } })
    const done = run(t, clean(THU), timing({ nowMin: at(11), hours: 'now' })).r
    expect(done).toMatchObject({ added: 2, done: [tid('f')] })
  })

  it('od teraz: blok, który wychodzi poza dobę planu, jest pominięty – zakotwiczony do niego też', () => {
    const t = tpl([
      own('a', at(6), 30),
      own('w', at(22), 60),
      own('z', at(22, 30), 60),
      planBlock({ id: 'za', categoryId: 'inne', anchor: 'z', durationMin: 30, origin: 'template' }),
      own('n', at(23, 30), 15)
    ])
    const day = clean(THU)
    const { r } = run(t, day, timing({ nowMin: at(11), hours: 'now' }))
    // +5 h: „w” 03:00–04:00 mieści się do końca doby; „z” 03:30–04:30 wychodzi za nią (z „za”); „n” zaczynałby się 04:30 następnej nocy.
    expect(r).toMatchObject({ added: 2, left: { past: 0, ran: 0, outOfDay: 3 } })
    expect(startOf(day, r.raw, tid('a'))).toBe(at(11))
    expect(startOf(day, r.raw, tid('w'))).toBe(at(27))
  })

  it('od teraz: sesja szablonu zostaje na swojej godzinie', () => {
    const withNy = tpl([
      ...training.versions[0]!.blocks,
      planBlock({ id: 'ny2', categoryId: 'sesja', startMin: 15 * 60 + 30, durationMin: 390, fixed: false, origin: 'template', session: { zone: 'America/New_York', markets: ['NYSE'], days: [...ALL_DAYS_YES] } })
    ])
    const startIn = (tm: ApplyTiming | null, b = sessionBlockId(THU, 'ny2')) => judgeApply(withNy, clean(THU), tm).missing.find((m) => m.block.id === b)?.block.startMin
    expect(startIn(null)).toBeTypeOf('number')
    expect(startIn(timing({ nowMin: at(11), hours: 'now' }))).toBe(startIn(null))
    // The template's flexible block moves in the same apply.
    expect(startIn(timing({ nowMin: at(11), hours: 'now' }), id(THU, 'rano'))).toBe(at(11))
  })

  it('kolizja (D541) liczona na godzinach po wyborze', () => {
    const raw = { schema: 1, date: THU, blocks: [{ id: 'moj', categoryId: 'inne', startMin: at(11, 15), durationMin: 30, fixed: false }] }
    expect(asksMode(judgeApply(training, clean(THU, raw), timing({ nowMin: at(11) })))).toBe(false)
    expect(asksMode(judgeApply(training, clean(THU, raw), timing({ nowMin: at(11), hours: 'now' })))).toBe(true)
  })

  it('dzień miniony: „Nie dodawaj minionych” – nic; „Dodaj jako zrealizowane” – wszystkie bloki jako zrealizowane (D549)', () => {
    const later = '2026-11-20'
    const skip = run(training, clean(THU), timing({ today: later, nowMin: at(10), past: 'skip' })).r
    expect(skip).toMatchObject({ added: 0, done: [], left: { past: 3 } })
    const done = run(training, clean(THU), timing({ today: later, nowMin: at(5) })).r
    expect(done).toMatchObject({ added: 3, left: { past: 0, ran: 0, outOfDay: 0 } })
    expect([...done.done].sort()).toEqual([id(THU, 'po'), id(THU, 'rano'), id(THU, 'wieczor')].sort())
  })

  it('dzień przyszły – godziny szablonu i nic minionego, niezależnie od wyboru', () => {
    const day = clean(THU)
    const { r } = run(training, day, timing({ today: '2026-11-18', nowMin: at(23), hours: 'now', past: 'skip' }))
    expect(r).toMatchObject({ added: 3, done: [], left: { past: 0, ran: 0, outOfDay: 0 } })
    expect(startOf(day, r.raw, id(THU, 'rano'))).toBe(6 * 60)
  })
})

describe('runda 1 przeglądu (T1922–T1929)', () => {
  const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
  const at = (h: number, m = 0) => h * 60 + m
  const timing = (o: Partial<ApplyTiming> & { nowMin: number }): ApplyTiming => ({ hours: 'plan', past: 'done', today: THU, ...o })

  it('anchoredClosure: ziarna i wszystko zakotwiczone do nich, także przez inne (ziarno spoza listy też)', () => {
    const blocks = [planBlock({ id: 'a', categoryId: 'inne', startMin: 360, durationMin: 10 }), planBlock({ id: 'b', categoryId: 'inne', anchor: 'a', durationMin: 10 }), planBlock({ id: 'c', categoryId: 'inne', anchor: 'b', durationMin: 10 }), planBlock({ id: 'd', categoryId: 'inne', anchor: 'x', durationMin: 10 })]
    expect([...anchoredClosure(blocks, ['b'])].sort()).toEqual(['b', 'c'])
    expect([...anchoredClosure(blocks, ['x'])].sort()).toEqual(['d', 'x'])
    expect([...anchoredClosure(blocks, [])]).toEqual([])
  })

  it('takeGoneBy: kolejność godzin, bieg na pierwszym planie i blok wzięty wcześniej zatrzymują, tło – nie; zakotwiczony do pominiętego – pominięty', () => {
    const g = (id: string, start: number, end: number, o: Partial<{ bg: boolean; anchor: string }> = {}) => ({ id, start, end, bg: o.bg ?? false, anchor: o.anchor ?? null })
    const r = takeGoneBy([g('late', 500, 520), g('early', 360, 420), g('over', 400, 430), g('tlo', 400, 430, { bg: true }), g('za', 430, 440, { anchor: 'over' }), g('run', 600, 610)], [{ block: 'x', start: 605, end: 606 }])
    expect(r.taken).toEqual(['early', 'tlo', 'late'])
    expect(r.ran.sort()).toEqual(['over', 'run', 'za'])
  })

  it('miniony koliduje z planowanymi godzinami bloków niezaczętych, nie z planowanymi godzinami bloku, który już się odbył (D547)', () => {
    const raw = { schema: 1, date: THU, blocks: [{ id: 'moj', categoryId: 'inne', startMin: at(6), durationMin: 60, fixed: false }] }
    // „moj” zaplanowany 06:00–07:00, odbył się 11:30–12:00: jego planowane godziny nie kolidują, bieg też nie.
    const begun: ApplyDay = { ...dayOf(THU, raw, ['moj'], [empty, training]), runs: [{ block: 'moj', start: at(11, 30), end: at(12) }] }
    const j = judgeApply(training, begun, timing({ nowMin: at(13) }))
    expect(asksMode(j)).toBe(false)
    expect(applyTemplate(training, begun, 'fill', j).done).toContain(id(THU, 'rano'))
    // Niezaczęty w tych godzinach – kolizja jak dotąd.
    const notBegun: ApplyDay = { ...dayOf(THU, raw, [], [empty, training]), runs: [] }
    expect(asksMode(judgeApply(training, notBegun, timing({ nowMin: at(13) })))).toBe(true)
  })

  it('blok migawki wraca w godzinach dnia (przesunięcie pobudki) – te same godziny ocenia proces główny', () => {
    const wed = dayOf(WED)
    const wake = wed.snapshot.templateWakeMin + 60
    // Własny dzień szablonu z pobudką o godzinę później i odwołanym „rano”: dzień pokazałby go 07:00–08:00, nie 06:00–07:00.
    const raw = { schema: 1, date: WED, wakeMin: wake, cancelled: { [id(WED, 'rano')]: true } }
    const day: ApplyDay = { ...dayOf(WED, raw), runs: [{ block: 'x', start: at(6, 30), end: at(6, 50) }] }
    const tm = timing({ today: WED, nowMin: at(10) })
    const j = judgeApply(training, day, tm)
    expect(j.missing.find((m) => m.block.id === id(WED, 'rano'))!.block.startMin).toBe(at(7))
    const r = applyTemplate(training, day, 'fill', j)
    expect(r.done).toContain(id(WED, 'rano'))
    // Wraca odwołaniem odwołania – bez wpisu w pliku, więc pobudka dalej go przesuwa.
    expect(r.raw.blocks).toBeUndefined()
    expect(planAfter(day, r.raw).find((b) => b.id === id(WED, 'rano'))!.startMin).toBe(at(7))
  })

  it('blok migawki trafia do pliku tylko, gdy „od teraz” zmieniło mu godzinę – nowsza wersja szablonu nie nadpisuje dnia', () => {
    const v1 = training.versions[0]!
    const v2 = { ...v1, from: '2026-11-01', blocks: v1.blocks.map((b) => (b.id === 'rano' ? { ...b, startMin: at(6, 30) } : b)) }
    const later: Template = { ...training, versions: [v1, v2] }
    // Dzień zrobiony z pierwszej wersji (06:00), szablon ma już drugą (06:30).
    const raw = { schema: 1, date: WED, cancelled: { [id(WED, 'rano')]: true } }
    const day = dayOf(WED, raw, [], [ordinary, { ...training, versions: [v1] }])
    const r = applyTemplate(later, day, 'fill', judgeApply(later, day, null))
    expect(r.raw.blocks).toBeUndefined()
    expect(planAfter(day, r.raw).find((b) => b.id === id(WED, 'rano'))!.startMin).toBe(at(6))
    const now = applyTemplate(later, day, 'fill', judgeApply(later, day, timing({ today: WED, nowMin: at(11), hours: 'now' })))
    expect((now.raw.blocks as Array<{ id: string; startMin: number }>).find((b) => b.id === id(WED, 'rano'))!.startMin).toBe(at(11))
  })
})

describe('runda 2 przeglądu (T1950–T1955)', () => {
  const empty: Template = { ...ordinary, versions: [{ ...ordinary.versions[0]!, blocks: [] }] }
  const at = (h: number, m = 0) => h * 60 + m
  const tid = (b: string) => templateBlockId(THU, 'trening', b)

  it('dwa minione na siebie: pierwszy, który nie wchodzi do planu (kolizja, „Uzupełnij luki”), nie zatrzymuje drugiego', async () => {
    const t: Template = { ...training, versions: [{ ...training.versions[0]!, blocks: [planBlock({ id: 'x', categoryId: 'inne', startMin: at(6), durationMin: 60, origin: 'template' }), planBlock({ id: 'y', categoryId: 'inne', startMin: at(6, 30), durationMin: 60, origin: 'template' })] }] }
    // „moj” 06:00–06:30 (not begun) collides with „x” only.
    const raw = { schema: 1, date: THU, blocks: [{ id: 'moj', categoryId: 'inne', startMin: at(6), durationMin: 30, fixed: false }] }
    const day: ApplyDay = { ...dayOf(THU, raw, [], [empty, t]), runs: [] }
    const j = judgeApply(t, day, { hours: 'plan', past: 'done', today: THU, nowMin: at(10) })
    const r = applyTemplate(t, day, 'fill', j)
    expect(r.done).toEqual([tid('y')])
    expect(r).toMatchObject({ added: 1, skipped: 1, left: { ran: 0 } })
  })

  it('blok miniony, który „Nadpisz plan” i tak zostawiłby poza planem (na innym minionym), nie wywołuje pytania kolizji', () => {
    const t: Template = { ...training, versions: [{ ...training.versions[0]!, blocks: [planBlock({ id: 'x', categoryId: 'inne', startMin: at(6), durationMin: 60, origin: 'template' }), planBlock({ id: 'y', categoryId: 'inne', startMin: at(6, 30), durationMin: 60, origin: 'template' })] }] }
    // „moj” 07:00–07:30 (not begun) collides with „y” only; „y” lies on „x”, which goes in either way.
    const raw = { schema: 1, date: THU, blocks: [{ id: 'moj', categoryId: 'inne', startMin: at(7), durationMin: 30, fixed: false }] }
    const day: ApplyDay = { ...dayOf(THU, raw, [], [empty, t]), runs: [] }
    const j = judgeApply(t, day, { hours: 'plan', past: 'done', today: THU, nowMin: at(10) })
    expect(asksMode(j)).toBe(false)
    expect(applyTemplate(t, day, 'overwrite', j)).toMatchObject({ done: [tid('x')], cancelled: 0 })
  })

  it('backInFile: odwołanie z listy (starszy zapis) i „nie” sesji wracają tylko, gdy plik je ma', () => {
    const raw = { schema: 1, date: THU, cancelled: ['a', 'b'], sessions: { ny: 'no' } }
    const out = backInFile(raw, { id: 'a', origin: 'template', sourceId: 'a' })
    expect(out.cancelled).toEqual({ b: true })
    expect(backInFile(raw, { id: sessionBlockId(THU, 'ny'), origin: 'session', sourceId: 'ny' }).sessions).toEqual({})
    // Nothing to take back: the file as it was (no empty map written).
    const clean = { schema: 1, date: THU }
    expect(backInFile(clean, { id: 'z', origin: 'template', sourceId: 'z' })).toBe(clean)
  })

  it('„Cofnij” faktów: zdarzenie bloku sprzed naszego startu (w kolejności logu) nie zatrzymuje bloku', () => {
    const base = { c: 'pca', t: 0, v: 16, day: THU, dom: 'timer' as const }
    const ev = (n: number, x: Record<string, unknown>) => ({ ...base, id: `pca-${n}`, n, l: n, ...x }) as unknown as AnyEvent
    const events = [
      ev(1, { k: 'block.cost', block: 'a', at: 1, costs: null }),
      ev(5, { k: 'block.start', block: 'a', at: 2, bg: false, planned: {}, confirmUntil: null, how: 'plan' }),
      ev(6, { k: 'block.end', block: 'a', at: 3, done: true, rule: null })
    ]
    const u = templateDoneUndo({ undone: new Set() }, events, ['pca-5', 'pca-6'], 'pca', 10)
    expect(typeof u !== 'string' && [u.undone, u.kept]).toEqual([['a'], []])
    // The same event after the start: the block stays as it is.
    const later = [...events.slice(1), ev(7, { k: 'block.cost', block: 'a', at: 4, costs: null })]
    const k = templateDoneUndo({ undone: new Set() }, later, ['pca-5', 'pca-6'], 'pca', 10)
    expect(typeof k !== 'string' && [k.undone, k.kept]).toEqual([[], ['a']])
  })
})
