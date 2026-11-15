/**
 * Sessions as entries of the templates of day types (D511): every example of „Sesje tradingowe” with the session taken
 * from the template – placed from its zone („według czasu”), an hour earlier in the weeks the clocks of the USA and Europe
 * disagree (the wake too), shortened by an early close, asked about a week before a holiday in the USA and in the morning
 * with „pytaj rano”, moving the maximum on a day without sessions, counted by its typical length, followed by „po sesji
 * NY”; a change of type brings the sessions of the new type's template. A day before the change keeps the layer of
 * sessions of the settings.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf } from '@shared/engine/context'
import { createDay, dayPlan, nextWakeForBedtime } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { holidayQuestions, sessionQuestions, shiftNotice, type MorningInputs } from '@shared/engine/morning'
import { applyTypeChange, planTypeChange } from '@shared/engine/typeChange'
import { derivedId } from '@shared/model/ids'
import { dayFileFrom, emptyDayFile, planBlock, planBlockFrom, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { DAY_TYPES, NY_ZONE, settingsOn, type SettingsChange } from '@shared/model/settings'
import { daySettings, knownSessionDefs } from '@shared/model/templateSessions'
import { logicalMinuteOf, placeLogical } from '@shared/time/day'
import { lm } from './dsl'
import { blockName } from '@shared/blockName'
import { sessionBlockId } from '@shared/engine/createDay'
import { ownersOf, templateRemovalIds, type Attachment } from '@shared/model/attachment'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)
const NO7 = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
/** The settings after the change of D511: the layer of sessions empty, every type „nie” (as the migration writes it). */
const migrated = (from = '2026-01-01'): SettingsChange => ({ id: 'sesje-w-szablonach', from, at: null, made: null, patch: { sessions: [], dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])) } })

const entry = (id: string, at: string, min: number, session: PlanBlock['session'], name: string | null = null): PlanBlock =>
  planBlock({ id, categoryId: 'sesja', startMin: lm(at), durationMin: min, fixed: true, origin: 'template', name, session })
