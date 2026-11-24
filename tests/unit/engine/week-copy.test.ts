/**
 * „Skopiuj tydzień do…” (N16, D630–D634): the blocks of a week (or the ones selected) copied to the same weekday of other weeks – the day
 * D goes to D + 7k; own and template blocks still in the plan come, the day's layers (sessions, lectures, classes), series and buffers do
 * not; a copy is yours, with an id of its target, source and block (the same copy twice is one), without its sprawa and requests; a block
 * the target has already (the same block at the same hours) is no collision; collisions as „Zastosuj do…” (D541): the question only where
 * a copy collides, „Uzupełnij luki” / „Nadpisz plan”, begun blocks and the day's layers never cancelled; today – the blocks gone by stay out.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { asksMode, type ApplyDay, type ApplyTiming } from '@shared/engine/templateApply'
import { applyCopy, copiesFor, copyTargets, judgeCopy, weekCopyId, type CopySource } from '@shared/engine/weekCopy'
import { dayFileFrom, planBlock, type PlanBlock, type Template } from '@shared/model/plan'
import type { SettingsChange } from '@shared/model/settings'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)

/** Every ordinary day: its routine 06:15–06:45 (sessions of the layer: 08:00–11:00 and 14:00–17:00 on Monday to Friday). */
const ordinary: Template = {
  id: 'zwykly',
  name: 'Zwykły',
  dayType: 'zwykly',
  weekdays: [],
  archived: false,
  versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [planBlock({ id: 'rutyna', categoryId: 'rutyny', startMin: 6 * 60 + 15, durationMin: 30, origin: 'template' })] }]
}

// The source week: Monday 30.11.2026 – Sunday 06.12.2026; the next two Mondays.
const MON = '2026-11-30'
const MON1 = '2026-12-07'
const MON2 = '2026-12-14'

function dayOf(date: string, raw: Record<string, unknown> | null = null, begun: string[] = []): ApplyDay {
  const dayFile = raw ? dayFileFrom(raw, date) : null
  const snapshot = createDay({ date, changes: [] as SettingsChange[], templates: [ordinary], lectures: [], series: [], dayFile, holidays, at: null })
  return { date, plan: dayPlan(snapshot, dayFile), snapshot, raw, begun: new Set(begun) }
}
const planAfter = (day: ApplyDay, raw: Record<string, unknown>) => dayPlan(day.snapshot, dayFileFrom(raw, day.date))
const own = (p: Partial<PlanBlock> & Pick<PlanBlock, 'id' | 'categoryId' | 'durationMin'>): PlanBlock => planBlock({ origin: 'user', ...p })

/** The source Monday: the day's plan with your blocks laid in its file. */
function sourceOf(date: string, blocks: Array<Record<string, unknown>>, o: { off?: string[]; only?: string[] } = {}): CopySource {
  const day = dayOf(date, { schema: 1, date, blocks })
  return { date, plan: day.plan, off: new Set(o.off ?? []), ...(o.only ? { only: new Set(o.only) } : {}) }
}

describe('dni docelowe – ten sam dzień tygodnia (D630)', () => {
  it('tydzień na dwa następne: pn → pn, nd → nd, D + 7k', () => {
    const t = copyTargets([MON, '2026-12-06'], [MON1, MON2], '2026-11-24')
    expect(t).toEqual([
      { source: MON, date: MON1, past: false },
      { source: '2026-12-06', date: '2026-12-13', past: false },
      { source: MON, date: MON2, past: false },
      { source: '2026-12-06', date: '2026-12-20', past: false }
    ])
  })

  it('zaznaczenie przez dwa tygodnie (nd i pn w „3 dniach”): każdy dzień o tyle samo tygodni, tydzień źródłowy nie jest celem', () => {
    // The source week is the earliest day's: 30.11; the week of 07.12 is k = 1 – Sunday 06.12 → 13.12, Monday 07.12 → 14.12.
    expect(copyTargets(['2026-12-06', MON1], [MON1, '2026-12-02'], '2026-11-24')).toEqual([
      { source: '2026-12-06', date: '2026-12-13', past: false },
      { source: MON1, date: MON2, past: false }
    ])
  })

  it('dzień docelowy przed dziś – minione (pominięte, D633); dziś nie jest minione', () => {
    const t = copyTargets(['2026-11-16', '2026-11-17'], ['2026-11-23'], '2026-11-24')
    expect(t).toEqual([
      { source: '2026-11-16', date: '2026-11-23', past: true },
      { source: '2026-11-17', date: '2026-11-24', past: false }
    ])
  })
})

