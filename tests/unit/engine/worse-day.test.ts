/**
 * „Gorszy dzień” (D570, D587, N4) – pure rules: the proposal after a check-in worse (≤ 65) in two pools or more (only with the setting),
 * the acceptance (routines not begun nor past to „na gorsze dni”, the boundary earlier, never before the click rounded up to 5 min, the
 * mark with what it changed) and its „Cofnij” (only what still stands as the acceptance left it – the rest stays and is said; the mark
 * stays as a period gone by, the proposal does not come back that day).
 */
import { describe, expect, it } from 'vitest'
import { setRoutineSteps, type Raw } from '@shared/data/dayEdits'
import { gridOf, idxOfLogical, atOf } from '@shared/engine/grid'
import { routineVersionEdits } from '@shared/engine/steps'
import { dayCheckin, undoApprovalCase, withApprovalId, worseDayAccept, worseDayProposal, worseDayText, worseDayUndo, worsePools, worseUndoText, WORSE_DAY_ALREADY, WORSE_DAY_NONE, type WorseAccept } from '@shared/engine/worseDay'
import { fieldByKey, TOGGLE_FIELDS } from '@shared/model/fields'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { DEFAULT_SETTINGS, settingsFrom } from '@shared/model/settings'
import type { Routine } from '@shared/model/routines'
import { worseBoundary, worseDayMarkFrom, worseFloorOf, worsePeriodsOf } from '@shared/model/worseDay'
import { block, lm, Scenario } from './dsl'

const DATE = '2026-10-21'
const g = gridOf(DATE)
const idx = (t: string) => idxOfLogical(g, lm(t))
const steps = (...ids: string[]) => ids.map((id) => ({ id, name: id, min: 5 }))
const ROUTINES: Routine[] = [
  { id: 'r', name: 'Poranna', normal: steps('woda', 'kot', 'spacer'), worse: steps('woda'), archived: false },
  { id: 'n', name: 'Bez gorszej', normal: steps('woda'), worse: [], archived: false }
]
const routineBlock = (id: string, at: string, routine: string): PlanBlock => ({ ...block({ id, cat: 'rutyny', at, min: 20 }), routine })

/** A day: a routine gone by (07:00), one begun (08:45), one to come (12:00), one without „na gorsze dni” (13:00), work 09:30–15:30. */
function day() {
  const plan = [routineBlock('past', '07:00', 'r'), routineBlock('begun', '08:45', 'r'), routineBlock('later', '12:00', 'r'), routineBlock('plain', '13:00', 'n'), block({ id: 'a', cat: 'analiza', at: '09:30', min: 6 * 60 })]
  const s = new Scenario({ date: DATE, plan }).start('begun', '08:50')
  return { s, plan }
}
/** The acceptance at `now` (a wall time, or an instant) on the day as the engine counts it then, with the day's mark so far. */
const accept = (s: Scenario, plan: readonly PlanBlock[], now: string | number, raw: Raw | null = null, earlierMin = 60) => {
  const at = typeof now === 'number' ? now : s.at(now)
  const out = worseDayAccept({ date: DATE, raw, plan, state: s.stateAt(at, withMark(raw)), routines: ROUTINES, earlierMin, at })
  if ('error' in out) throw new Error(out.error)
  return out
}
/** The day's context with the mark of the file `raw` (as `dayContextOf` gives it). */
const withMark = (raw: Raw | null) => {
  const mark = raw ? dayFileFrom(raw, DATE).worseDay : undefined
  return mark ? { worseDays: worsePeriodsOf(mark) } : {}
}
/** „Cofnij” at `now` on the day counted with the file's mark (its events – the log as the window reads it). */
const undoOf = (s: Scenario, plan: readonly PlanBlock[], now: string, raw: Raw) =>
  worseDayUndo({ date: DATE, raw, plan, state: s.state(now, withMark(raw)), events: s.contextAt(s.at(now)).events, at: s.at(now) })