const NY = entry('ny', '14:00', 180, { zone: NY_ZONE, ask: false, markets: ['NYSE', 'CME_FX'] }, 'Sesja NY')
const LONDON = entry('londyn', '08:00', 180, { zone: NY_ZONE, ask: false, markets: ['UK'] }, 'Sesja Londyn')
const asked = (b: PlanBlock): PlanBlock => ({ ...b, session: { ...b.session!, ask: true } })

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
    const gpw = entry('gpw', '09:00', 60, { zone: 'Europe/Warsaw', ask: false, markets: [] }, 'GPW')
    const snap = createDay(inputs('2026-10-27', { templates: [template('zwykly', 'zwykly', [gpw])] }))
    expect(sessionsOf(snap)).toEqual({ gpw: lm('09:00') })
    expect(snap.wakeMin).toBe(6 * 60)
  })

  it('„według czasu: Londyn” – 14:00 czasu polskiego to 13:00 w Londynie, także po zmianie czasu w Europie', () => {
    const lse = entry('lse', '14:00', 60, { zone: 'Europe/London', ask: false, markets: ['UK'] })
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

  it('„pytaj rano”: plan poranny pyta tylko o sesje z tą opcją, odpowiedziana już nie; bez odpowiedzi sesja zostaje', () => {
    const remoteDay = createDay(inputs('2026-10-21', { dayFile: dayFileFrom({ dayType: 'zjazd-zdalny' }, '2026-10-21') }))
    expect(sessionsOf(remoteDay)).toEqual({ londyn: lm('08:00'), ny: lm('14:00') })
    expect(sessionQuestions(remoteDay, null, '2026-10-21').map((s) => s.id)).toEqual(['londyn', 'ny'])
    expect(sessionQuestions(remoteDay, { ...emptyDayFile('2026-10-21'), sessions: { ny: 'yes' } }, '2026-10-21').map((s) => s.id)).toEqual(['londyn'])
    expect(sessionQuestions(createDay(inputs('2026-10-21')), null, '2026-10-21')).toEqual([])
    // One entry with „pytaj rano”, the other without: only that one is asked.
    const mixed = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [LONDON, asked(NY)])] }))
    expect(sessionQuestions(mixed, null, '2026-10-21').map((s) => s.id)).toEqual(['ny'])
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
    dayContextOf({ changes: [migrated()], templates, lectures: [], series: [] }, { date, events, dayFile, nextFile: null }, holidays, at)

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
    expect(planBlockFrom({ ...raw, session: { zone: NY_ZONE, ask: true, markets: ['NYSE', 'XX'] } })!.session).toEqual({ zone: NY_ZONE, ask: true, markets: ['NYSE'] })
    expect(planBlockFrom({ ...raw, session: { zone: 'Mars/Olympus', ask: false, markets: [] } })!.session).toBeUndefined()
    expect(planBlockFrom({ ...raw, session: 'tak' })!.session).toBeUndefined()
    expect(planBlockFrom(raw)!).not.toHaveProperty('session')
    // A block with the field but not of a category of sessions is an ordinary block of the template.
    const odd = createDay(inputs('2026-10-21', { templates: [template('zwykly', 'zwykly', [{ ...NY, categoryId: 'analiza' }])] }))
    expect(odd.blocks.map((b) => [b.origin, b.categoryId])).toEqual([['template', 'analiza']])
  })
  it('zmiana typu na szablon, w którym sesja o tym samym id stoi o innej godzinie albo z inną nazwą: sesja z nowego szablonu', () => {
    const date = '2026-10-21'
    const at = placeLogical(date, 9 * 60)
    const ny15 = { ...asked(NY), startMin: lm('15:00'), name: 'Sesja NY zdalna' }
    const remote15 = template('zdalny', 'zjazd-zdalny', [asked(LONDON), ny15])
    const ctx = contextOf(date, [ordinary, remote15], null, at)
    const state = computeDay(ctx)
    const settings = daySettings(settingsOn([migrated()], date, at), [ordinary, remote15], 'zjazd-zdalny', date)
    const p = planTypeChange({ ctx, state, energyNow: null, to: 'zjazd-zdalny', settings, withAdd: true })
    // London is the very same block – it stays; NY of the new template is another block (15:00, its name).
    expect(p.add.map((a) => [a.session, a.block.startMin, a.block.name])).toEqual([['ny', lm('15:00'), 'Sesja NY zdalna']])
    const r = applyTypeChange({ ctx, state, energyNow: null, to: 'zjazd-zdalny', settings }, p, { park: [], cancel: [sessionBlockId(date, 'ny')], returnRequests: [], add: p.add.map((a) => a.block.id) })
    // Into the day's file (the old snapshot would bring the old NY back by „tak”), never cancelled by the old one's „Odwołaj”.
    expect(r.blocks.map((b) => [b.id, b.startMin])).toEqual([[sessionBlockId(date, 'ny'), lm('15:00')]])
    expect(r.events.some((e) => e.k === 'block.cancel')).toBe(false)
    const plan = dayPlan(ctx.snapshot, { ...emptyDayFile(date), sessions: { ny: 'yes' }, blocks: r.blocks })
    expect(plan.find((b) => b.sourceId === 'ny')).toMatchObject({ startMin: lm('15:00'), name: 'Sesja NY zdalna' })
  })

  it('załączniki wpisu sesji: blok sesji dnia je widzi; usunięcie wpisu zabiera załączniki jego dni, nie dni innego szablonu', () => {
    const date = '2026-10-21'
    const ny = createDay(inputs(date)).blocks.find((b) => b.sourceId === 'ny')!
    expect(ownersOf(ny, { scope: 'day', date, templateId: 'zwykly', templateIds: ['zwykly', 'zdalny'] })).toEqual([
      { scope: 'day', date, blockId: ny.id },
      { scope: 'template', templateId: 'zwykly', blockId: 'ny' }
    ])
    // A Tuesday template's NY taken out from tomorrow: its Tuesday's attachment goes, a Thursday's (another template) stays.
    const tuesday = template('wtorek', 'zwykly', [NY], { weekdays: [2] })
    const without = { ...tuesday, versions: [...tuesday.versions, { from: '2026-10-22', budgetMin: null, maxMin: null, blocks: [] }] }
    const tue = '2026-10-27'
    const thu = '2026-10-29'
    const own = (id: string, d: string) => ({ id, owner: { scope: 'day', date: d, blockId: sessionBlockId(d, 'ny') }, removedAt: null }) as unknown as Attachment
    expect(templateRemovalIds([own('a1', tue), own('a2', thu)], 'wtorek', tuesday, without, '2026-10-22')).toEqual(['a1'])
  })

  it('sesja dopisana do warstwy po przeniesieniu (starsza wersja) w dniu „nie”: dzień z sesjami szablonu dalej ma je „domyślnie” – maksimum się nie przesuwa', () => {
    const extra = { id: 'x', name: 'X', zone: NY_ZONE, startMin: 600, endMin: 660, markets: ['NYSE' as const] }
    const changes = [migrated(), { id: 'starsza', from: '2026-10-20', at: null, made: 9, patch: { sessions: [extra] } }]
    const capped = template('zwykly', 'zwykly', [LONDON, NY], {}, '2026-01-01', 15 * 60)
    const s = daySettings(settingsOn(changes, '2026-10-21'), [capped], 'zwykly', '2026-10-21')
    expect(s.dayTypes.zwykly.sessions[2]).toBe('yes')
    expect(s.sessions.map((d) => d.id)).toEqual(['londyn', 'ny'])
    const ctx = dayContextOf({ changes, templates: [capped], lectures: [], series: [] }, { date: '2026-10-21', events: [], dayFile: null, nextFile: null }, holidays, placeLogical('2026-10-21', 7 * 60))
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