describe('co się kopiuje (D630, D631)', () => {
  it('własne i szablonu – tak; sesje, wykłady, zajęcia zjazdu, serie, bufory i zdjęte z planu – nie', () => {
    const plan = [
      own({ id: 'mine', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }),
      planBlock({ id: 'tpl', categoryId: 'rutyny', startMin: 6 * 60 + 15, durationMin: 30, origin: 'template', sourceId: 'rutyna' }),
      planBlock({ id: 'ses', categoryId: 'sesja-ny', startMin: 14 * 60, durationMin: 180, origin: 'session', sourceId: 'ny', fixed: true }),
      planBlock({ id: 'lec', categoryId: 'wyklad', startMin: 18 * 60, durationMin: 90, origin: 'lecture', fixed: true }),
      planBlock({ id: 'zj', categoryId: 'zjazd', startMin: 19 * 60, durationMin: 90, origin: 'zjazd', fixed: true }),
      planBlock({ id: 'ser', categoryId: 'sport', startMin: 7 * 60, durationMin: 30, origin: 'series', sourceId: 'bieg' }),
      planBlock({ id: 'buf', categoryId: 'regeneracja', anchor: 'mine', durationMin: 15, origin: 'decompress', decompress: { cost: 6, untilMin: 23 * 60 } }),
      own({ id: 'parked', categoryId: 'inne', startMin: 20 * 60, durationMin: 30 })
    ]
    const copies = copiesFor({ date: MON, plan, off: new Set(['parked']) }, MON1)
    expect(copies.map((b) => b.id)).toEqual([weekCopyId(MON1, MON, 'mine'), weekCopyId(MON1, MON, 'tpl')])
    expect(copies.every((b) => b.origin === 'user' && b.sourceId == null)).toBe(true)
  })

  it('kopia: nazwa, notatka, koszt, wariant i rutyna zostają; bez sprawy i próśb; kroki od nowa', () => {
    const b = own({
      id: 'a',
      categoryId: 'nauka',
      variantId: 'czytanie',
      startMin: 12 * 60,
      durationMin: 45,
      name: 'Rozdział 3',
      note: 'str. 40–60',
      costs: { head: 2, emotions: 1, senses: 1, body: 0 },
      task: 'sprawa-1',
      requests: ['prosba-1'],
      routine: 'czytanie',
      moves: 2,
      movedFrom: '2026-11-29',
      steps: [{ id: 's1', title: 'Notatki', order: 0, done: true }]
    })
    const [c] = copiesFor({ date: MON, plan: [b], off: new Set() }, MON1)
    expect(c).toMatchObject({ id: weekCopyId(MON1, MON, 'a'), name: 'Rozdział 3', note: 'str. 40–60', costs: { head: 2, emotions: 1, senses: 1, body: 0 }, variantId: 'czytanie', routine: 'czytanie', startMin: 12 * 60, durationMin: 45 })
    expect(c).toMatchObject({ task: null, requests: [], moves: 0, movedFrom: null, steps: [{ id: 's1', title: 'Notatki', order: 0, done: false }] })
  })

  it('id kopii stałe (dzień docelowy, źródłowy, blok) – różne dla każdego tygodnia', () => {
    const src: CopySource = { date: MON, plan: [own({ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 45 })], off: new Set() }
    expect(copiesFor(src, MON1)[0]!.id).toBe(copiesFor(src, MON1)[0]!.id)
    expect(copiesFor(src, MON1)[0]!.id).not.toBe(copiesFor(src, MON2)[0]!.id)
  })

  it('kotwice i grupy idą za kopiami; zakotwiczony do bloku, którego się nie kopiuje (sesja, niezaznaczony) – własna godzina', () => {
    const plan = [
      own({ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }),
      own({ id: 'b', categoryId: 'journaling', anchor: 'a', durationMin: 15 }),
      planBlock({ id: 'ses', categoryId: 'sesja-ny', startMin: 14 * 60, durationMin: 180, origin: 'session', sourceId: 'ny', fixed: true }),
      own({ id: 'c', categoryId: 'journaling', anchor: 'ses', durationMin: 15 }),
      own({ id: 'd', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, alongside: 'a' })
    ]
    const copies = new Map(copiesFor({ date: MON, plan, off: new Set() }, MON1).map((b) => [b.id, b]))
    const c = (x: string) => copies.get(weekCopyId(MON1, MON, x))!
    expect(c('b')).toMatchObject({ anchor: weekCopyId(MON1, MON, 'a'), startMin: null })
    expect(c('c')).toMatchObject({ anchor: null, startMin: 17 * 60 })
    expect(c('d').alongside).toBe(weekCopyId(MON1, MON, 'a'))
    // Only „b” selected: its anchor is not copied – it keeps the hour it had (13:00).
    const only = copiesFor({ date: MON, plan, off: new Set(), only: new Set(['b']) }, MON1)
    expect(only).toEqual([expect.objectContaining({ id: weekCopyId(MON1, MON, 'b'), anchor: null, startMin: 13 * 60 })])
  })
})