const undo = (s: Scenario, plan: readonly PlanBlock[], now: string, raw: Raw) => {
  const out = undoOf(s, plan, now, raw)
  if ('error' in out) throw new Error(out.error)
  return out
}
/** The id of the last event written (an approval written by the acceptance, as the window gets it back). */
const lastId = (s: Scenario): string => s.events.at(-1)!.id

describe('ustawienia „Gorszego dnia” w „Planie dnia” (D570)', () => {
  it('propozycja domyślnie wyłączona, 60 min wcześniej; obie z datą obowiązywania w „Planie dnia”, zakres 0–4 h', () => {
    expect(DEFAULT_SETTINGS.worseDay).toEqual({ propose: false, earlierMin: 60 })
    expect(fieldByKey('worseDay.earlierMin')).toMatchObject({ scope: 'dated', group: 'plan', kind: 'duration', range: [0, 240] })
    expect(TOGGLE_FIELDS.find((f) => f.key === 'worseDay.propose')).toMatchObject({ path: ['worseDay', 'propose'], group: 'plan' })
  })

  it('odczyt tolerancyjny: brak pola (starsza migawka) i zła wartość – domyślne', () => {
    expect(settingsFrom({}).worseDay).toEqual({ propose: false, earlierMin: 60 })
    expect(settingsFrom({ worseDay: { propose: 'tak', earlierMin: 300 } }).worseDay).toEqual({ propose: false, earlierMin: 60 })
    expect(settingsFrom({ worseDay: { propose: true, earlierMin: 90 } }).worseDay).toEqual({ propose: true, earlierMin: 90 })
  })
})

describe('granica gorszego dnia (czysta reguła)', () => {
  it('wcześniej o ustawienie, nie przed podłogą (chwila przyjęcia w górę do 5 min); granica już przed podłogą zostaje', () => {
    expect(worseFloorOf(602)).toBe(605)
    expect(worseFloorOf(600)).toBe(600)
    expect(worseBoundary(900, 60, 600)).toBe(840)
    expect(worseBoundary(900, 60, 870)).toBe(870)
    expect(worseBoundary(500, 60, 600)).toBe(500)
    expect(worseBoundary(900, 0, 600)).toBe(900)
  })
})

describe('propozycja „Gorszy dzień?” po check-inie (D570)', () => {
  const answers = (o: Partial<Record<'head' | 'emotions' | 'senses' | 'body', [0 | 1 | 2, 0 | 1 | 2]>>) => ({ head: [0, 0] as [0, 0], emotions: [0, 0] as [0, 0], senses: [0, 0] as [0, 0], body: [0, 0] as [0, 0], ...o })
  const events = (...list: Array<ReturnType<typeof answers>>) => {
    const s = new Scenario({ date: DATE, plan: [] })
    list.forEach((a, i) => s.checkin(`07:0${i}`, a))
    return s.contextAt(s.at('08:00')).events
  }
  const file = (o: { asked?: Record<string, string>; worseDay?: unknown } = {}) => dayFileFrom({ schema: 1, date: DATE, ...o }, DATE)

  it('pula „gorzej” = wynik check-inu ≤ 65 (jedno „tak” albo dwa „trochę”); jedno „trochę” (85) – nie; pula niezadana (ciało starszej wersji) – nie', () => {
    expect(worsePools(answers({ head: [1, 0], emotions: [1, 1], senses: [2, 0], body: [2, 2] }))).toEqual(['emotions', 'senses', 'body'])
    expect(worsePools(answers({ head: [1, 0] }))).toEqual([])
    expect(worsePools(answers({}))).toEqual([])
    expect(worsePools({ head: [1, 1], emotions: [0, 2], senses: [0, 0] })).toEqual(['head', 'emotions'])
    expect(worsePools({ head: [1, 1], emotions: [0, 1], senses: [0, 0] })).toEqual(['head'])
  })

  it('z ustawieniem i ≥ 2 pulami gorzej – propozycja z nazwami pul; bez ustawienia, z jedną pulą – brak', () => {
    const two = events(answers({ head: [1, 1], senses: [0, 2] }))
    expect(worseDayProposal({ on: true, events: two, file: null })).toEqual(['head', 'senses'])
    expect(worseDayProposal({ on: false, events: two, file: null })).toBeNull()
    expect(worseDayProposal({ on: true, events: events(answers({ head: [2, 2], emotions: [1, 0] })), file: null })).toBeNull()
    expect(worseDayProposal({ on: true, events: [], file: null })).toBeNull()
  })

  it('„×” (nie dziś, `asked.worseDay`) i przyjęty dzień (znak) – brak propozycji', () => {
    const two = events(answers({ head: [1, 1], senses: [0, 2] }))
    expect(worseDayProposal({ on: true, events: two, file: file({ asked: { worseDay: 'no' } }) })).toBeNull()
    expect(worseDayProposal({ on: true, events: two, file: file({ worseDay: { at: 1, earlierMin: 60, routines: {} } }) })).toBeNull()
  })

  it('liczy się pierwszy check-in dnia (ten, od którego liczy się energia)', () => {
    const list = events(answers({}), answers({ head: [2, 2], body: [2, 2] }))
    expect(dayCheckin(list)).toEqual(answers({}))
    expect(worseDayProposal({ on: true, events: list, file: null })).toBeNull()
  })
})

