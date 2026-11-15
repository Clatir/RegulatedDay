/**
 * The move of the layer of sessions into the templates (D511, D515): the sessions of the settings become entries of the
 * templates from the day of the move (and from every later date a change of the layer was set for), the grid „tak / nie /
 * pytaj” goes into each entry as the answers of its weekdays – no copy of a template, no new id of a day's block, no day's
 * file nor attachment rewritten – and the days from then have the same sessions as before (hours, early closes, questions,
 * the very same ids), the days before it stay as they were. A type with sessions and no default template gets one with only
 * them; an ordinary block with a session's id keeps it. Deterministic and once: two computers make the same records, a
 * second move changes nothing. rd.json before the templates (OneDrive): the day as before the move, never twice. An older
 * version reads the entries as fixed blocks of their category and keeps the field.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, sessionBlockId, templateBlockId } from '@shared/engine/createDay'
import { sessionQuestions } from '@shared/engine/morning'
import { ownersOf } from '@shared/model/attachment'
import { defaultTemplates, firstComputerRecords, settingsPatch, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { RULES_VERSION } from '@shared/model/events'
import { DEFAULT_GENERAL, rdFrom } from '@shared/model/rd'
import { dayFileFrom, planBlock, templateFrom, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { moveSessions, movedTemplates, SESSIONS_CHANGE_ID, sessionsMoved } from '@shared/model/sessionMigration'
import { DAY_TYPES, DEFAULT_SESSIONS, DEFAULT_SETTINGS, settingsOn, type SessionChoice, type SettingsChange } from '@shared/model/settings'
import { daySettings, sessionOwnersOf } from '@shared/model/templateSessions'
import { addDays } from '@shared/time/zone'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)
/** A Monday. */
const CUT = '2026-10-19'
const NO7 = ['no', 'no', 'no', 'no', 'no', 'no', 'no']
const MF: SessionChoice[] = ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no']

const day = (date: string, changes: readonly SettingsChange[], templates: readonly Template[], dayFile: DayFile | null = null) =>
  createDay({ date, changes, templates, lectures: [], series: [], dayFile, holidays, at: null })
/** What a day is made of, without where its sessions come from (a session's own name came with the move). */
const shape = (s: ReturnType<typeof day>) => ({
  dayType: s.dayType,
  wakeMin: s.wakeMin,
  budgetMin: s.budgetMin,
  maxMin: s.maxMin,
  holidays: s.holidays,
  blocks: s.blocks.map((b) => [b.id, b.origin, b.sourceId, b.categoryId, b.startMin, b.anchor, b.durationMin, b.fixed]).sort()
})

/**
 * Every type on every date of a range, before the move and after it: the same days, with the very same ids of blocks (the
 * markets of the day may be more – those of every template's session, T1342 – never fewer).
 */
function expectSameDays(before: { changes: SettingsChange[]; templates: Template[] }, after: { changes: SettingsChange[]; templates: Template[] }, from: string, days: number) {
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    for (const type of DAY_TYPES) {
      const file = dayFileFrom({ dayType: type }, date)
      const a = day(date, before.changes, before.templates, file)
      const b = day(date, after.changes, after.templates, file)
      const known = (h: { market: string }) => a.holidays.some((x) => x.market === h.market)
      expect({ date, type, ...shape(b), holidays: b.holidays.filter(known) }).toEqual({ date, type, ...shape(a) })
      expect(sessionQuestions(b, file, date).map((s) => s.id)).toEqual(sessionQuestions(a, file, date).map((s) => s.id))
    }
  }
}

const journaling = planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' })
const analysis = planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })
const ordinary = (blocks: PlanBlock[] = [journaling]): Template => ({ id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: SETUP_FROM, blocks, budgetMin: null, maxMin: null }] })
const setup = (patch: Record<string, unknown> = {}): SettingsChange[] => [{ id: 'kreator', from: SETUP_FROM, at: null, made: 1, patch }]
const defaults = (blocks?: PlanBlock[]) => [ordinary(blocks), ...defaultTemplates().filter((t) => t.id !== 'zwykly')]
const moved = (changes: SettingsChange[], templates: Template[], from = CUT) => {
  const move = moveSessions(changes, templates, from)!
  return { move, after: { changes: [...changes, ...move.changes], templates: movedTemplates(templates, move) } }
}
const entriesOf = (t: Template, from: string) => t.versions.find((v) => v.from === from)!.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.days.join(' ')])
const sessionsOn = (date: string, changes: readonly SettingsChange[], templates: readonly Template[], type: string) =>
  day(date, changes, templates, dayFileFrom({ dayType: type }, date)).blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.sourceId])