describe('kolizje jak „Zastosuj do…” (D541, D632)', () => {
  const src = () => sourceOf(MON, [
    { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
    { id: 'w', categoryId: 'sport', startMin: 19 * 60, durationMin: 60 }
  ])
  const ca = weekCopyId(MON1, MON, 'a')
  const cw = weekCopyId(MON1, MON, 'w')

  it('bez kolizji – bez pytania, oba bloki pn → pn w tych samych godzinach', () => {
    const day = dayOf(MON1)
    const j = judgeCopy(src(), day)
    expect(asksMode(j)).toBe(false)
    const r = applyCopy(day, 'fill', j)
    expect(r.added).toBe(2)
    const plan = planAfter(day, r.raw)
    expect(plan.find((b) => b.id === ca)).toMatchObject({ startMin: 12 * 60, origin: 'user' })
    expect(plan.find((b) => b.id === cw)).toMatchObject({ startMin: 19 * 60 })
    // Typ dnia i pobudka zostają.
    expect(r.raw.dayType).toBeUndefined()
    expect(r.raw.wakeMin).toBeUndefined()
  })

  it('kolizja z własnym blokiem: pytanie; „Uzupełnij luki” – tylko mieszczące się, „Nadpisz plan” – kolidujący odwołany', () => {
    const day = dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: 'x', categoryId: 'inne', startMin: 12 * 60 + 30, durationMin: 60 }] })
    const j = judgeCopy(src(), day)
    expect(asksMode(j)).toBe(true)
    const fill = applyCopy(day, 'fill', j)
    expect(fill).toMatchObject({ added: 1, cancelled: 0, skipped: 1 })
    expect(planAfter(day, fill.raw).map((b) => b.id)).toEqual(expect.arrayContaining(['x', cw]))
    const over = applyCopy(day, 'overwrite', j)
    expect(over).toMatchObject({ added: 2, cancelled: 1 })
    const plan = planAfter(day, over.raw).map((b) => b.id)
    expect(plan).toEqual(expect.arrayContaining([ca, cw]))
    expect(plan).not.toContain('x')
  })

  it('„Nadpisz” nie odwołuje zaczętego ani sesji – kopia na nich zostaje poza planem', () => {
    const onSession = sourceOf(MON, [{ id: 's', categoryId: 'nauka', startMin: 15 * 60, durationMin: 30 }])
    const day = dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: 'x', categoryId: 'inne', startMin: 12 * 60 + 30, durationMin: 60 }] }, ['x'])
    const r = applyCopy(day, 'overwrite', judgeCopy(src(), day))
    expect(r).toMatchObject({ cancelled: 0, added: 1 })
    expect(planAfter(day, r.raw).map((b) => b.id)).toContain('x')
    const s = applyCopy(dayOf(MON1), 'overwrite', judgeCopy(onSession, dayOf(MON1)))
    expect(s).toMatchObject({ added: 0, cancelled: 0, skipped: 1 })
  })

  it('blok, który dzień docelowy już ma (ten sam blok szablonu w tych godzinach, ten sam własny) – nie kolizja, nie pytanie', () => {
    // The source Monday has the template's routine 06:15 and your „a” 12:00; the target has the same routine and the same „a”.
    const source = sourceOf(MON, [{ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }])
    const day = dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }] })
    const j = judgeCopy(source, day)
    expect(j.missing).toEqual([])
    expect(j.already).toBe(2)
    expect(asksMode(j)).toBe(false)
  })

  it('zakotwiczony do bloku, który już jest – kotwica na blok dnia docelowego', () => {
    const tplId = templateBlockId(MON, 'zwykly', 'rutyna')
    const source = sourceOf(MON, [{ id: 'p', categoryId: 'journaling', anchor: tplId, durationMin: 10 }])
    const day = dayOf(MON1)
    const j = judgeCopy(source, day)
    expect(j.missing.map((m) => m.block.anchor)).toEqual([templateBlockId(MON1, 'zwykly', 'rutyna')])
    const r = applyCopy(day, 'fill', j)
    expect(r.added).toBe(1)
    expect(planAfter(day, r.raw).find((b) => b.id === weekCopyId(MON1, MON, 'p'))?.anchor).toBe(templateBlockId(MON1, 'zwykly', 'rutyna'))
  })

  it('druga kopia tego samego tygodnia niczego nie dubluje (te same id)', () => {
    const once = applyCopy(dayOf(MON1), 'fill', judgeCopy(src(), dayOf(MON1)))
    const day = dayOf(MON1, once.raw)
    const j = judgeCopy(src(), day)
    expect(j.missing).toEqual([])
    expect(j.already).toBe(3)
    expect(applyCopy(day, 'overwrite', j).added).toBe(0)
  })

  it('kopia przeniesiona potem na inny dzień nie wraca', () => {
    const once = applyCopy(dayOf(MON1), 'fill', judgeCopy(src(), dayOf(MON1)))
    const moved = { ...once.raw, movedTo: { [ca]: '2026-12-08' } }
    expect(judgeCopy(src(), dayOf(MON1, moved)).missing.map((m) => m.block.id)).toEqual([])
  })
})

