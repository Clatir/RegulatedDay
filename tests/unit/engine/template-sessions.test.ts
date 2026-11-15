/**
 * Sessions as entries of the templates of day types (D511, D515): every example of „Sesje tradingowe” with the session taken
 * from the template – placed from its zone („według czasu”), an hour earlier in the weeks the clocks of the USA and Europe
 * disagree (the wake too), shortened by an early close, asked about a week before a holiday in the USA and in the morning
 * on a weekday „pytaj”, none on a weekday „nie”, moving the maximum on a day without sessions, counted by its typical length,
 * followed by „po sesji NY”; a change of type brings the sessions of the new type's template. A day before the change keeps
 * the layer of sessions of the settings. The attachments of an entry: shown on the session of a day its template gives it,
 * removed with it only on the days the template makes.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf } from '@shared/engine/context'
import { createDay, dayPlan, nextWakeForBedtime } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { holidayQuestions, sessionQuestions, shiftNotice, type MorningInputs } from '@shared/engine/morning'
import { applyTypeChange, planTypeChange } from '@shared/engine/typeChange'
import { derivedId } from '@shared/model/ids'
import { dayFileFrom, emptyDayFile, planBlock, planBlockFrom, type BlockSession, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { DAY_TYPES, NY_ZONE, settingsOn, type SessionChoice, type SettingsChange } from '@shared/model/settings'
import { daySettings, knownSessionDefs, sessionOwnersOf, templateBlockPatch } from '@shared/model/templateSessions'
import { RULES_VERSION } from '@shared/model/events'
import { copiedBlock, copiedTemplate } from '@shared/engine/planEdit'
import { logicalMinuteOf, placeLogical } from '@shared/time/day'
import { lm } from './dsl'
import { blockName } from '@shared/blockName'
import { sessionBlockId } from '@shared/engine/createDay'
import { ownersOf, sessionAttachmentDates, templateRemovalIds, type Attachment } from '@shared/model/attachment'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)
const NO7 = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
/** The settings after the change of D511: the layer of sessions empty, every type „nie” (as the migration writes it). */
const migrated = (from = '2026-01-01'): SettingsChange => ({ id: 'sesje-w-szablonach', from, at: null, made: null, patch: { sessions: [], dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])) } })

const entry = (id: string, at: string, min: number, session: PlanBlock['session'], name: string | null = null): PlanBlock =>
  planBlock({ id, categoryId: 'sesja', startMin: lm(at), durationMin: min, fixed: true, origin: 'template', name, session })
const YES7: SessionChoice[] = ['yes', 'yes', 'yes', 'yes', 'yes', 'yes', 'yes']
const field = (zone: string, markets: BlockSession['markets'], days: SessionChoice[] = YES7): BlockSession => ({ zone, markets, days })
const NY = entry('ny', '14:00', 180, field(NY_ZONE, ['NYSE', 'CME_FX']), 'Sesja NY')
const LONDON = entry('londyn', '08:00', 180, field(NY_ZONE, ['UK']), 'Sesja Londyn')
/** Every weekday „pytaj”. */
const asked = (b: PlanBlock): PlanBlock => ({ ...b, session: { ...b.session!, days: YES7.map(() => 'ask' as const) } })
const withDays = (b: PlanBlock, days: string): PlanBlock => ({ ...b, session: { ...b.session!, days: days.split(' ') as SessionChoice[] } })

const template = (id: string, dayType: Template['dayType'], blocks: PlanBlock[], o: Partial<Template> = {}, from = '2026-01-01', maxMin: number | null = null): Template => ({
  id,
  name: id,
  dayType,
  weekdays: [],
  archived: false,
  versions: [{ from, budgetMin: null, maxMin, blocks }],
  ...o
})
const ordinary = template('zwykly', 'zwykly', [
  planBlock({ id: 'rutyna', categoryId: 'rutyny', startMin: lm('06:15'), durationMin: 30, origin: 'template' }),
  LONDON,
  NY,
  planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'ny', durationMin: 30, origin: 'template' }),
  planBlock({ id: 'notatki', categoryId: 'journaling', anchor: 'session:londyn', durationMin: 15, origin: 'template' })
])
const remote = template('zdalny', 'zjazd-zdalny', [asked(LONDON), asked(NY)])

const inputs = (date: string, extra: Partial<Parameters<typeof createDay>[0]> = {}) => ({
  date,
  changes: [migrated()],
  templates: [ordinary, remote],
  lectures: [],
  series: [],
  dayFile: null,
  holidays,
  at: null,
  ...extra
})
const sessionsOf = (snap: ReturnType<typeof createDay>) => Object.fromEntries(snap.blocks.filter((b) => b.origin === 'session').map((b) => [b.sourceId, b.startMin]))

