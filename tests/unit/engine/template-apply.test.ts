/**
 * „Zastosuj ten szablon do…” and „Odwołaj ten szablon w…” (D540–D545): the template's blocks copied into a day's plan (gaps only, or
 * over the colliding blocks), the question asked only by a day without the template's blocks, and the template taken out of a day.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, sessionBlockId, templateBlockId } from '@shared/engine/createDay'
import { applyTemplate, asksMode, judgeApply, revokeTemplate, versionForDay, type ApplyDay } from '@shared/engine/templateApply'
import { ALL_DAYS_YES, dayFileFrom, planBlock, type Template } from '@shared/model/plan'
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