describe('dziś – minione bloki pominięte (D633)', () => {
  it('o 13:00: blok 06:00–07:00 minął (pominięty), 12:30–13:30 trwa wg planu (dochodzi), 19:00 dochodzi', () => {
    const today = '2026-12-08'
    const source = sourceOf('2026-12-01', [
      { id: 'r', categoryId: 'sport', startMin: 5 * 60, durationMin: 60 },
      { id: 'n', categoryId: 'nauka', startMin: 12 * 60 + 30, durationMin: 60 },
      { id: 'w', categoryId: 'sport', startMin: 19 * 60, durationMin: 60 }
    ])
    const timing: ApplyTiming = { hours: 'plan', past: 'skip', today, nowMin: 13 * 60 }
    const day = dayOf(today)
    const j = judgeCopy(source, day, timing)
    expect(j.left.past).toBe(1)
    const r = applyCopy(day, 'fill', j)
    expect(r.added).toBe(2)
    const plan = planAfter(day, r.raw).map((b) => b.id)
    expect(plan).toEqual(expect.arrayContaining([weekCopyId(today, '2026-12-01', 'n'), weekCopyId(today, '2026-12-01', 'w')]))
    expect(plan).not.toContain(weekCopyId(today, '2026-12-01', 'r'))
  })
})