describe('sesje z szablonu typu dnia (D511) – „Sesje tradingowe”', () => {
  it('Londyn 08:00–11:00 i NY 14:00–17:00 czasu polskiego według czasu Nowego Jorku; te same bloki co z dawnej warstwy sesji', () => {
    const snap = createDay(inputs('2026-10-21'))
    expect(sessionsOf(snap)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    const ny = snap.blocks.find((b) => b.sourceId === 'ny')!
    expect(ny).toMatchObject({ id: derivedId('2026-10-21', 'ses', 'ny'), origin: 'session', fixed: true, categoryId: 'sesja', name: 'Sesja NY', durationMin: 180 })
    // The template's entries are not blocks of the template on the day besides the sessions.
    expect(snap.blocks.filter((b) => b.origin === 'template').map((b) => b.sourceId).sort()).toEqual(['jrn', 'notatki', 'rutyna'])
    expect(snap.blocks.some((b) => b.origin === 'template' && (b.sourceId === 'ny' || b.sourceId === 'londyn'))).toBe(false)
    // A day whose template has none (the weekend has no template) has no sessions.
    expect(sessionsOf(createDay(inputs('2026-10-24')))).toEqual({})
  })

  it('między 25.10 a 1.11.2026 obie sesje zaczynają się godzinę wcześniej, pobudka też, a pora snu dnia przed nie', () => {
    const snap = createDay(inputs('2026-10-27'))
    expect(sessionsOf(snap)).toEqual({ londyn: lm('07:00'), ny: lm('13:00') })
    expect(snap.wakeMin).toBe(5 * 60)
    expect(snap.templateWakeMin).toBe(6 * 60)
    expect(nextWakeForBedtime(snap, null, [migrated()], '2026-10-27')).toBe(6 * 60)
    expect(sessionsOf(createDay(inputs('2026-11-03')))).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(createDay(inputs('2026-11-03')).wakeMin).toBe(6 * 60)
  })

  it('między 14.03 a 28.03.2027 także; 12.03 i 29.03 zwykle', () => {
    expect(sessionsOf(createDay(inputs('2027-03-15')))).toEqual({ londyn: lm('07:00'), ny: lm('13:00') })
    expect(sessionsOf(createDay(inputs('2027-03-26')))).toEqual({ londyn: lm('07:00'), ny: lm('13:00') })
    expect(sessionsOf(createDay(inputs('2027-03-29')))).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(sessionsOf(createDay(inputs('2027-03-12')))).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
  })

  it('„według czasu: Polska” – sesja zostaje o swojej godzinie także w tygodniu przesunięcia, pobudka bez zmiany', () => {
    const gpw = entry('gpw', '09:00', 60, field('Europe/Warsaw', []), 'GPW')
    const snap = createDay(inputs('2026-10-27', { templates: [template('zwykly', 'zwykly', [gpw])] }))
    expect(sessionsOf(snap)).toEqual({ gpw: lm('09:00') })
    expect(snap.wakeMin).toBe(6 * 60)
  })

  it('„według czasu: Londyn” – 14:00 czasu polskiego to 13:00 w Londynie, także po zmianie czasu w Europie', () => {
    const lse = entry('lse', '14:00', 60, field('Europe/London', ['UK']))
    const t = [template('zwykly', 'zwykly', [lse])]
    expect(sessionsOf(createDay(inputs('2026-10-21', { templates: t })))).toEqual({ lse: lm('14:00') })
    expect(sessionsOf(createDay(inputs('2026-10-27', { templates: t })))).toEqual({ lse: lm('14:00') })
  })

  it('blok „po sesji NY” idzie za sesją z szablonu; „nie” przed utworzeniem dnia i po nim zabiera sesję i blok za nią', () => {
    const full = createDay(inputs('2026-10-21'))
    const ny = full.blocks.find((b) => b.sourceId === 'ny')!
    expect(full.blocks.find((b) => b.sourceId === 'jrn')!.anchor).toBe(ny.id)
    // The anchor written as before D511 („session:<id>”) finds the template's session too.
    expect(full.blocks.find((b) => b.sourceId === 'notatki')!.anchor).toBe(full.blocks.find((b) => b.sourceId === 'londyn')!.id)
    const before = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ sessions: { ny: 'no' } }, '2026-10-21') }))
    expect(before.blocks.some((b) => b.sourceId === 'ny' || b.sourceId === 'jrn')).toBe(false)
    const after = dayPlan(full, dayFileFrom({ sessions: { ny: 'no' } }, '2026-10-21'))
    expect(after.some((b) => b.sourceId === 'ny' || b.sourceId === 'jrn')).toBe(false)
    expect(after.some((b) => b.sourceId === 'londyn')).toBe(true)
    // „tak” after a „nie” before the day was made brings the session back (from the snapshot's sessions).
    const back = dayPlan(before, dayFileFrom({ sessions: { ny: 'yes' } }, '2026-10-21')).find((b) => b.sourceId === 'ny')!
    expect(back).toMatchObject({ id: ny.id, startMin: lm('14:00'), name: 'Sesja NY', categoryId: 'sesja' })
  })

  it('kalendarz świąt: 27.11.2026 sesja do 14:00 czasu NY kończy się o zamknięciu NYSE (13:00 NY), sesja NY 3 h bez zmian', () => {
    const long = { ...NY, durationMin: 6 * 60 }
    const snap = createDay(inputs('2026-11-27', { templates: [template('zwykly', 'zwykly', [long])] }))
    expect(snap.blocks.find((b) => b.sourceId === 'ny')!.durationMin).toBe(5 * 60)
    expect(createDay(inputs('2026-11-27')).blocks.find((b) => b.sourceId === 'ny')!.durationMin).toBe(180)
    // 26.11: the USA is closed – the session stays (asked a week before), the day knows the holiday.
    const thanks = createDay(inputs('2026-11-26'))
    expect(thanks.blocks.some((b) => b.sourceId === 'ny')).toBe(true)
    expect(thanks.holidays.find((h) => h.market === 'NYSE')?.closed).toBe(true)
  })

  const morning = (date: string, templates: Template[] = [ordinary, remote], files: Record<string, DayFile> = {}): MorningInputs => ({
    date,
    changes: [migrated()],
    templates,
    lectures: [],
    series: [],
    holidays,
    files: (d) => files[d] ?? null
  })

  it('tydzień przed świętem w USA raz pyta o sesje z szablonu tego dnia; bez odpowiedzi zostają', () => {
    const q = holidayQuestions(morning('2026-11-20'))
    expect(q.map((x) => x.text)).toEqual(['26.11 święto w USA — sesja Londyn i sesja NY?'])
    expect(q[0]!.sessions.sort()).toEqual(['londyn', 'ny'])
    expect(holidayQuestions(morning('2026-11-20', undefined, { '2026-11-26': { ...emptyDayFile('2026-11-26'), asked: { holiday: 'done' } } }))).toEqual([])
  })

  it('„pytaj rano”: plan poranny pyta tylko o sesje z „pytaj” w tym dniu tygodnia, odpowiedziana już nie; bez odpowiedzi sesja zostaje', () => {
    const remoteDay = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ dayType: 'zjazd-zdalny' }, '2026-10-21') }))
    expect(sessionsOf(remoteDay)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(sessionQuestions(remoteDay, null, '2026-10-21').map((s) => s.id)).toEqual(['londyn', 'ny'])
    expect(sessionQuestions(remoteDay, { ...emptyDayFile('2026-10-21'), sessions: { ny: 'yes' } }, '2026-10-21').map((s) => s.id)).toEqual(['londyn'])
    expect(sessionQuestions(createDay(inputs('2026-10-21')), null, '2026-10-21')).toEqual([])
    // One entry with „pytaj” on the weekday, the other without: only that one is asked.
    const mixed = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [LONDON, asked(NY)])] }))
    expect(sessionQuestions(mixed, null, '2026-10-21').map((s) => s.id)).toEqual(['ny'])
  })

  it('dni wpisu (D515): „pn tak, wt pytaj, sb nie” – w poniedziałek sesja bez pytania, we wtorek pytanie, w sobotę jej nie ma', () => {
    const t = [template('zwykly', 'zwykly', [LONDON, withDays(NY, 'yes ask yes yes yes no no'), planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'ny', durationMin: 30, origin: 'template' })])]
    const on = (date: string) => createDay(inputs(date, { templates: t, dayFile: dayFileFrom({ dayType: 'zwykly' }, date) }))
    const mon = on('2026-10-19')
    expect(sessionsOf(mon)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(sessionQuestions(mon, null, '2026-10-19')).toEqual([])
    const tue = on('2026-10-20')
    expect(sessionsOf(tue)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(sessionQuestions(tue, null, '2026-10-20').map((s) => s.id)).toEqual(['ny'])
    // Saturday: no NY, no block after it; London stays (its own days).
    const sat = on('2026-10-24')
    expect(sessionsOf(sat)).toEqual({ londyn: lm('08:00') })
    expect(sat.blocks.some((b) => b.sourceId === 'jrn')).toBe(false)
    // Every entry „nie” on a weekday: the day is one without sessions (the rule of the maximum).
    const none = [template('zwykly', 'zwykly', [withDays(LONDON, 'yes yes yes yes yes no no'), withDays(NY, 'yes yes yes yes yes no no')])]
    const s = daySettings(settingsOn([migrated()], '2026-10-24'), none, 'zwykly', '2026-10-24')
    expect([s.sessions, s.dayTypes.zwykly.sessions[5]]).toEqual([[], 'no'])
  })

  it('tydzień przesunięcia zapowiedziany tydzień wcześniej z sesjami szablonów', () => {
    const n = shiftNotice(morning('2026-10-19'))!
    expect(n.from).toBe('2026-10-25')
    expect(n.starts).toEqual([
      { name: 'Londyn', at: '07:00' },
      { name: 'NY', at: '13:00' }
    ])
    expect(shiftNotice(morning('2026-10-26'))).toBeNull()
    expect(knownSessionDefs(settingsOn([migrated()], '2026-10-19'), [ordinary, remote], '2026-10-19').map((d) => d.id)).toEqual(['londyn', 'ny'])
  })

  const contextOf = (date: string, templates: Template[], dayFile: DayFile | null, at: number, events: Parameters<typeof dayContextOf>[1]['events'] = []) =>
    dayContextOf({ changes: [migrated()], templates, lectures: [], series: [], routines: [] }, { date, events, dayFile, nextFile: null }, holidays, at)

  it('sesja z szablonu w dniu z sesjami nie przesuwa maksimum; zostawiona albo dodana w dniu bez sesji – do swojego końca plus bufor', () => {
    // The template's own maximum 15:00: the day has its sessions by default – the maximum stays.
    const capped = template('zwykly', 'zwykly', [LONDON, NY], {}, '2026-01-01', 15 * 60)
    const ctx = contextOf('2026-10-21', [capped], null, placeLogical('2026-10-21', 7 * 60))
    const st = computeDay(ctx)
    expect(logicalMinuteOf('2026-10-21', st.grid.start + st.boundary.max * 60_000)).toBe(15 * 60)
    // A Saturday (weekend without sessions) with the NY session added for the day: the maximum 16:00 moves to 17:15.
    const ny = createDay(inputs('2026-10-21')).blocks.find((b) => b.sourceId === 'ny')!
    const satNy = { ...ny, id: derivedId('2026-10-24', 'ses', 'ny') }
    const sat = contextOf('2026-10-24', [ordinary], { ...emptyDayFile('2026-10-24'), sessions: { ny: 'yes' }, blocks: [satNy] }, placeLogical('2026-10-24', 8 * 60))
    const s2 = computeDay(sat)
    expect(logicalMinuteOf('2026-10-24', s2.grid.start + s2.boundary.max * 60_000)).toBe(17 * 60 + 15)
  })

  it('prognoza liczy sesję z szablonu jej typową długością (mediana po id sesji), bez niej – całym oknem', () => {
    const t = [template('zwykly', 'zwykly', [NY])]
    const at = placeLogical('2026-10-21', 7 * 60)
    const window = computeDay(contextOf('2026-10-21', t, null, at))
    const typical = computeDay({ ...contextOf('2026-10-21', t, null, at), typicalSessionMin: { ny: 120 } })
    const end = (s: typeof window) => logicalMinuteOf('2026-10-21', s.grid.start + s.forecastWorkEnd! * 60_000)
    expect(end(window)).toBe(17 * 60)
    expect(end(typical)).toBe(16 * 60)
  })

  it('zmiana typu na dzień z sesjami: brakujące sesje z jego szablonu („pytaj rano” niezaznaczone) trafiają do pliku dnia; „nie” je zabiera', () => {
    const date = '2026-10-24'
    const at = placeLogical(date, 9 * 60)
    const ctx = contextOf(date, [ordinary, remote], null, at)
    const state = computeDay(ctx)
    const settingsTo = (to: 'zwykly' | 'zjazd-zdalny') => daySettings(settingsOn([migrated()], date, at), [ordinary, remote], to, date)
    const p = planTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: settingsTo('zwykly'), withAdd: true })
    expect(p.add.map((a) => [a.session, a.checked, logicalMinuteOf(date, placeLogical(date, a.block.startMin!))])).toEqual([
      ['londyn', true, lm('08:00')],
      ['ny', true, lm('14:00')]
    ])
    const r = applyTypeChange({ ctx, state, energyNow: null, to: 'zwykly', settings: settingsTo('zwykly') }, p, { park: [], cancel: [], returnRequests: [], add: p.add.map((a) => a.block.id) })
    // The weekend's snapshot has no sessions to bring them back by „tak”: the blocks go into the day's file.
    expect(r.blocks.map((b) => [b.sourceId, b.origin, b.name])).toEqual([
      ['londyn', 'session', 'Sesja Londyn'],
      ['ny', 'session', 'Sesja NY']
    ])
    expect(r.sessionsYes.sort()).toEqual(['londyn', 'ny'])
    const file: DayFile = { ...emptyDayFile(date), sessions: { londyn: 'yes', ny: 'yes' }, blocks: r.blocks }
    expect(dayPlan(ctx.snapshot, file).filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
    expect(dayPlan(ctx.snapshot, { ...file, sessions: { londyn: 'yes', ny: 'no' } }).filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['londyn'])
    const remoteAdd = planTypeChange({ ctx, state, energyNow: null, to: 'zjazd-zdalny', settings: settingsTo('zjazd-zdalny'), withAdd: true })
    expect(remoteAdd.add.map((a) => [a.session, a.checked])).toEqual([
      ['londyn', false],
      ['ny', false]
    ])
  })

  it('dzień sprzed zmiany liczy się z warstwy sesji ustawień jak dawniej; od dnia zmiany – z szablonu, z tymi samymi identyfikatorami', () => {
    const tpl: Template = { ...ordinary, versions: [{ from: '2026-01-01', budgetMin: null, maxMin: null, blocks: [planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' })] }, { ...ordinary.versions[0]!, from: '2026-11-15' }] }
    const inp = (date: string) => inputs(date, { changes: [migrated('2026-11-15')], templates: [tpl] })
    const past = createDay(inp('2026-11-13'))
    expect(past.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.name])).toEqual([
      [derivedId('2026-11-13', 'ses', 'londyn'), null],
      [derivedId('2026-11-13', 'ses', 'ny'), null]
    ])
    expect(past.settings.sessions.map((s) => s.id)).toEqual(['londyn', 'ny'])
    const next = createDay(inp('2026-11-16'))
    expect(next.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.name])).toEqual([
      [derivedId('2026-11-16', 'ses', 'londyn'), 'Sesja Londyn'],
      [derivedId('2026-11-16', 'ses', 'ny'), 'Sesja NY']
    ])
  })

  it('pole „według czasu” odczytane z pliku: nieznana strefa albo pole bez strefy – blok bez reguł sesji', () => {
    const raw = { id: 'x', categoryId: 'sesja', startMin: lm('14:00'), durationMin: 60, fixed: true }
    expect(planBlockFrom({ ...raw, session: { zone: NY_ZONE, markets: ['NYSE', 'XX'], days: ['yes', 'ask', 'no', 'x', 'yes', 'no', 'no'] } })!.session).toEqual({ zone: NY_ZONE, markets: ['NYSE'], days: ['yes', 'ask', 'no', 'yes', 'yes', 'no', 'no'] })
    // No days (or not seven) – „tak” every day; the „pytaj rano” of a working build before D515 – „pytaj” every day; the session's own id.
    expect(planBlockFrom({ ...raw, session: { zone: NY_ZONE, markets: [], days: ['no'] } })!.session!.days).toEqual(YES7)
    expect(planBlockFrom({ ...raw, session: { zone: NY_ZONE, ask: true, markets: [] } })!.session!.days).toEqual(YES7.map(() => 'ask'))
    expect(planBlockFrom({ ...raw, session: { zone: NY_ZONE, markets: [], days: YES7, id: 'ny' } })!.session).toEqual({ zone: NY_ZONE, markets: [], days: YES7, id: 'ny' })
    expect(planBlockFrom({ ...raw, session: { zone: 'Mars/Olympus', markets: [] } })!.session).toBeUndefined()
    expect(planBlockFrom({ ...raw, session: 'tak' })!.session).toBeUndefined()
    expect(planBlockFrom(raw)!).not.toHaveProperty('session')
    // One rule (T1416): a block with the field is a session whatever its category – it keeps its category on the day.
    const odd = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [{ ...NY, categoryId: 'analiza' }])] }))
    expect(odd.blocks.map((b) => [b.origin, b.categoryId, b.sourceId])).toEqual([['session', 'analiza', 'ny']])
    // No category of the kind „sesja” at all: the entries stay sessions.
    const noKind = { id: 'bez', from: '2026-01-01', at: null, made: 2, patch: { categories: { sesja: { kind: 'other' } } } }
    expect(settingsOn([migrated(), noKind], '2026-10-21').categories.sesja!.kind).toBe('other')
    const day = createDay(inputs('2026-10-21', { changes: [migrated(), noKind] }))
    expect(day.blocks.filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
  })

  it('migawka dnia: sesja niesie tylko pola bloku, które bierze blok dnia; bez warstwy przeniesienia, z nazwami jej sesji (T1419, T1454)', () => {
    const noted = { ...NY, note: 'n'.repeat(500), requests: ['r1'] }
    const change = { ...migrated('2026-10-19'), patch: { ...migrated().patch, movedSessions: DEFAULT_SETTINGS.sessions, movedLayer: { from: '2026-10-19', sessions: DEFAULT_SETTINGS.sessions, grid: {}, templates: [], made: {} } } }
    const snap = createDay(inputs('2026-10-21', { changes: [change], templates: [template('zwykly', 'zwykly', [noted])] }))
    // The layer the move took – not in the snapshot; the names of its sessions stay (they name a block of the layer, T1454).
    expect([snap.settings.movedLayer, snap.settings.movedSessions.map((d) => d.id)]).toEqual([null, ['londyn', 'ny']])
    const block = snap.settings.sessions.find((d) => d.id === 'ny')!.block as Record<string, unknown>
    expect(Object.keys(block).sort()).toEqual(['background', 'bgCostPct', 'categoryId', 'costs', 'name', 'note', 'routine', 'steps', 'variantId'])
    // The day's block from it: as before, the entry's note and name – not its requests.
    expect(snap.blocks.find((b) => b.sourceId === 'ny')).toMatchObject({ note: 'n'.repeat(500), name: 'Sesja NY', requests: [] })
    // A snapshot read again (new objects) gives the same block.
    const again = JSON.parse(JSON.stringify(snap))
    expect(dayPlan(again, null).find((b) => b.sourceId === 'ny')).toEqual(dayPlan(snap, null).find((b) => b.sourceId === 'ny'))
  })

  it('dwa wpisy o tym samym id sesji w jednej wersji: jeden blok dnia – pierwszy wpis; nowa sesja w szablonie nie bierze zajętego id', () => {
    const twin = { ...NY, id: 'ny-2', startMin: lm('16:00'), session: { ...NY.session!, id: 'ny' } }
    const snap = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [NY, twin])] }))
    expect(snap.blocks.filter((b) => b.id === sessionBlockId('2026-10-21', 'ny')).map((b) => b.startMin)).toEqual([lm('14:00')])
    expect(snap.blocks.some((b) => b.sourceId === 'ny-2')).toBe(false)
    // A block given the category of sessions whose id another entry has as its session's: a session's id of its own.
    const plain = planBlock({ id: 'gpw', categoryId: 'inne', startMin: lm('09:00'), durationMin: 60, origin: 'template' })
    const taken = { ...NY, id: 'x', session: { ...NY.session!, id: 'gpw' } }
    expect(templateBlockPatch(plain, { categoryId: 'sesja' }, DEFAULT_SETTINGS.categories, [taken, plain]).session).toMatchObject({ id: 'gpw-2' })
    expect(templateBlockPatch(plain, { categoryId: 'sesja' }, DEFAULT_SETTINGS.categories, [plain]).session).not.toHaveProperty('id')
  })
  /** A change of the day's type as the log has it (its settings with the new type's sessions). */
  const typeEvent = (date: string, at: number, to: Template['dayType'], templates: Template[]) =>
    ({ id: `typ-${at}`, c: 'pca', n: 1, t: at, l: at, v: RULES_VERSION, day: date, dom: 'timer', k: 'day.snapshot', at, dayType: to, settings: daySettings(settingsOn([migrated()], date, at), templates, to, date), reason: 'type', max: null, minRegen: null }) as unknown as Parameters<typeof dayContextOf>[1]['events'][number]
  const approveEvent = (date: string, at: number, boundary: number) => ({ id: `gr-${at}`, c: 'pca', n: 2, t: at, l: at, v: RULES_VERSION, day: date, dom: 'timer', k: 'boundary.approve', at, boundary, auto: false }) as unknown as Parameters<typeof dayContextOf>[1]['events'][number]
  const typeInput = (date: string, templates: Template[], to: Template['dayType'], at: number, dayFile: DayFile | null, events: Parameters<typeof dayContextOf>[1]['events'] = []) => {
    const ctx = contextOf(date, templates, dayFile, at, events)
    return { ctx, state: computeDay(ctx), energyNow: null, to, settings: daySettings(settingsOn([migrated()], date, at), templates, to, date), dayFile }
  }
  const none = { park: [], cancel: [], returnRequests: [], add: [] }

  it('zmiana typu: sesja w planie (po id) nie „brakuje”; inne miejsce w szablonie nowego typu – godzina, długość i kategoria z niego, Twoje zmiany zostają', () => {
    const date = '2026-10-21'
    const at = placeLogical(date, 9 * 60)
    const id = sessionBlockId(date, 'ny')
    // The day's NY renamed with a note of yours today; the „zjazd stacjonarny” has NY at 15:00 under another name.
    const mine = { ...createDay(inputs(date)).blocks.find((b) => b.id === id)!, name: 'Moja NY', note: 'wykres' }
    const file: DayFile = { ...emptyDayFile(date), blocks: [mine] }
    const later = template('stacj', 'zjazd-stacjonarny', [{ ...LONDON }, { ...NY, startMin: lm('15:00'), name: 'Sesja NY stacjonarna' }])
    const inp = typeInput(date, [ordinary, later], 'zjazd-stacjonarny', at, file)
    const p = planTypeChange(inp)
    expect(p.laterMax).toBe(true)
    expect(p.add.filter((a) => a.session)).toEqual([])
    const r = applyTypeChange(inp, p, none)
    expect(r.blocks.map((b) => [b.id, b.startMin, b.durationMin, b.categoryId, b.name, b.note])).toEqual([[id, lm('15:00'), 180, 'sesja', 'Moja NY', 'wykres']])
    expect(r.drop).toEqual([])
    // „Odwołaj” of it in the window: it is cancelled, not moved.
    const c = applyTypeChange(inp, p, { ...none, cancel: [id] })
    expect([c.blocks, c.events.filter((e) => e.k === 'block.cancel').map((e) => e.block)]).toEqual([[], [id]])
  })

  it('dzień aktualizacji: sesja z warstwy (bez nazwy) i wpis „Sesja NY” w tym samym miejscu – bez „brakuje” i bez zmiany', () => {
    const date = '2026-10-21'
    const at = placeLogical(date, 9 * 60)
    // The day made by the layer (before the move): its sessions without a block of a template.
    const layerDay = dayContextOf({ changes: [], templates: [], lectures: [], series: [], routines: [] }, { date, events: [], dayFile: null, nextFile: null }, holidays, at)
    expect(layerDay.plan.find((b) => b.sourceId === 'ny')!.name).toBeNull()
    const inp = { ctx: layerDay, state: computeDay(layerDay), energyNow: null, to: 'zwykly' as const, settings: daySettings(settingsOn([migrated()], date, at), [ordinary], 'zwykly', date), withAdd: true, dayFile: null }
    const p = planTypeChange(inp)
    expect(p.add.filter((a) => a.session)).toEqual([])
    expect(applyTypeChange(inp, p, none).blocks).toEqual([])
  })

  it('granica przy zmianie typu liczy przeniesioną sesję raz – jak dzień, który miał ją tam od rana', () => {
    const date = '2026-10-21'
    const at = placeLogical(date, 9 * 60)
    const later = template('stacj', 'zjazd-stacjonarny', [{ ...NY, startMin: lm('10:00') }])
    const id = sessionBlockId(date, 'ny')
    const ev = [approveEvent(date, at - 3_600_000, placeLogical(date, 17 * 60 + 15))]
    // NY 14:00 the snapshot's, moved by the change to 10:00 …
    const moved = typeInput(date, [ordinary, later], 'zjazd-stacjonarny', at, null, ev)
    const a = applyTypeChange(moved, planTypeChange(moved), none)
    expect(a.blocks.map((b) => [b.id, b.startMin])).toEqual([[id, lm('10:00')]])
    // … and NY at 10:00 from the morning (the day's file) – the same day after the change: the same boundary.
    const at10 = { ...createDay(inputs(date)).blocks.find((b) => b.id === id)!, startMin: lm('10:00') }
    const ordinary10 = template('zwykly', 'zwykly', ordinary.versions[0]!.blocks.map((x) => (x.id === 'ny' ? { ...x, startMin: lm('10:00') } : x)))
    const asIf = typeInput(date, [ordinary10, later], 'zjazd-stacjonarny', at, { ...emptyDayFile(date), blocks: [at10] }, ev)
    const b = applyTypeChange(asIf, planTypeChange(asIf), none)
    expect(b.blocks).toEqual([])
    expect(a.boundary).not.toBeNull()
    expect(a.boundary).toEqual(b.boundary)
  })

  it('powrót do typu z wcześniejszym maksimum: sesja zamieniona przy pierwszej zmianie wraca do szablonu nowego typu; nowy typ bez niej – wychodzi z pliku dnia', () => {
    const date = '2026-10-21'
    const id = sessionBlockId(date, 'ny')
    const later = template('stacj', 'zjazd-stacjonarny', [{ ...NY, startMin: lm('15:00') }])
    const templates = [ordinary, later]
    // 09:00 the change to the „zjazd stacjonarny”: NY moves to 15:00 (into the day's file).
    const first = typeInput(date, templates, 'zjazd-stacjonarny', placeLogical(date, 9 * 60), null)
    const r1 = applyTypeChange(first, planTypeChange(first), none)
    const file: DayFile = { ...emptyDayFile(date), blocks: r1.blocks }
    const ev = [typeEvent(date, placeLogical(date, 9 * 60), 'zjazd-stacjonarny', templates)]
    // 10:00 back to the ordinary day (an earlier maximum): NY back at 14:00.
    const back = typeInput(date, templates, 'zwykly', placeLogical(date, 10 * 60), file, ev)
    const p = planTypeChange(back)
    expect(p.laterMax).toBe(false)
    expect(applyTypeChange(back, p, none).blocks.map((b) => [b.id, b.startMin])).toEqual([[id, lm('14:00')]])
    // 10:00 to the weekend (no NY): out of the day's file – the day has the morning's NY again (keep or cancel in the window).
    const weekend = typeInput(date, templates, 'weekend', placeLogical(date, 10 * 60), file, ev)
    const w = applyTypeChange(weekend, planTypeChange(weekend), none)
    expect([w.blocks, w.drop]).toEqual([[], [id]])
    expect(dayPlan(weekend.ctx.snapshot, { ...file, blocks: [] }).find((b) => b.id === id)!.startMin).toBe(lm('14:00'))
  })

  it('zmiana typu na typ bez sesji: Twoja zmiana sesji z rana zostaje; blok ze zmiany typu wraca na miejsce z rana (z Twoją notatką), bez zmian – wychodzi z pliku', () => {
    const date = '2026-10-21'
    const id = sessionBlockId(date, 'ny')
    const at = placeLogical(date, 10 * 60)
    const morningNy = createDay(inputs(date)).blocks.find((b) => b.id === id)!
    // Your note on the morning's NY (the day's file, no mark): to the weekend – it stays as you left it.
    const yours = typeInput(date, [ordinary], 'weekend', at, { ...emptyDayFile(date), blocks: [{ ...morningNy, note: 'moje' }] })
    const r = applyTypeChange(yours, planTypeChange(yours), none)
    expect([r.blocks, r.drop]).toEqual([[], []])
    // NY put at 15:00 by a change to the „zjazd stacjonarny” at 09:00, your note added since: back at 14:00 with the note.
    const later = template('stacj', 'zjazd-stacjonarny', [{ ...NY, startMin: lm('15:00') }])
    const ev = [typeEvent(date, placeLogical(date, 9 * 60), 'zjazd-stacjonarny', [ordinary, later])]
    const put = { ...morningNy, startMin: lm('15:00'), byType: 'zjazd-stacjonarny' as const }
    const noted = typeInput(date, [ordinary, later], 'weekend', at, { ...emptyDayFile(date), blocks: [{ ...put, note: 'moje' }] }, ev)
    const back = applyTypeChange(noted, planTypeChange(noted), none)
    expect(back.drop).toEqual([])
    expect(back.blocks.map((b) => [b.id, b.startMin, b.note, b.byType ?? null])).toEqual([[id, lm('14:00'), 'moje', null]])
    // Without a change of yours: out of the file – the morning's NY again.
    const plain = typeInput(date, [ordinary, later], 'weekend', at, { ...emptyDayFile(date), blocks: [put] }, ev)
    const out = applyTypeChange(plain, planTypeChange(plain), none)
    expect([out.blocks, out.drop]).toEqual([[], [id]])
  })

  it('zmiana typu: nowe miejsce sesji już minęło – sesja zostaje, gdzie była (bez niezaczętego stałego bloku po czasie)', () => {
    const date = '2026-10-21'
    const early = template('stacj', 'zjazd-stacjonarny', [{ ...NY, startMin: lm('08:00'), durationMin: 60 }])
    const inp = typeInput(date, [ordinary, early], 'zjazd-stacjonarny', placeLogical(date, 10 * 60), null)
    const r = applyTypeChange(inp, planTypeChange(inp), none)
    expect(r.blocks.filter((b) => b.origin === 'session')).toEqual([])
    expect(inp.ctx.plan.find((b) => b.id === sessionBlockId(date, 'ny'))!.startMin).toBe(lm('14:00'))
  })

  it('zmiana typu: sesja z odpowiedzi „tak” w dniu bez sesji (warstwa „nie”) przechodzi na miejsce z szablonu nowego typu', () => {
    const date = '2026-10-24'
    const at = placeLogical(date, 9 * 60)
    // A Saturday made by the layer (the weekend „nie”), NY answered „tak”: 14:00.
    const file: DayFile = { ...emptyDayFile(date), sessions: { ny: 'yes' } }
    const ctx = dayContextOf({ changes: [], templates: [], lectures: [], series: [], routines: [] }, { date, events: [], dayFile: file, nextFile: null }, holidays, at)
    expect(ctx.plan.find((b) => b.sourceId === 'ny')!.startMin).toBe(lm('14:00'))
    const ordinary15 = template('zwykly', 'zwykly', [LONDON, { ...NY, startMin: lm('15:00') }])
    const inp = { ctx, state: computeDay(ctx), energyNow: null, to: 'zwykly' as const, settings: daySettings(settingsOn([migrated()], date, at), [ordinary15], 'zwykly', date), dayFile: file }
    const r = applyTypeChange(inp, planTypeChange(inp), none)
    expect(r.blocks.filter((b) => b.sourceId === 'ny').map((b) => [b.id, b.startMin, b.byType])).toEqual([[sessionBlockId(date, 'ny'), lm('15:00'), 'zwykly']])
  })

  it('dwa wpisy jednej sesji: usunięcie jednego nie zabiera załączników dni, póki wersja dalej daje tę sesję (T1457)', () => {
    const twin = { ...NY, id: 'ny-2', session: { ...NY.session!, id: 'ny' } }
    const tpl = template('zwykly', 'zwykly', [NY, twin])
    const without = { ...tpl, versions: [...tpl.versions, { from: '2026-10-22', budgetMin: null, maxMin: null, blocks: [twin] }] }
    const thu = '2026-10-29'
    const a = { id: 'a', owner: { scope: 'day', date: thu, blockId: sessionBlockId(thu, 'ny') }, removedAt: null } as unknown as Attachment
    expect(templateRemovalIds([a], 'zwykly', tpl, without, '2026-10-22', () => true)).toEqual([])
    // Both out: the session is gone – its attachment goes.
    const none2 = { ...tpl, versions: [...tpl.versions, { from: '2026-10-22', budgetMin: null, maxMin: null, blocks: [] }] }
    expect(templateRemovalIds([a], 'zwykly', tpl, none2, '2026-10-22', () => true)).toEqual(['a'])
  })

  it('kopia bloku Ctrl + przeciągnięciem (D513): wpis sesji – osobna sesja (bez id sesji oryginału), blok ze zmiany typu – bez znacznika (T1461)', () => {
    const entry = { ...NY, id: 'ny-sesja', session: { ...NY.session!, id: 'ny' } }
    const copy = copiedBlock(entry, lm('16:00'), { id: 'kopia', origin: 'template' })
    expect([copy.id, copy.session]).toEqual(['kopia', { zone: NY_ZONE, markets: ['NYSE', 'CME_FX'], days: YES7 }])
    // In the version with its original: two sessions, each once on the day.
    const snap = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [entry, copy])] }))
    expect(snap.blocks.filter((b) => b.origin === 'session').map((b) => [b.sourceId, b.startMin])).toEqual([
      ['ny', lm('14:00')],
      ['kopia', lm('16:00')]
    ])
    const placed = { ...snap.blocks.find((b) => b.sourceId === 'ny')!, byType: 'zjazd-stacjonarny' as const }
    expect(copiedBlock(placed, lm('18:00'))).not.toHaveProperty('byType')
  })

  it('załączniki wpisu sesji: blok sesji dnia widzi wpis szablonu, który daje mu sesję tego dnia – po zmianie typu nowego typu', () => {
    const date = '2026-10-21'
    const ny = createDay(inputs(date)).blocks.find((b) => b.sourceId === 'ny')!
    const place = (type: string | null) => ({ scope: 'day' as const, date, templateId: 'zwykly', templateIds: ['zwykly', 'zdalny'], sessions: sessionOwnersOf([ordinary, remote], type, 'zwykly', date) })
    expect(ownersOf(ny, place('zwykly'))).toEqual([
      { scope: 'day', date, blockId: ny.id },
      { scope: 'template', templateId: 'zwykly', blockId: 'ny' }
    ])
    // The day changed to a remote „zjazd”: the remote template's entry (the same session, another template).
    expect(ownersOf(ny, place('zjazd-zdalny'))[1]).toEqual({ scope: 'template', templateId: 'zdalny', blockId: 'ny' })
    // A type whose template has no NY (the weekend has none): the entry of the snapshot's template.
    expect(ownersOf(ny, place('weekend'))[1]).toEqual({ scope: 'template', templateId: 'zwykly', blockId: 'ny' })
    // The entry „nie” on that weekday: not its session that day.
    expect(sessionOwnersOf([template('zwykly', 'zwykly', [withDays(NY, 'yes yes no yes yes no no')])], 'zwykly', 'zwykly', date)).toEqual({})
    // A session without an entry (of the layer): only its own.
    expect(ownersOf(ny, { scope: 'day', date, templateId: 'zwykly' })).toEqual([{ scope: 'day', date, blockId: ny.id }])
  })

  it('usunięcie wpisu sesji zabiera załączniki dni tylko w dniach, które ten szablon robi (typ dnia) i w których daje sesję', () => {
    // The ordinary day's default template, NY „nie” on Saturdays; taken out from 22.10.
    const tpl = template('zwykly', 'zwykly', [withDays(NY, 'yes yes yes yes yes no no')])
    const without = { ...tpl, versions: [...tpl.versions, { from: '2026-10-22', budgetMin: null, maxMin: null, blocks: [] }] }
    const own = (id: string, d: string) => ({ id, owner: { scope: 'day', date: d, blockId: sessionBlockId(d, 'ny') }, removedAt: null }) as unknown as Attachment
    // Thursday – an ordinary day; Friday – a remote „zjazd” by its file (another template); Saturday – ordinary by its file, „nie”.
    const [thu, fri, sat] = ['2026-10-29', '2026-10-30', '2026-10-31']
    const list = [own('a-thu', thu), own('a-fri', fri), own('a-sat', sat), own('a-past', '2026-10-20')]
    expect(sessionAttachmentDates(list, tpl, '2026-10-22')).toEqual([thu, fri, sat])
    // What the window says of each day from its file and `templateFor` (`templateActions.makesDays`).
    const makes = (d: string) => d !== fri
    expect(templateRemovalIds(list, 'zwykly', tpl, without, '2026-10-22', makes)).toEqual(['a-thu'])
    expect(templateRemovalIds(list, 'zwykly', tpl, null, '2026-10-22', makes)).toEqual(['a-thu'])
    // Days whose type is not known (a file not read): nothing goes.
    expect(templateRemovalIds(list, 'zwykly', tpl, without, '2026-10-22')).toEqual([])
  })

  it('kopia szablonu: wpis z nowym id bloku zostaje tą samą sesją (jej id w polu), blok „po sesji” idzie za nią; kopia nie jest „przeniesiona”', () => {
    const c = copiedTemplate({ ...ordinary, sessionsMoved: '2026-10-19' }, 'kopia', 'Kopia')
    expect(c.sessionsMoved).toBeUndefined()
    const entry = c.versions[0]!.blocks.find((b) => b.session?.id === 'ny')!
    expect(entry.id).not.toBe('ny')
    const date = '2026-10-21'
    const snap = createDay(inputs(date, { templates: [{ ...c, archived: false }] }))
    expect(sessionsOf(snap)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(snap.blocks.filter((b) => b.categoryId === 'journaling').map((b) => b.anchor).sort()).toEqual([sessionBlockId(date, 'londyn'), sessionBlockId(date, 'ny')].sort())
  })

  it('sesja dopisana do warstwy po przeniesieniu (starsza wersja) w dniu „nie”: dzień z sesjami szablonu dalej ma je „domyślnie” – maksimum się nie przesuwa', () => {
    const extra = { id: 'x', name: 'X', zone: NY_ZONE, startMin: 600, endMin: 660, markets: ['NYSE' as const] }
    const changes = [migrated(), { id: 'starsza', from: '2026-10-20', at: null, made: 9, patch: { sessions: [extra] } }]
    const capped = template('zwykly', 'zwykly', [LONDON, NY], {}, '2026-01-01', 15 * 60)
    const s = daySettings(settingsOn(changes, '2026-10-21'), [capped], 'zwykly', '2026-10-21')
    expect(s.dayTypes.zwykly.sessions[2]).toBe('yes')
    expect(s.sessions.map((d) => d.id)).toEqual(['londyn', 'ny'])
    const ctx = dayContextOf({ changes, templates: [capped], lectures: [], series: [], routines: [] }, { date: '2026-10-21', events: [], dayFile: null, nextFile: null }, holidays, placeLogical('2026-10-21', 7 * 60))
    const st = computeDay(ctx)
    expect(logicalMinuteOf('2026-10-21', st.grid.start + st.boundary.max * 60_000)).toBe(15 * 60)
  })

  it('w dniu przeniesienia sesja warstwy ustawień (migawka sprzed zmiany) nazywa się dalej „Sesja NY” w każdym widoku', () => {
    const change = { ...migrated('2026-10-21'), patch: { ...migrated().patch, movedSessions: DEFAULT_SETTINGS.sessions } }
    const names = { rd: rdFrom(undefined), settings: settingsOn([change], '2026-10-21'), routines: [], requests: [] }
    expect(names.settings.sessions).toEqual([])
    const old = planBlock({ id: sessionBlockId('2026-10-21', 'ny'), categoryId: 'sesja', startMin: lm('14:00'), durationMin: 180, fixed: true, origin: 'session', sourceId: 'ny' })
    expect(blockName(old, names)).toBe('Sesja NY')
  })
})