describe('przeniesienie sesji do szablonów (D511, D515)', () => {
  it('ustawienia domyślne: dzień zwykły dostaje sesje z dniami pn–pt „tak”, sb i nd „nie”; zjazd zdalny – szablon z „pytaj” każdego dnia; bez kopii', () => {
    const templates = defaults()
    const { move, after } = moved(setup(), templates)
    expect(move.changes).toEqual([
      {
        id: SESSIONS_CHANGE_ID,
        from: CUT,
        at: null,
        made: 1,
        patch: {
          sessions: [],
          dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])),
          movedSessions: DEFAULT_SESSIONS,
          movedLayer: { sessions: DEFAULT_SESSIONS, grid: Object.fromEntries(DAY_TYPES.map((t) => [t, DEFAULT_SETTINGS.dayTypes[t].sessions])), templates: ['sesje-zjazd-zdalny', 'zwykly'] }
        }
      }
    ])
    // The templates keep their ids and weekdays; no copy – only the type without a template gets one.
    expect(move.changed.map((t) => [t.id, t.weekdays, t.sessionsMoved])).toEqual([['zwykly', [], CUT]])
    expect(move.made.map((t) => [t.id, t.name, t.dayType, t.weekdays, t.sessionsMoved])).toEqual([['sesje-zjazd-zdalny', 'Zjazd zdalny', 'zjazd-zdalny', [], CUT]])
    expect(after.templates.map((t) => t.id)).toEqual(['zwykly', 'sobota', 'sesje-zjazd-zdalny'])
    const zwykly = move.changed[0]!
    // The version before the move stays; the one from the move has the sessions, the anchor follows the entry by its id.
    expect(zwykly.versions.map((v) => v.from)).toEqual([SETUP_FROM, CUT])
    expect(zwykly.versions[0]!.blocks).toEqual([journaling])
    expect(zwykly.versions[1]!.blocks.map((b) => [b.id, b.name, b.startMin, b.durationMin, b.fixed, b.anchor, b.session ?? null])).toEqual([
      ['jrn', null, null, 30, false, 'ny', null],
      ['londyn', 'Sesja Londyn', 8 * 60, 180, true, null, { zone: 'America/New_York', markets: ['UK'], days: MF }],
      ['ny', 'Sesja NY', 14 * 60, 180, true, null, { zone: 'America/New_York', markets: ['NYSE', 'CME_FX'], days: MF }]
    ])
    expect(entriesOf(move.made[0]!, CUT)).toEqual([
      ['londyn', 'ask ask ask ask ask ask ask'],
      ['ny', 'ask ask ask ask ask ask ask']
    ])
    // The weekend's Saturday template: „nie” every day – untouched.
    expect(after.templates.find((t) => t.id === 'sobota')).toEqual(templates.find((t) => t.id === 'sobota'))
    // Every type on every day of six weeks from the move (the week of the shift, Thanksgiving, its early close): the same days.
    expectSameDays({ changes: setup(), templates }, after, CUT, 42)
  })

  it('siatka mieszana: odpowiedzi przechodzą do dni wpisu – szablon wtorku i czwartku zostaje jeden, z tym samym id i dniami', () => {
    const tueThu: Template = { id: 'wt-czw', name: 'Wykłady', dayType: 'zwykly', weekdays: [2, 4], archived: false, versions: [{ from: SETUP_FROM, blocks: [planBlock({ id: 'w', categoryId: 'wyklad', startMin: 17 * 60, durationMin: 90, fixed: true, origin: 'template' }), journaling], budgetMin: null, maxMin: null }] }
    // Monday „pytaj”, Tuesday „tak”, Wednesday „nie”, Thursday „pytaj”, Friday „tak”, the weekend „nie”.
    const changes = setup({ dayTypes: { zwykly: { sessions: ['ask', 'yes', 'no', 'ask', 'yes', 'no', 'no'] } } })
    const templates = [ordinary(), tueThu]
    const { move, after } = moved(changes, templates)
    expect(move.made.map((t) => t.id)).toEqual(['sesje-zjazd-zdalny'])
    const own = after.templates.find((t) => t.id === 'wt-czw')!
    expect([own.weekdays, own.name]).toEqual([[2, 4], 'Wykłady'])
    // A template of weekdays: „nie” on a weekday it does not make.
    expect(entriesOf(own, CUT)).toEqual([
      ['londyn', 'no yes no ask no no no'],
      ['ny', 'no yes no ask no no no']
    ])
    // The default one: the grid of its type as it is.
    expect(entriesOf(after.templates.find((t) => t.id === 'zwykly')!, CUT)).toEqual([
      ['londyn', 'ask yes no ask yes no no'],
      ['ny', 'ask yes no ask yes no no']
    ])
    // Its blocks keep their ids: a Thursday's lecture is the same block of the same template.
    const thu = '2026-10-22'
    expect(day(thu, after.changes, after.templates).blocks.find((b) => b.sourceId === 'w')!.id).toBe(templateBlockId(thu, 'wt-czw', 'w'))
    expectSameDays({ changes, templates }, after, CUT, 21)
  })

  it('dwa komputery: z tych samych plików te same rekordy; drugi raz – nic, także dzień później i po Twojej zmianie szablonu', () => {
    const templates = defaults()
    const a = moveSessions(setup(), structuredClone(templates), CUT)!
    const b = moveSessions(setup(), structuredClone(templates), CUT)!
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    // The files as written (both computers write the same text – OneDrive's conflict copies join without a question).
    expect(movedTemplates(templates, b).map((t) => JSON.stringify(templateJson(t)))).toEqual(movedTemplates(templates, a).map((t) => JSON.stringify(templateJson(t))))
    // The change in the settings: the move is made – not again.
    const done = [...setup(), ...a.changes]
    expect(sessionsMoved(done)).toBe(true)
    expect(moveSessions(done, movedTemplates(templates, a), CUT)).toBeNull()
    // The other computer, its edit of rd.json still on the way: the templates written already change no more, rd.json's
    // change is the same.
    const again = moveSessions(setup(), movedTemplates(templates, a), CUT)!
    expect([again.changed, again.made]).toEqual([[], []])
    expect(again.changes).toEqual(a.changes)
    // A day later, its change still on the way: nothing in the templates, the same list of the templates of the move.
    const later = moveSessions(setup(), movedTemplates(templates, a), addDays(CUT, 1))!
    expect([later.changed, later.made]).toEqual([[], []])
    expect(later.changes[0]!.patch.movedLayer).toEqual(a.changes[0]!.patch.movedLayer)
    // You took London out of the ordinary day meanwhile: a late move of the other computer does not bring it back.
    const mine = movedTemplates(templates, a).map((t) => (t.id === 'zwykly' ? { ...t, versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.filter((x) => x.id !== 'londyn') })) } : t))
    expect(moveSessions(setup(), mine, addDays(CUT, 1))!.changed).toEqual([])
  })

  it('dzień przeszły bez zmian; przyszły dzień ma te same identyfikatory bloków, więc jego plik i załączniki działają bez przepisywania', () => {
    const templates = defaults([journaling, analysis])
    const { after } = moved(setup(), templates)
    for (let i = 1; i <= 14; i++) {
      const date = addDays(CUT, -i)
      for (const type of DAY_TYPES) {
        const file = dayFileFrom({ dayType: type }, date)
        expect(day(date, after.changes, after.templates, file)).toEqual(day(date, setup(), templates, file))
      }
    }
    // A Saturday of the ordinary type after the move, its analysis cancelled before it: the same id, still cancelled.
    const sat = '2026-10-31'
    const an = templateBlockId(sat, 'zwykly', 'an')
    const file = dayFileFrom({ schema: 1, date: sat, dayType: 'zwykly', cancelled: { [an]: true }, stepsDone: { [an]: { s1: true } } }, sat)
    const snap = day(sat, after.changes, after.templates, file)
    expect(snap.templateId).toBe('zwykly')
    expect(snap.blocks.some((b) => b.id === an)).toBe(true)
    expect(dayPlan(snap, file).some((b) => b.id === an)).toBe(false)
    // The ordinary type's Saturday „nie”: no session, as the layer said.
    expect(snap.blocks.filter((b) => b.origin === 'session')).toEqual([])
    // An attachment of a day's block (its owner is the block's id): the same block on the same day.
    expect(ownersOf(snap.blocks.find((b) => b.id === an)!, { scope: 'day', date: sat, templateId: 'zwykly' })[0]).toEqual({ scope: 'day', date: sat, blockId: an })
  })

  it('zmiana warstwy od późniejszej daty („od jutra” przed aktualizacją) przechodzi do szablonów od swojej daty; nazwy sesji – suma', () => {
    // From Wednesday: only NY, 09:30–11:30 New York time, and Friday „pytaj”.
    const ny = { ...DEFAULT_SESSIONS[1]!, startMin: 9 * 60 + 30, endMin: 11 * 60 + 30 }
    const wed = addDays(CUT, 2)
    const changes: SettingsChange[] = [...setup(), { id: 'pozniej', from: wed, at: null, made: 5, patch: { sessions: [ny], dayTypes: { zwykly: { sessions: ['yes', 'yes', 'yes', 'yes', 'ask', 'no', 'no'] } } } }]
    const templates = defaults()
    const { move, after } = moved(changes, templates)
    expect(move.changes.map((c) => [c.id, c.from, c.made])).toEqual([
      [SESSIONS_CHANGE_ID, CUT, 1],
      [`${SESSIONS_CHANGE_ID}-${wed}`, wed, 6]
    ])
    // The layer stays empty after the later change too, for any version.
    expect(settingsOn(after.changes, addDays(wed, 1)).sessions).toEqual([])
    expect(settingsOn(after.changes, addDays(wed, 1)).dayTypes.zwykly.sessions).toEqual(NO7)
    // From Wednesday a version of its own: NY at its new hour, Friday „pytaj”, London gone; before it – both, „tak” Mon–Fri.
    const zwykly = after.templates.find((t) => t.id === 'zwykly')!
    expect(zwykly.versions.map((v) => [v.from, v.blocks.filter((b) => b.session).map((b) => [b.id, b.startMin, b.session!.days.join(' ')])])).toEqual([
      [SETUP_FROM, []],
      [CUT, [['londyn', 8 * 60, MF.join(' ')], ['ny', 14 * 60, MF.join(' ')]]],
      [wed, [['ny', 15 * 60 + 30, 'yes yes yes yes ask no no']]]
    ])
    // The layer of each date as the move found it; the names of every session up to the date (London's too, #11).
    const later = settingsOn(after.changes, wed)
    expect(later.movedLayer!.sessions).toEqual([ny])
    expect(later.movedSessions.map((s) => [s.id, s.startMin])).toEqual([
      ['londyn', 2 * 60],
      ['ny', 9 * 60 + 30]
    ])
    expectSameDays({ changes, templates }, after, CUT, 14)
  })

  it('typ z sesjami bez własnego szablonu domyślnego dostaje go; typ z domyślnym – sesje w nim, bez nowego szablonu', () => {
    // A remote „zjazd” on Saturdays only: the default made by the move takes its other weekdays.
    const saturday: Template = { id: 'zdalny-sb', name: 'Zdalny w sobotę', dayType: 'zjazd-zdalny', weekdays: [6], archived: false, versions: [{ from: SETUP_FROM, blocks: [analysis], budgetMin: null, maxMin: null }] }
    const a = moved(setup(), [...defaults(), saturday])
    expect(a.move.made.map((t) => t.id)).toEqual(['sesje-zjazd-zdalny'])
    expect(entriesOf(a.after.templates.find((t) => t.id === 'zdalny-sb')!, CUT)).toEqual([
      ['londyn', 'no no no no no ask no'],
      ['ny', 'no no no no no ask no']
    ])
    expectSameDays({ changes: setup(), templates: [...defaults(), saturday] }, a.after, CUT, 14)
    // A default of its own: the sessions go into it.
    const remote: Template = { ...saturday, id: 'zdalny', weekdays: [] }
    const b = moved(setup(), [...defaults(), remote])
    expect(b.move.made).toEqual([])
    expect(b.move.changed.map((t) => t.id)).toEqual(['zdalny', 'zwykly'])
    expectSameDays({ changes: setup(), templates: [...defaults(), remote] }, b.after, CUT, 14)
  })

  it('zwykły blok z identyfikatorem sesji zostaje sobą (dni, załączniki szablonu); wpis dostaje inne id bloku, sesja zostaje „ny”', () => {
    const own = planBlock({ id: 'ny', categoryId: 'analiza', startMin: 18 * 60, durationMin: 30, origin: 'template' })
    const next = planBlock({ id: 'po', categoryId: 'inne', anchor: 'ny', durationMin: 15, origin: 'template' })
    const templates = defaults([own, next, journaling])
    const { after } = moved(setup(), templates)
    const v = after.templates.find((t) => t.id === 'zwykly')!.versions.at(-1)!
    expect(v.blocks.map((b) => [b.id, b.anchor, b.session?.id ?? null])).toEqual([
      ['ny', null, null],
      ['po', 'ny', null],
      ['jrn', 'ny-sesja', null],
      ['londyn', null, null],
      ['ny-sesja', null, 'ny']
    ])
    const date = '2026-10-21'
    const snap = day(date, after.changes, after.templates)
    // The session's id on the day (answers, typical length, the day's attachments); the ordinary block's day id unchanged.
    expect(snap.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.sourceId])).toEqual([
      [sessionBlockId(date, 'londyn'), 'londyn'],
      [sessionBlockId(date, 'ny'), 'ny']
    ])
    const ordinaryDay = snap.blocks.find((b) => b.origin === 'template' && b.sourceId === 'ny')!
    expect(ordinaryDay.id).toBe(templateBlockId(date, 'zwykly', 'ny'))
    expect(snap.blocks.find((b) => b.sourceId === 'po')!.anchor).toBe(ordinaryDay.id)
    expect(snap.blocks.find((b) => b.sourceId === 'jrn')!.anchor).toBe(sessionBlockId(date, 'ny'))
    // The attachments of the template: the ordinary block's stay its, the session shows its entry's.
    const place = { scope: 'day' as const, date, templateId: 'zwykly', sessions: sessionOwnersOf(after.templates, 'zwykly', 'zwykly', date) }
    expect(ownersOf(ordinaryDay, place)[1]).toEqual({ scope: 'template', templateId: 'zwykly', blockId: 'ny' })
    expect(ownersOf(snap.blocks.find((b) => b.id === sessionBlockId(date, 'ny'))!, place)[1]).toEqual({ scope: 'template', templateId: 'zwykly', blockId: 'ny-sesja' })
    expectSameDays({ changes: setup(), templates }, after, CUT, 7)
  })

  it('rd.json przed szablonami (OneDrive): dzień od razu z sesjami warstwy sprzed przeniesienia; po dojściu szablonów – te same, nigdy podwójnie', () => {
    const templates = defaults([journaling, analysis])
    const { after } = moved(setup(), templates)
    // rd.json with the move, the templates as before it: the ordinary day as before – the layer the move kept.
    const stale = { changes: after.changes, templates }
    for (let i = 0; i < 14; i++) {
      const date = addDays(CUT, i)
      const file = dayFileFrom({ dayType: 'zwykly' }, date)
      expect(shape(day(date, stale.changes, stale.templates, file))).toEqual(shape(day(date, setup(), templates, file)))
      expect(shape(day(date, after.changes, after.templates, file))).toEqual(shape(day(date, setup(), templates, file)))
      // One id – one session, in either state and while only some templates have come.
      for (const ts of [templates, after.templates, [after.templates[0]!, ...templates.slice(1)]]) {
        const ids = daySettings(settingsOn(after.changes, date), ts, 'zwykly', date).sessions.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
    // A day made then keeps its sessions once the templates come: its plan has each once, the next day has the same ids.
    const wed = '2026-10-21'
    const made = day(wed, stale.changes, stale.templates)
    expect(dayPlan(made, null).filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
    expect(sessionsOn(addDays(wed, 1), after.changes, after.templates, 'zwykly')).toEqual(sessionsOn(addDays(wed, 1), stale.changes, stale.templates, 'zwykly'))
    // The type's template made by the move has not come yet: its day has no template and no session (T1405 – known limit).
    expect(sessionsOn(wed, stale.changes, stale.templates, 'zjazd-zdalny')).toEqual([])
    expect(sessionsOn(wed, after.changes, after.templates, 'zjazd-zdalny').map(([, s]) => s)).toEqual(['londyn', 'ny'])
  })

  it('starsza wersja: wpis to stały blok swojej kategorii w każdym dniu szablonu (także „nie” i bez pytania); pole zostaje w pliku', () => {
    const templates = defaults()
    const { after } = moved(setup(), templates)
    // As an older version reads the files: the field „według czasu” is not in its model.
    const files = after.templates.map((t) => templateJson(t))
    const older = files.map((raw) => {
      const t = templateFrom(raw)!
      return { ...t, versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.map(({ session: _s, ...b }) => b) })) }
    })
    // The layer of sessions is empty from the move – for any version.
    expect(settingsOn(after.changes, '2026-10-21').sessions).toEqual([])
    const wed = day('2026-10-21', after.changes, older)
    expect(wed.blocks.filter((b) => b.origin === 'session')).toEqual([])
    const sessions = wed.blocks.filter((b) => b.categoryId === 'sesja')
    expect(sessions.map((b) => [b.sourceId, b.origin, b.startMin, b.durationMin, b.fixed])).toEqual([
      ['londyn', 'template', 8 * 60, 180, true],
      ['ny', 'template', 14 * 60, 180, true]
    ])
    expect(wed.blocks.find((b) => b.sourceId === 'jrn')!.anchor).toBe(sessions[1]!.id)
    // A Saturday of the ordinary type („nie”): this version – no session; an older one shows them (it leads only alone, T1403).
    const sat = '2026-10-24'
    const satFile = dayFileFrom({ dayType: 'zwykly' }, sat)
    expect(day(sat, after.changes, after.templates, satFile).blocks.filter((b) => b.categoryId === 'sesja')).toEqual([])
    expect(day(sat, after.changes, older, satFile).blocks.filter((b) => b.categoryId === 'sesja').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
    // A remote „zjazd” („pytaj”): fixed blocks, no question.
    expect(day('2026-10-21', after.changes, older, dayFileFrom({ dayType: 'zjazd-zdalny' }, '2026-10-21')).blocks.filter((b) => b.categoryId === 'sesja').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
    // An older version's save of the template (a block changed) keeps the field of every entry, its days with it.
    const zwykly = older.find((t) => t.id === 'zwykly')!
    const raw = files.find((f) => f.id === 'zwykly')!
    const edited = { ...zwykly, versions: zwykly.versions.map((v) => (v.from === CUT ? { ...v, blocks: v.blocks.map((b) => (b.id === 'jrn' ? { ...b, durationMin: 45 } : b)) } : v)) }
    const written = templateFrom(templateJson(edited, raw))!
    expect(written.sessionsMoved).toBe(CUT)
    expect(written.versions.find((v) => v.from === CUT)!.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.days.join(' ')])).toEqual([
      ['londyn', MF.join(' ')],
      ['ny', MF.join(' ')]
    ])
    // Its rules are older: it gives way to this version as the leader and freezes no day (`decideLeader`, `mayFreeze`).
    expect(RULES_VERSION).toBeGreaterThanOrEqual(14)
  })

  it('kreator zapisuje sesje do szablonów od początku: dni jak z warstwy sesji, bez kopii i bez drugiego przeniesienia', () => {
    const settings = { ...DEFAULT_SETTINGS, dayTypes: { ...DEFAULT_SETTINGS.dayTypes, weekend: { ...DEFAULT_SETTINGS.dayTypes.weekend, sessions: ['no', 'no', 'no', 'no', 'no', 'yes', 'no'] as SessionChoice[] } } }
    const records = firstComputerRecords({ settings, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} }, 1_800_000_000_000, 'pca')
    expect(records.map((r) => r.rel)).toEqual(['rd.json', 'templates/zwykly.json', 'templates/sobota.json', 'templates/sesje-zjazd-zdalny.json'])
    const rd = rdFrom(records[0]!.value)
    expect(rd.settings.map((c) => c.id)).toEqual(['kreator', SESSIONS_CHANGE_ID])
    const templates = records.filter((r) => r.rel.startsWith('templates/')).map((r) => templateFrom(r.value)!)
    expect(templates.map((t) => t.sessionsMoved)).toEqual([SETUP_FROM, SETUP_FROM, SETUP_FROM])
    expect(moveSessions(rd.settings, templates, '2026-10-21')).toBeNull()
    // Saturday of the weekend „tak” (a change in the wizard): the Saturday template has the sessions on Saturday.
    expect(entriesOf(templates.find((t) => t.id === 'sobota')!, SETUP_FROM)).toEqual([
      ['londyn', 'no no no no no yes no'],
      ['ny', 'no no no no no yes no']
    ])
    const before = { changes: setup(settingsPatch(DEFAULT_SETTINGS, settings)), templates: defaultTemplates() }
    expectSameDays(before, { changes: rd.settings, templates }, '2026-10-19', 14)
  })
})