describe('doba 25 h i 23 h – godziny jak zegar', () => {
  it('blok 02:30 nocy z doby 25 h (24.10.2026) na sobotę 31.10 i na dobę 23 h (27.03.2027) – ta sama godzina', () => {
    const night = 26 * 60 + 30
    const long = sourceOf('2026-10-24', [{ id: 'n', categoryId: 'inne', startMin: night, durationMin: 20 }])
    const sat = dayOf('2026-10-31')
    const r = applyCopy(sat, 'fill', judgeCopy(long, sat))
    expect(planAfter(sat, r.raw).find((b) => b.id === weekCopyId('2026-10-31', '2026-10-24', 'n'))?.startMin).toBe(night)
    const src = sourceOf('2027-03-20', [{ id: 'n', categoryId: 'inne', startMin: night, durationMin: 20 }])
    const short = dayOf('2027-03-27')
    const s = applyCopy(short, 'fill', judgeCopy(src, short))
    expect(s.added).toBe(1)
    expect(planAfter(short, s.raw).find((b) => b.id === weekCopyId('2027-03-27', '2027-03-20', 'n'))?.startMin).toBe(night)
  })
})

describe('poprawki po przeglądzie r1 (T2950–T2953)', () => {
  it('grupa: pierwszy blok już jest w dniu docelowym – reszta grupy staje obok niego bez kolizji z nim (T2950)', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'b', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, alongside: 'a' }
    ])
    const day = dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }] })
    const j = judgeCopy(source, day)
    expect(j.missing.map((m) => [m.block.alongside, m.clash.map((c) => c.id)])).toEqual([['z', []]])
    expect(asksMode(j)).toBe(false)
    const r = applyCopy(day, 'overwrite', j)
    expect(r).toMatchObject({ added: 1, cancelled: 0 })
    expect(planAfter(day, r.raw).map((b) => b.id)).toEqual(expect.arrayContaining(['z', weekCopyId(MON1, MON, 'b')]))
  })

  it('grupa: pierwszy blok koliduje („Uzupełnij luki”) – blok obok niego też wypada, z powodem „obok pominiętego” (T2956)', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'b', categoryId: 'inne', startMin: 12 * 60, durationMin: 15, alongside: 'a' }
    ])
    const day = dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: 'x', categoryId: 'inne', startMin: 12 * 60 + 30, durationMin: 60 }] })
    const r = applyCopy(day, 'fill', judgeCopy(source, day))
    expect(r).toMatchObject({ added: 0, skipped: 1, beside: 1 })
    expect(planAfter(day, r.raw).map((b) => b.id)).not.toContain(weekCopyId(MON1, MON, 'b'))
  })

  it('kopia o id dawnej, usuniętej kopii nie dziedziczy jej odhaczeń ani listy rutyny z pliku (T2952)', () => {
    const cid = weekCopyId(MON1, MON, 'a')
    const source = sourceOf(MON, [{ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }])
    const raw = { schema: 1, date: MON1, stepsDone: { [cid]: { s1: true }, inny: { s2: true } }, routineSteps: { [cid]: { routine: 'r', version: '2026-01-01', steps: [] } } }
    const r = applyCopy(dayOf(MON1, raw), 'fill', judgeCopy(source, dayOf(MON1, raw)))
    expect(r.added).toBe(1)
    expect(r.raw.stepsDone).toEqual({ inny: { s2: true } })
    expect(r.raw.routineSteps).toBeUndefined()
  })

  it('kopia odwołana albo zaparkowana w dniu docelowym (log) – nie wraca i nie jest „już w planie”: pominięta (T2953)', () => {
    const cid = weekCopyId(MON1, MON, 'a')
    const source = sourceOf(MON, [{ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }])
    // Still in the file, the log took it off.
    const kept = { ...dayOf(MON1, { schema: 1, date: MON1, blocks: [{ id: cid, categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }] }), off: new Set([cid]) }
    // The template's routine of both Mondays is the one block „już w planie”; the copy the log cancelled is not.
    expect(judgeCopy(source, kept)).toMatchObject({ missing: [], already: 1, offDay: 1 })
    // Taken out of the file since: its id is still off in the log – not brought back.
    const gone = { ...dayOf(MON1), off: new Set([cid]) }
    const j = judgeCopy(source, gone)
    expect(j).toMatchObject({ missing: [], offDay: 1 })
    expect(applyCopy(gone, 'fill', j).added).toBe(0)
  })

  it('ten sam blok odwołany logiem w dniu docelowym (blok szablonu) – nie wskrzeszony jako Twój: pominięty (D632)', () => {
    const tpl = templateBlockId(MON1, 'zwykly', 'rutyna')
    const source = sourceOf(MON, [])
    const day = { ...dayOf(MON1), off: new Set([tpl]) }
    const j = judgeCopy(source, day)
    expect(j.missing).toEqual([])
    expect(j).toMatchObject({ already: 0, offDay: 1 })
  })
})