describe('przyjęcie „Gorszego dnia” (D587)', () => {
  it('rutyny niezaczęte i nieminione z wersją „na gorsze dni” – wersja dnia „na gorsze dni”; minione, zaczęte i bez tej wersji zostają', () => {
    const { s, plan } = day()
    const out = accept(s, plan, '09:00')
    expect(out.routines).toEqual(['later'])
    const file = dayFileFrom(out.raw, DATE)
    expect(file.routineSteps?.later).toMatchObject({ routine: 'r', version: 'worse' })
    expect(file.routineSteps?.later?.steps.map((x) => x.id)).toEqual(['woda'])
    expect(Object.keys(file.routineSteps ?? {})).toEqual(['later'])
  })

  it('propozycja granicy wcześniej o ustawienie – znak w pliku dnia mówi, od kiedy i o ile (silnik liczy z niego)', () => {
    const { s, plan } = day()
    const out = accept(s, plan, '09:00')
    const proposal = s.state('09:00').boundary.proposal!
    expect(out.boundary).toEqual({ from: proposal, to: proposal - 60 })
    expect(out.approve).toBeNull()
    expect(worseDayMarkFrom(out.raw.worseDay)).toEqual({ at: s.at('09:00'), earlierMin: 60, routines: ['later'], undoneAt: null, past: [], approvalBefore: null, approvalId: null })
    expect((out.raw.worseDay as Raw).routines).toEqual({ later: null })
  })

  it('zatwierdzona granica – nowe zatwierdzenie wcześniej (jak przesunięcie z paska), ten sam rodzaj i plan; znak zapisuje zatwierdzenie sprzed (z id)', () => {
    const { s, plan } = day()
    s.approve('15:45', '08:55')
    const before = lastId(s)
    const out = accept(s, plan, '09:00')
    expect(out.boundary).toEqual({ from: idx('15:45'), to: idx('14:45') })
    expect(out.approve).toEqual({ boundary: atOf(g, idx('14:45')), auto: false, plan: plan.map((b) => b.id) })
    expect(worseDayMarkFrom(out.raw.worseDay)).toMatchObject({ approvalBefore: { to: s.at('15:45'), auto: false, id: before }, approvalId: null })
    // The id of the approval it wrote goes into the mark after it (the window gets it back from the log).
    expect(worseDayMarkFrom(withApprovalId(out.raw, 'pca-99').worseDay)!.approvalId).toBe('pca-99')
  })

  it('granica zatwierdzona sama przy starcie pracy, a prowadzący jej jeszcze nie zapisał – zatwierdzenie sprzed bez id, `auto`', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '08:00', min: 8 * 60 })]
    const s = new Scenario({ date: DATE, plan }).start('a', '08:00')
    const out = accept(s, plan, '09:00')
    expect(out.approve).toEqual({ boundary: s.at('15:15'), auto: true, plan: ['a'] })
    expect(worseDayMarkFrom(out.raw.worseDay)!.approvalBefore).toEqual({ to: s.at('16:15'), auto: true, id: null })
  })

  it('nie wcześniej niż teraz – podłoga to chwila kliknięcia w górę do pełnej minuty i do 5 min (15:05:20 → 15:10)', () => {
    const { s, plan } = day()
    s.approve('15:45', '08:55')
    expect(accept(s, plan, '15:02').boundary).toEqual({ from: idx('15:45'), to: idx('15:05') })
    const out = accept(s, plan, s.at('15:05') + 20_000)
    expect(out.boundary).toEqual({ from: idx('15:45'), to: idx('15:10') })
    expect(out.approve!.boundary).toBe(s.at('15:10'))
  })

  it('dzień bez rutyn z wersją „na gorsze dni” – tylko granica i znak; słowa mówią, co zmieniono', () => {
    const s = new Scenario({ date: DATE, plan: [routineBlock('plain', '13:00', 'n'), block({ id: 'a', cat: 'analiza', at: '09:30', min: 6 * 60 })] })
    const out = accept(s, s.opts.plan, '09:00')
    expect(out.routines).toEqual([])
    expect(worseDayText(DATE, out)).toBe('Gorszy dzień: granica 15:45 → 14:45')
  })

  it('słowa: „Gorszy dzień: 2 rutyny na gorsze dni, granica 16:00 → 15:00”; bez pracy i rutyn – „plan bez zmian”; zatwierdzenie niezapisane – granica bez zmian', () => {
    expect(worseDayText(DATE, { routines: ['a', 'b'], boundary: { from: idx('16:00'), to: idx('15:00') } })).toBe('Gorszy dzień: 2 rutyny na gorsze dni, granica 16:00 → 15:00')
    expect(worseDayText(DATE, { routines: ['a'], boundary: { from: idx('16:00'), to: idx('16:00') } })).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 16:00 bez zmian')
    expect(worseDayText(DATE, { routines: [], boundary: null })).toBe('Gorszy dzień: plan bez zmian')
    expect(worseDayText(DATE, { routines: ['a'], boundary: { from: idx('16:00'), to: idx('15:00') } }, 'failed')).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 16:00 bez zmian – nie zapisano zatwierdzenia')
    // The day's file waits for the folder (or a question): the approval waits for nothing – it is not written.
    expect(worseDayText(DATE, { routines: [], boundary: { from: idx('16:00'), to: idx('15:00') } }, 'waiting')).toBe('Gorszy dzień: granica 16:00 bez zmian – plan czeka na zapis, granicę zatwierdzisz ręcznie')
    // The approval written, its id not kept in the mark: „Cofnij” will not move the boundary back – said beforehand.
    expect(worseDayText(DATE, { routines: [], boundary: { from: idx('16:00'), to: idx('15:00') } }, 'unlinked')).toBe('Gorszy dzień: granica 16:00 → 15:00 – granicę cofniesz ręcznie w karcie granicy')
  })

  it('rutyna, którą dzień trzyma już „na gorsze dni”, i rutyna zapisana (`routine.done`) – bez zmiany', () => {
    const { s, plan } = day()
    const kept = routineVersionEdits({ date: DATE, day: null, block: plan[2]!, version: 'worse', routines: ROUTINES })
    if ('error' in kept) throw new Error(kept.error)
    expect(accept(s, plan, '09:00', kept.day).routines).toEqual([])
    const done = day()
    done.s.raw({ k: 'routine.done', block: 'later', at: done.s.at('08:58'), routine: 'r', version: 'normal', steps: [] }, '08:58')
    expect(accept(done.s, done.plan, '09:00').routines).toEqual([])
  })

  it('dzień ze znakiem w mocy (przyjęty na innym komputerze) – odmowa, nic do zapisu', () => {
    const { s, plan } = day()
    const once = accept(s, plan, '09:00')
    expect(worseDayAccept({ date: DATE, raw: once.raw, plan, state: s.state('09:00'), routines: ROUTINES, earlierMin: 60, at: s.at('09:01') })).toEqual({ error: WORSE_DAY_ALREADY })
  })

  it('nieznane pola pliku dnia zostają', () => {
    const { s, plan } = day()
    const out = accept(s, plan, '09:00', { schema: 1, date: DATE, future: { x: 1 } })
    expect(out.raw.future).toEqual({ x: 1 })
  })

  it('przyjęty ponownie po „Cofnij” – nowy znak, okres cofnięty zostaje w `past` (silnik liczy go dalej dla swoich minut)', () => {
    const { s, plan } = day()
    const first = accept(s, plan, '09:00')
    const back = undo(s, plan, '09:30', first.raw)
    const again = accept(s, plan, '10:00', back.raw, 30)
    const mark = worseDayMarkFrom(again.raw.worseDay)!
    expect(mark).toMatchObject({ at: s.at('10:00'), earlierMin: 30, undoneAt: null, past: [{ at: s.at('09:00'), earlierMin: 60, undoneAt: s.at('09:30') }] })
    expect(worsePeriodsOf(mark)).toEqual([
      { at: s.at('09:00'), earlierMin: 60, until: s.at('09:30') },
      { at: s.at('10:00'), earlierMin: 30, until: null }
    ])
  })
})