describe('poprawki po przeglądzie r2 (T2956–T2961)', () => {
  it('zamknięcie odwołanej kopii nie idzie przez blok, który dzień już ma: kopia zakotwiczona do niego staje za blokiem dnia (T2956)', () => {
    // x 12:00–12:30 (its copy cancelled by the target's log, still in the file), a anchored to x (the target has the same block z), d anchored to a.
    const source = sourceOf(MON, [
      { id: 'x', categoryId: 'inne', startMin: 12 * 60, durationMin: 30 },
      { id: 'a', categoryId: 'nauka', anchor: 'x', durationMin: 30 },
      { id: 'd', categoryId: 'journaling', anchor: 'a', durationMin: 15 }
    ])
    const cx = weekCopyId(MON1, MON, 'x')
    const raw = { schema: 1, date: MON1, blocks: [{ id: cx, categoryId: 'inne', startMin: 12 * 60, durationMin: 30 }, { id: 'z', categoryId: 'nauka', startMin: 12 * 60 + 30, durationMin: 30 }] }
    const day = { ...dayOf(MON1, raw), off: new Set([cx]) }
    const j = judgeCopy(source, day)
    // The template's routine and „a” (z) are there already; only x's copy is off.
    expect(j).toMatchObject({ offDay: 1, already: 2 })
    expect(j.missing.map((m) => [m.block.id, m.block.anchor])).toEqual([[weekCopyId(MON1, MON, 'd'), 'z']])
  })

  it('bliźniak w grupie dnia docelowego: kopia „obok” staje przy pierwszym bloku tej grupy – zapis płaski (T2960)', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'd', categoryId: 'inne', startMin: 12 * 60, durationMin: 20, alongside: 'a' }
    ])
    // The target's group: r first, z (the same block as a) beside it.
    const raw = { schema: 1, date: MON1, blocks: [{ id: 'r', categoryId: 'sport', startMin: 12 * 60, durationMin: 45 }, { id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60, alongside: 'r' }] }
    const j = judgeCopy(source, dayOf(MON1, raw))
    expect(j.missing.map((m) => m.block.alongside)).toEqual(['r'])
  })

  it('grupa dnia docelowego pełna (parallelMax) – kopia „obok” bez kolizji z grupą, ale wypada „grupa pełna”; „Nadpisz” nie odwołuje bloków grupy (T2958)', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'd', categoryId: 'inne', startMin: 12 * 60, durationMin: 20, alongside: 'a' }
    ])
    const raw = {
      schema: 1,
      date: MON1,
      blocks: [
        { id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
        { id: 'p', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, alongside: 'z' },
        { id: 'q', categoryId: 'sport', startMin: 12 * 60, durationMin: 30, alongside: 'z' }
      ]
    }
    const full = { ...dayOf(MON1, raw), parallelMax: 3 }
    const j = judgeCopy(source, full)
    expect(j.missing.map((m) => m.clash.map((c) => c.id))).toEqual([[]])
    expect(asksMode(j)).toBe(false)
    for (const mode of ['fill', 'overwrite'] as const) expect(applyCopy(full, mode, j)).toMatchObject({ added: 0, cancelled: 0, full: 1 })
    // Room for one more: it comes in.
    const roomy = { ...full, parallelMax: 4 }
    expect(applyCopy(roomy, 'fill', judgeCopy(source, roomy))).toMatchObject({ added: 1, full: 0 })
  })

  it('kopia odwołana w pliku i przywracana (`backInFile`) zachowuje swoje odhaczenia; czyszczone tylko dla id bez bloku w pliku (T2959)', () => {
    const cid = weekCopyId(MON1, MON, 'a')
    const source = sourceOf(MON, [{ id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }])
    const raw = { schema: 1, date: MON1, blocks: [{ id: cid, categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 }], cancelled: { [cid]: true }, stepsDone: { [cid]: { s1: true } } }
    const r = applyCopy(dayOf(MON1, raw), 'fill', judgeCopy(source, dayOf(MON1, raw)))
    expect(r.added).toBe(1)
    expect(r.raw.stepsDone).toEqual({ [cid]: { s1: true } })
  })
})

describe('przegląd r3 – grupy bez własnego czasu (T2951, T2956, T2958)', () => {
  it('pełna grupa i „Nadpisz plan”: kopia obok nie odwołuje bloków własnej grupy, nawet gdy koliduje też z innym blokiem', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'd', categoryId: 'inne', startMin: 12 * 60, durationMin: 20, alongside: 'a' }
    ])
    const raw = {
      schema: 1,
      date: MON1,
      blocks: [
        { id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
        { id: 'p', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, alongside: 'z' },
        { id: 'x', categoryId: 'sport', startMin: 12 * 60 + 10, durationMin: 10 }
      ]
    }
    const day = { ...dayOf(MON1, raw), parallelMax: 2 }
    const j = judgeCopy(source, day)
    expect(j.missing.map((m) => m.clash.map((c) => c.id))).toEqual([['x']])
    // It stays out either way (beyond the limit even with x cancelled): no question, and nothing of the day is cancelled for it.
    expect(asksMode(j)).toBe(false)
    const r = applyCopy(day, 'overwrite', j)
    expect(r).toMatchObject({ added: 0, cancelled: 0 })
    expect(r.skipped + r.full).toBe(1)
    expect(planAfter(day, r.raw).map((b) => b.id)).toEqual(expect.arrayContaining(['z', 'p', 'x']))
  })

  it('limit liczy tylko bloki faktycznie wzięte: d1 koliduje i wypada – d2 mieści się w limicie 3', () => {
    const source = sourceOf(MON, [
      { id: 'a', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
      { id: 'd1', categoryId: 'inne', startMin: 12 * 60, durationMin: 60, alongside: 'a' },
      { id: 'd2', categoryId: 'sport', startMin: 12 * 60, durationMin: 20, alongside: 'a' }
    ])
    const raw = {
      schema: 1,
      date: MON1,
      blocks: [
        { id: 'z', categoryId: 'nauka', startMin: 12 * 60, durationMin: 60 },
        { id: 'p', categoryId: 'regeneracja', startMin: 12 * 60, durationMin: 30, alongside: 'z' },
        { id: 'x', categoryId: 'inne', startMin: 12 * 60 + 40, durationMin: 20 }
      ]
    }
    const day = { ...dayOf(MON1, raw), parallelMax: 3 }
    const r = applyCopy(day, 'fill', judgeCopy(source, day))
    expect(r).toMatchObject({ added: 1, skipped: 1, full: 0 })
    expect(planAfter(day, r.raw).map((b) => b.id)).toContain(weekCopyId(MON1, MON, 'd2'))
  })

  it('kopia zakotwiczona do odwołanej liczona osobno: „zakotwiczone do odwołanych”', () => {
    const cx = weekCopyId(MON1, MON, 'x')
    const source = sourceOf(MON, [
      { id: 'x', categoryId: 'inne', startMin: 12 * 60, durationMin: 30 },
      { id: 'a', categoryId: 'journaling', anchor: 'x', durationMin: 15 }
    ])
    const day = { ...dayOf(MON1), off: new Set([cx]) }
    expect(judgeCopy(source, day)).toMatchObject({ offDay: 1, offAnchored: 1, missing: [] })
  })
})