describe('„Cofnij” gorszego dnia (D587)', () => {
  const accepted = (o: { approved?: boolean; raw?: Raw | null } = {}) => {
    const { s, plan } = day()
    if (o.approved) s.approve('15:45', '08:55')
    const out: WorseAccept = accept(s, plan, '09:00', o.raw ?? null)
    return { s, plan, out }
  }

  it('przywraca wersje rutyn (rutyna bez wpisu – znów bez wpisu); znak zostaje jako okres cofnięty, propozycja nie wraca tego dnia (`asked`)', () => {
    const { s, plan, out } = accepted()
    const u = undo(s, plan, '09:05', out.raw)
    expect(u.restored).toEqual(['later'])
    expect(u.kept).toEqual([])
    expect(u.raw.routineSteps).toBeUndefined()
    const file = dayFileFrom(u.raw, DATE)
    expect(file.worseDay).toMatchObject({ at: s.at('09:00'), earlierMin: 60, undoneAt: s.at('09:05'), routines: [] })
    expect(file.asked.worseDay).toBe('no')
    expect(worseUndoText(DATE, u)).toBe('Cofnięto gorszy dzień.')
  })

  it('wpis wersji sprzed przyjęcia wraca dokładnie taki, jaki był', () => {
    const normal = setRoutineSteps({ schema: 1, date: DATE }, 'later', { routine: 'r', version: 'normal', steps: [{ id: 'woda', title: 'woda', order: 0, done: false }] })
    const { s, plan, out } = accepted({ raw: normal })
    expect((out.raw.worseDay as Raw).routines).toEqual({ later: (normal.routineSteps as Raw).later })
    expect(undo(s, plan, '09:05', out.raw).raw.routineSteps).toEqual(normal.routineSteps)
  })

  it('rutyna przełączona od tego czasu z powrotem na zwykłą – zostaje; słowa mówią, co pominięto', () => {
    const { s, plan, out } = accepted()
    const back = routineVersionEdits({ date: DATE, day: out.raw, block: plan[2]!, version: 'normal', routines: ROUTINES })
    if ('error' in back) throw new Error(back.error)
    const u = undo(s, plan, '09:05', back.day)
    expect(u.kept).toEqual(['later'])
    expect(dayFileFrom(u.raw, DATE).routineSteps?.later?.version).toBe('normal')
    expect(worseUndoText(DATE, u)).toBe('Cofnięto gorszy dzień – zostaje: 1 rutyna zmieniona w międzyczasie.')
  })

  it('rutyna zaczęta, zaparkowana albo zapisana od przyjęcia – zostaje „na gorsze dni” (te same wykluczenia co przy przyjęciu)', () => {
    for (const since of [(s: Scenario) => s.start('later', '11:58'), (s: Scenario) => s.raw({ k: 'block.park', block: 'later', at: s.at('11:00') }, '11:00'), (s: Scenario) => s.raw({ k: 'routine.done', block: 'later', at: s.at('11:00'), routine: 'r', version: 'worse', steps: ['woda'] }, '11:00')]) {
      const { s, plan, out } = accepted()
      since(s)
      const u = undo(s, plan, '12:05', out.raw)
      expect(u.restored).toEqual([])
      expect(u.kept).toEqual(['later'])
      expect(dayFileFrom(u.raw, DATE).routineSteps?.later?.version).toBe('worse')
    }
  })

  /** The acceptance's approval written to the log at `at` (as the window writes it) and its id in the mark. */
  const written = (s: Scenario, out: WorseAccept, at: string, auto = false): Raw => {
    s.approve(hhmm(out.approve!.boundary), at, auto)
    return withApprovalId(out.raw, lastId(s))
  }
  const hhmm = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

  /** The case of „Cofnij” on the day counted at `now` with the file's mark. */
  const caseOf = (s: Scenario, now: string, raw: Raw) => undoApprovalCase(s.state(now, withMark(raw)), dayFileFrom(raw, DATE).worseDay!, s.contextAt(s.at(now)).events)

  it('zatwierdzenie z przyjęcia nadal w mocy (po id, nic nowszego) – wraca zatwierdzenie sprzed, z jego rodzajem', () => {
    const { s, plan, out } = accepted({ approved: true })
    const raw = written(s, out, '09:00')
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'ours' })
    const u = undo(s, plan, '09:05', raw)
    expect(u.approve).toEqual({ boundary: s.at('15:45'), auto: false, plan: plan.map((b) => b.id) })
    expect(u.stays).toBeNull()
  })

  it('„Zatwierdź” i „Gorszy dzień” w tej samej minucie – kolejność logu, nie minuta: zatwierdzenie sprzed przyjęcia wraca, Twoje po przyjęciu zostaje (nazwane)', () => {
    // Approved at 09:00:10, accepted at 09:00:40, the acceptance's approval at 09:00:50 – all in one minute.
    const first = day()
    first.s.raw({ k: 'boundary.approve', at: first.s.at('09:00') + 10_000, boundary: first.s.at('15:45'), auto: false }, '09:00')
    const out = accept(first.s, first.plan, first.s.at('09:00') + 40_000)
    first.s.raw({ k: 'boundary.approve', at: first.s.at('09:00') + 50_000, boundary: out.approve!.boundary, auto: false }, '09:00')
    const u = undo(first.s, first.plan, '09:05', withApprovalId(out.raw, lastId(first.s)))
    expect(u.approve).toMatchObject({ boundary: first.s.at('15:45'), auto: false })
    // Accepted at 09:00:10 (nothing approved), approved by you at 09:00:40 – at the proposal already earlier: it stays.
    const second = day()
    const out2 = accept(second.s, second.plan, second.s.at('09:00') + 10_000)
    second.s.raw({ k: 'boundary.approve', at: second.s.at('09:00') + 40_000, boundary: second.s.at('14:45'), auto: false }, '09:00')
    const u2 = undo(second.s, second.plan, '09:05', out2.raw)
    expect([u2.approve, u2.stays]).toEqual([null, idx('14:45')])
    expect(worseUndoText(DATE, u2)).toBe('Cofnięto gorszy dzień – zostaje: granica 14:45 – zmienisz ją w karcie granicy.')
  })

  it('zatwierdzenie przyjęcia niezapisane (bez id) – w mocy zatwierdzenie sprzed: nic do przywrócenia, nic nie mówi', () => {
    const { s, plan, out } = accepted({ approved: true })
    expect(caseOf(s, '09:05', out.raw)).toEqual({ kind: 'same' })
    const u = undo(s, plan, '09:05', out.raw)
    expect([u.approve, u.stays]).toEqual([null, null])
    expect(worseUndoText(DATE, u)).toBe('Cofnięto gorszy dzień.')
  })

  it('granica zatwierdzona sama przy starcie pracy i niezapisana przy przyjęciu – „Cofnij” wraca do niej (`auto`); dopisana później przez prowadzącego (sprzed przyjęcia) – nic', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '08:00', min: 8 * 60 })]
    const s = new Scenario({ date: DATE, plan }).start('a', '08:00')
    const out = accept(s, plan, '09:00')
    const raw = written(s, out, '09:00', true)
    expect(undo(s, plan, '09:05', raw).approve).toEqual({ boundary: s.at('16:15'), auto: true, plan: ['a'] })
    // The acceptance's approval not written; the leader writes the one of 08:00 later: another approval than the one before (by id) – named.
    const t = new Scenario({ date: DATE, plan }).start('a', '08:00')
    const out2 = accept(t, plan, '09:00')
    t.raw({ k: 'boundary.approve', at: t.at('08:00'), boundary: t.at('16:15'), auto: true }, '09:01')
    expect(caseOf(t, '09:05', out2.raw)).toEqual({ kind: 'later', to: t.at('16:15') })
    expect([undo(t, plan, '09:05', out2.raw).approve, undo(t, plan, '09:05', out2.raw).stays]).toEqual([null, idx('16:15')])
    // Still the one approved by itself before the acceptance (not written, the same boundary): nothing to say.
    const u = new Scenario({ date: DATE, plan }).start('a', '08:00')
    const out3 = accept(u, plan, '09:00')
    expect(caseOf(u, '09:05', out3.raw)).toEqual({ kind: 'same' })
  })

  it('granica zatwierdzona sama w tej samej minucie co przyjęcie (praca od 09:00:00, przyjęcie 09:00:20) – nie ta sprzed przyjęcia: zostaje, nazwana', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '09:00', min: 7 * 60 })]
    const s = new Scenario({ date: DATE, plan }).start('a', '09:00')
    const out = accept(s, plan, s.at('09:00') + 20_000)
    expect(dayFileFrom(out.raw, DATE).worseDay!.approvalBefore).toBeNull()
    const counted = s.state('09:30', withMark(out.raw))
    const c = caseOf(s, '09:30', out.raw)
    expect(c).toEqual({ kind: 'later', to: atOf(g, counted.boundary.approved!) })
    expect(undo(s, plan, '09:30', out.raw).stays).toBe(counted.boundary.approved)
  })

  it('granica zatwierdzona od tego czasu przez Ciebie – zostaje, dymek ją nazywa', () => {
    const { s, plan, out } = accepted({ approved: true })
    const raw = written(s, out, '09:00')
    s.approve('15:00', '09:03')
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'later', to: s.at('15:00') })
    const u = undo(s, plan, '09:05', raw)
    expect([u.approve, u.stays]).toEqual([null, idx('15:00')])
    expect(worseUndoText(DATE, u)).toBe('Cofnięto gorszy dzień – zostaje: granica 15:00 – zmienisz ją w karcie granicy.')
  })

  it('granica zatwierdzona sama po przyjęciu (start pierwszej pracy) – zostaje i jest nazwana; granicy nie rusza', () => {
    const plan = [block({ id: 'a', cat: 'analiza', at: '08:00', min: 8 * 60 })]
    const s = new Scenario({ date: DATE, plan })
    const out = accept(s, plan, '07:00')
    s.start('a', '08:00')
    expect(caseOf(s, '09:00', out.raw)).toEqual({ kind: 'later', to: s.at('15:15') })
    const u = undo(s, plan, '09:00', out.raw)
    expect([u.approve, u.stays]).toEqual([null, idx('15:15')])
    // Written by the leader as the list „zrobione automatycznie” has it – the same.
    s.approve('15:15', '08:00', true)
    expect(undo(s, plan, '09:00', out.raw).stays).toBe(idx('15:15'))
  })

  it('zatwierdzenie z przyjęcia z chwilą po teraz (zegar komputera z tyłu) – nadal ostatnie w logu: wraca zatwierdzenie sprzed, z planem TEGO zatwierdzenia', () => {
    const { s, plan, out } = accepted({ approved: true })
    s.raw({ k: 'boundary.approve', at: s.at('09:10'), boundary: s.at('14:45'), auto: false, plan: ['x', 'y'] }, '09:00')
    const raw = withApprovalId(out.raw, lastId(s))
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'ours' })
    expect(undo(s, plan, '09:05', raw).approve).toEqual({ boundary: s.at('15:45'), auto: false, plan: ['x', 'y'] })
  })

  it('po zatwierdzeniu z przyjęcia w logu jest nowsze (choćby z chwilą po teraz) – nie „ours”: granica w mocy zostaje, nazwana', () => {
    const { s, plan, out } = accepted({ approved: true })
    const raw = written(s, out, '09:00')
    s.raw({ k: 'boundary.approve', at: s.at('11:00'), boundary: s.at('15:00'), auto: false }, '09:02')
    // The engine has the acceptance's approval in force now (the later one's instant is to come) – that boundary is named.
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'later', to: s.at('14:45') })
    expect(undo(s, plan, '09:05', raw).approve).toBeNull()
  })

  it('zatwierdzenie z przyjęcia z „Cofnij zatwierdzenie” z chwilą po teraz – jak silnik: jeszcze w mocy, wraca zatwierdzenie sprzed', () => {
    const { s, plan, out } = accepted({ approved: true })
    const raw = written(s, out, '09:00')
    s.raw({ k: 'boundary.undo', at: s.at('11:00') }, '09:02')
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'ours' })
    expect(undo(s, plan, '09:05', raw).approve).toMatchObject({ boundary: s.at('15:45') })
  })

  it('zatwierdzenie z przyjęcia jeszcze nie doszło (log komputera, który przyjął) – bez odmowy: rutyny i znak cofnięte, granica ręcznie', () => {
    const { s, plan, out } = accepted({ approved: true })
    const raw = withApprovalId(out.raw, 'pcb-77')
    expect(caseOf(s, '09:05', raw)).toEqual({ kind: 'missing' })
    const u = undo(s, plan, '09:05', raw)
    expect([u.restored, u.approve, u.logMissing]).toEqual([['later'], null, true])
    expect(dayFileFrom(u.raw, DATE).worseDay!.undoneAt).toBe(s.at('09:05'))
    expect(worseUndoText(DATE, u)).toBe('Cofnięto gorszy dzień; granicę cofniesz ręcznie w karcie granicy – log komputera, który przyjął gorszy dzień, jeszcze nie doszedł.')
  })

  it('bez granicy w mocy – nic nie „zostaje” (dzień bez pracy)', () => {
    const s = new Scenario({ date: DATE, plan: [routineBlock('later', '12:00', 'r')] })
    const out = accept(s, s.opts.plan, '09:00')
    const u = undo(s, s.opts.plan, '09:05', out.raw)
    expect([u.approve, u.stays]).toEqual([null, null])
  })

  it('bez znaku w mocy (cofnięty na innym komputerze) – odmowa', () => {
    const { s, plan, out } = accepted()
    expect(undoOf(s, plan, '09:05', { schema: 1, date: DATE })).toEqual({ error: WORSE_DAY_NONE })
    const back = undo(s, plan, '09:05', out.raw)
    expect(undoOf(s, plan, '09:06', back.raw)).toEqual({ error: WORSE_DAY_NONE })
  })
})
