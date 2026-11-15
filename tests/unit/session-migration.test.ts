/**
 * The move of the layer of sessions into the templates (D511): the grid „tak / nie / pytaj” and the sessions of the settings
 * become entries of the templates from the day of the move (and from every later date a change of the layer was set for),
 * a template with weekdays of different answers is split into copies, the days from then have the same sessions as before
 * (hours, early closes, questions; a copy's day – the copy's ids, its day's file rewritten to them) and the days before it
 * stay as they were. A template of yours from a later date wins over a copy; an ordinary block with a session's id gets
 * another one. Deterministic and once: two computers make the same records, a second move changes nothing. An older version
 * reads the entries as fixed blocks of their category – each session once, with the same ids – and keeps the field.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { sessionQuestions } from '@shared/engine/morning'
import { defaultTemplates, firstComputerRecords, settingsPatch, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { ownersOf, templateRemovalIds, type Attachment } from '@shared/model/attachment'
import { RULES_VERSION } from '@shared/model/events'
import { DEFAULT_GENERAL, rdFrom } from '@shared/model/rd'
import { dayFileFrom, planBlock, templateFor, templateFrom, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { dayIdMap, moveSessions, movedTemplates, SESSIONS_CHANGE_ID, sessionsMoved, withIds, type SessionsMove } from '@shared/model/sessionMigration'
import { DAY_TYPES, DEFAULT_SETTINGS, settingsOn, type SessionChoice, type SettingsChange } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)
/** A Monday. */
const CUT = '2026-10-19'
const NO7 = ['no', 'no', 'no', 'no', 'no', 'no', 'no']

const day = (date: string, changes: readonly SettingsChange[], templates: readonly Template[], dayFile: DayFile | null = null) =>
  createDay({ date, changes, templates, lectures: [], series: [], dayFile, holidays, at: null })
/** What a day is made of, without where its sessions come from (a session's own name came with the move); ids as `map` says. */
const shape = (s: ReturnType<typeof day>, map: ReadonlyMap<string, string> = new Map()) => ({
  dayType: s.dayType,
  wakeMin: s.wakeMin,
  budgetMin: s.budgetMin,
  maxMin: s.maxMin,
  holidays: s.holidays,
  blocks: s.blocks.map((b) => [map.get(b.id) ?? b.id, b.origin, b.sourceId, b.categoryId, b.startMin, b.anchor ? (map.get(b.anchor) ?? b.anchor) : null, b.durationMin, b.fixed]).sort()
})

/** Every type on every date of a range, before the move and after it: the same days (a copy's day – with the copy's ids). */
function expectSameDays(before: { changes: SettingsChange[]; templates: Template[] }, after: { changes: SettingsChange[]; templates: Template[] }, move: SessionsMove, from: string, days: number) {
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    for (const type of DAY_TYPES) {
      const file = dayFileFrom({ dayType: type }, date)
      const a = day(date, before.changes, before.templates, file)
      const b = day(date, after.changes, after.templates, file)
      expect({ date, type, ...shape(b) }).toEqual({ date, type, ...shape(a, dayIdMap(move, before.templates, date, type)) })
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

describe('przeniesienie sesji do szablonów (D511)', () => {
  it('ustawienia domyślne: dzień zwykły dostaje sesje, jego sobota i niedziela – kopię bez sesji, zjazd zdalny – szablon z „pytaj rano”', () => {
    const templates = defaults()
    const { move, after } = moved(setup(), templates)
    expect(move.changes).toEqual([
      { id: SESSIONS_CHANGE_ID, from: CUT, at: null, made: 1, patch: { sessions: [], movedSessions: DEFAULT_SETTINGS.sessions, dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: NO7 }])) } }
    ])
    expect(move.changed.map((t) => t.id)).toEqual(['zwykly'])
    expect(move.made.map((m) => [m.template.id, m.template.name, m.template.dayType, m.template.weekdays, m.copyOf])).toEqual([
      ['zwykly_67', 'Dzień zwykły (sb, nd)', 'zwykly', [6, 7], 'zwykly'],
      ['sesje-zjazd-zdalny', 'Zjazd zdalny', 'zjazd-zdalny', [], null]
    ])
    const zwykly = move.changed[0]!
    // The version before the move stays; the one from the move has the sessions, the anchor follows the entry by its id.
    expect(zwykly.versions.map((v) => v.from)).toEqual([SETUP_FROM, CUT])
    expect(zwykly.versions[0]!.blocks).toEqual([journaling])
    expect(zwykly.versions[1]!.blocks.map((b) => [b.id, b.name, b.startMin, b.durationMin, b.fixed, b.anchor, b.session ?? null])).toEqual([
      ['jrn', null, null, 30, false, 'ny', null],
      ['londyn', 'Sesja Londyn', 8 * 60, 180, true, null, { zone: 'America/New_York', ask: false, markets: ['UK'] }],
      ['ny', 'Sesja NY', 14 * 60, 180, true, null, { zone: 'America/New_York', ask: false, markets: ['NYSE', 'CME_FX'] }]
    ])
    expect(move.made[0]!.template.versions.at(-1)!.blocks).toEqual([journaling])
    expect(move.made[1]!.template.versions[0]!.blocks.map((b) => [b.id, b.session?.ask])).toEqual([
      ['londyn', true],
      ['ny', true]
    ])
    // Every type on every day of six weeks from the move (the week of the shift, Thanksgiving, its early close): the same days.
    expectSameDays({ changes: setup(), templates }, after, move, CUT, 42)
  })

  it('siatka z mieszanymi odpowiedziami: szablon wtorku i czwartku dzieli się na kopie, domyślny – według dni, których nie ma inny', () => {
    const tueThu: Template = { id: 'wt-czw', name: 'Wykłady', dayType: 'zwykly', weekdays: [2, 4], archived: false, versions: [{ from: SETUP_FROM, blocks: [planBlock({ id: 'w', categoryId: 'wyklad', startMin: 17 * 60, durationMin: 90, fixed: true, origin: 'template' }), journaling], budgetMin: null, maxMin: null }] }
    // Monday „pytaj”, Tuesday „tak”, Wednesday „nie”, Thursday „pytaj”, Friday „tak”, the weekend „nie”.
    const changes = setup({ dayTypes: { zwykly: { sessions: ['ask', 'yes', 'no', 'ask', 'yes', 'no', 'no'] } } })
    const templates = [ordinary(), tueThu]
    const { move, after } = moved(changes, templates)
    // Tuesday and Thursday: a tie – the template keeps Tuesday, a copy takes Thursday with „pytaj rano”.
    expect(after.templates.find((t) => t.id === 'wt-czw')!.weekdays).toEqual([2])
    const thu = after.templates.find((t) => t.id === 'wt-czw_4')!
    expect([thu.weekdays, thu.name]).toEqual([[4], 'Wykłady (cz)'])
    expect(thu.versions.at(-1)!.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.ask])).toEqual([
      ['londyn', true],
      ['ny', true]
    ])
    // The default one makes Monday, Wednesday, Friday and the weekend: Monday „pytaj” and Friday „tak” are one each – the
    // default keeps the most (Wednesday with the weekend, „nie”), the others get copies.
    expect(move.made.map((m) => [m.template.id, m.template.weekdays, m.copyOf])).toEqual([
      ['wt-czw_4', [4], 'wt-czw'],
      ['zwykly_1', [1], 'zwykly'],
      ['zwykly_5', [5], 'zwykly'],
      ['sesje-zjazd-zdalny', [], null]
    ])
    expect(after.templates.find((t) => t.id === 'zwykly')!.versions.at(-1)!.blocks.some((b) => b.session)).toBe(false)
    expectSameDays({ changes, templates }, after, move, CUT, 21)
  })

  it('dwa komputery: z tych samych plików te same rekordy i identyfikatory; drugi raz – nic', () => {
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
    // The other computer, its edit of rd.json still on the way: the templates moved already change no more (a fixed point).
    const again = moveSessions(setup(), movedTemplates(templates, a), CUT)!
    expect(again.changed).toEqual([])
    expect(again.made).toEqual([])
    // A day later, its change still on the way: no second copy, no second session.
    const later = moveSessions(setup(), movedTemplates(templates, a), addDays(CUT, 1))!
    expect(later.made).toEqual([])
    const days = movedTemplates(movedTemplates(templates, a), later)
    expect(days.find((t) => t.id === 'zwykly')!.versions.at(-1)!.blocks.filter((b) => b.session).map((b) => b.id)).toEqual(['londyn', 'ny'])
  })

  it('dzień przeszły bez zmian; przyszły dzień kopii ma jej identyfikatory, a jego plik przepisany na nie zachowuje Twoje zmiany', () => {
    const templates = defaults([journaling, analysis])
    const { move, after } = moved(setup(), templates)
    for (let i = 1; i <= 14; i++) {
      const date = addDays(CUT, -i)
      for (const type of DAY_TYPES) {
        const file = dayFileFrom({ dayType: type }, date)
        const was = day(date, setup(), templates, file)
        const now = day(date, after.changes, after.templates, file)
        expect({ ...now, templateId: null }).toEqual({ ...was, templateId: null })
      }
    }
    // A Saturday of the ordinary type after the move, cancelled and changed before it: the copy's ids, the file rewritten.
    const sat = '2026-10-31'
    const was = templateBlockId(sat, 'zwykly', 'an')
    const map = dayIdMap(move, templates, sat, 'zwykly')
    const now = templateBlockId(sat, 'zwykly_67', 'an')
    // Both blocks of the ordinary day's version (the analysis and the journaling) – the copy's ids.
    expect(map.get(was)).toBe(now)
    expect(map.get(templateBlockId(sat, 'zwykly', 'jrn'))).toBe(templateBlockId(sat, 'zwykly_67', 'jrn'))
    expect(map.size).toBe(2)
    const raw = { schema: 1, date: sat, dayType: 'zwykly', cancelled: { [was]: true }, stepsDone: { [was]: { s1: true } } }
    const file = dayFileFrom(withIds(raw, map), sat)
    expect(file.cancelled).toEqual([now])
    expect(file.stepsDone).toEqual({ [now]: ['s1'] })
    const snap = day(sat, after.changes, after.templates, file)
    expect(snap.templateId).toBe('zwykly_67')
    expect(snap.blocks.some((b) => b.id === now)).toBe(true)
    expect(dayPlan(snap, file).some((b) => b.id === now)).toBe(false)
    // An older version (without the field „według czasu”) makes that day with the very same ids.
    const older = after.templates.map((t) => ({ ...t, versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.map(({ session: _s, ...b }) => b) })) }))
    expect(day(sat, after.changes, older, file).blocks.map((b) => b.id).sort()).toEqual(snap.blocks.map((b) => b.id).sort())
    // A day of the ordinary type on a weekday – the same template, nothing to rewrite.
    expect(dayIdMap(move, templates, '2026-10-21', 'zwykly').size).toBe(0)
  })

  it('załączniki: dzień kopii widzi tylko jej, usunięcie bloku z kopii nie zabiera załączników dni oryginału (inne identyfikatory)', () => {
    const templates = defaults([journaling, analysis])
    const { after } = moved(setup(), templates)
    const copy = after.templates.find((t) => t.id === 'zwykly_67')!
    const sat = '2026-10-31'
    const wed = '2026-10-28'
    const onCopy = templateBlockId(sat, 'zwykly_67', 'an')
    const block = day(sat, after.changes, after.templates, dayFileFrom({ dayType: 'zwykly' }, sat)).blocks.find((b) => b.id === onCopy)!
    expect(ownersOf(block, { scope: 'day', date: sat, templateId: 'zwykly_67', templateIds: after.templates.map((t) => t.id) })).toEqual([
      { scope: 'day', date: sat, blockId: onCopy },
      { scope: 'template', templateId: 'zwykly_67', blockId: 'an' }
    ])
    const without = { ...copy, versions: [...copy.versions, { ...copy.versions.at(-1)!, from: '2026-10-27', blocks: copy.versions.at(-1)!.blocks.filter((b) => b.id !== 'an') }] }
    const ofCopy = { id: 'a1', owner: { scope: 'day', date: sat, blockId: onCopy }, removedAt: null } as unknown as Attachment
    const ofOriginal = { id: 'a2', owner: { scope: 'day', date: wed, blockId: templateBlockId(wed, 'zwykly', 'an') }, removedAt: null } as unknown as Attachment
    expect(templateRemovalIds([ofCopy, ofOriginal], 'zwykly_67', copy, without, '2026-10-27')).toEqual(['a1'])
  })

  it('zmiana warstwy od późniejszej daty (np. „od jutra” przed aktualizacją) przechodzi do szablonów od swojej daty, warstwa zostaje pusta', () => {
    // From Wednesday: Friday „pytaj” and NY 09:30–11:30 New York time.
    const ny = { ...DEFAULT_SETTINGS.sessions[1]!, startMin: 9 * 60 + 30, endMin: 11 * 60 + 30 }
    const wed = addDays(CUT, 2)
    const changes: SettingsChange[] = [...setup(), { id: 'pozniej', from: wed, at: null, made: 5, patch: { sessions: [DEFAULT_SETTINGS.sessions[0]!, ny], dayTypes: { zwykly: { sessions: ['yes', 'yes', 'yes', 'yes', 'ask', 'no', 'no'] } } } }]
    const templates = defaults()
    const { move, after } = moved(changes, templates)
    expect(move.changes.map((c) => [c.id, c.from, c.made])).toEqual([
      [SESSIONS_CHANGE_ID, CUT, 1],
      [`${SESSIONS_CHANGE_ID}-${wed}`, wed, 6]
    ])
    // The layer stays empty after the later change too, for any version.
    expect(settingsOn(after.changes, addDays(wed, 1)).sessions).toEqual([])
    expect(settingsOn(after.changes, addDays(wed, 1)).dayTypes.zwykly.sessions).toEqual(NO7)
    // Friday a copy with „pytaj rano” from Wednesday on; NY at its new hour from Wednesday.
    expect(after.templates.find((t) => t.id === 'zwykly_5')!.versions.map((v) => [v.from, v.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.ask, b.startMin])])).toEqual([
      [CUT, [['londyn', false, 8 * 60], ['ny', false, 14 * 60]]],
      [wed, [['londyn', true, 8 * 60], ['ny', true, 15 * 60 + 30]]]
    ])
    expectSameDays({ changes, templates }, after, move, CUT, 14)
  })

  it('Twój szablon dnia tygodnia od późniejszej daty wygrywa z kopią od swojego startu; domyślny od późniejszej daty – dni do niego mają sesje', () => {
    const later = addDays(CUT, 7)
    const ownSaturday: Template = { id: 'zz-sobota', name: 'Sobota pracująca', dayType: 'zwykly', weekdays: [6], archived: false, versions: [{ from: later, blocks: [analysis], budgetMin: null, maxMin: null }] }
    const ownRemote: Template = { id: 'zdalny', name: 'Zdalny', dayType: 'zjazd-zdalny', weekdays: [], archived: false, versions: [{ from: later, blocks: [analysis], budgetMin: null, maxMin: null }] }
    const templates = [...defaults(), ownSaturday, ownRemote]
    const { move, after } = moved(setup(), templates)
    const copy = move.made.find((m) => m.copyOf === 'zwykly')!.template
    expect(copy.id > 'zz-sobota').toBe(true)
    expect(templateFor(after.templates, 'zwykly', 6, addDays(CUT, 5))!.template.id).toBe(copy.id)
    expect(templateFor(after.templates, 'zwykly', 6, addDays(later, 5))!.template.id).toBe('zz-sobota')
    // The remote „zjazd” before its own template starts: the sessions with „pytaj rano” from a default made by the move,
    // after it – its own (with the sessions too).
    const remote = move.made.find((m) => m.template.dayType === 'zjazd-zdalny')!.template
    expect(remote.id > 'zdalny').toBe(true)
    const sessionsOn = (date: string) => day(date, after.changes, after.templates, dayFileFrom({ dayType: 'zjazd-zdalny' }, date)).blocks.filter((b) => b.origin === 'session').map((b) => b.sourceId)
    expect(sessionsOn(addDays(CUT, 2))).toEqual(['londyn', 'ny'])
    expect(templateFor(after.templates, 'zjazd-zdalny', 3, addDays(later, 2))!.template.id).toBe('zdalny')
    expect(sessionsOn(addDays(later, 2))).toEqual(['londyn', 'ny'])
    expectSameDays({ changes: setup(), templates }, after, move, CUT, 6)
  })

  it('zwykły blok z identyfikatorem sesji dostaje inny – sesja zostaje „ny” (odpowiedzi, typowa długość), dni przechodzą na nowy', () => {
    const own = planBlock({ id: 'ny', categoryId: 'analiza', startMin: 18 * 60, durationMin: 30, origin: 'template' })
    const after2 = planBlock({ id: 'po', categoryId: 'inne', anchor: 'ny', durationMin: 15, origin: 'template' })
    const templates = defaults([own, after2])
    const { move, after } = moved(setup(), templates)
    expect(move.renamed).toEqual({ zwykly: { ny: 'ny-blok' } })
    const v = after.templates.find((t) => t.id === 'zwykly')!.versions.at(-1)!
    expect(v.blocks.map((b) => [b.id, b.anchor, !!b.session])).toEqual([
      ['ny-blok', null, false],
      ['po', 'ny-blok', false],
      ['londyn', null, true],
      ['ny', null, true]
    ])
    const date = '2026-10-21'
    expect([...dayIdMap(move, templates, date, 'zwykly')]).toEqual([[templateBlockId(date, 'zwykly', 'ny'), templateBlockId(date, 'zwykly', 'ny-blok')]])
    expect(day(date, after.changes, after.templates).blocks.filter((b) => b.origin === 'session').map((b) => b.sourceId)).toEqual(['londyn', 'ny'])
  })

  it('starsza wersja: wpis sesji to stały blok swojej kategorii, każda sesja raz, blok „po sesji” za nią; pole zostaje w pliku po jej zapisie', () => {
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
    // An older version's save of the template (a block moved) keeps the field of every entry.
    const zwykly = older.find((t) => t.id === 'zwykly')!
    const raw = files.find((f) => f.id === 'zwykly')!
    const edited = { ...zwykly, versions: zwykly.versions.map((v) => (v.from === CUT ? { ...v, blocks: v.blocks.map((b) => (b.id === 'jrn' ? { ...b, durationMin: 45 } : b)) } : v)) }
    const written = templateFrom(templateJson(edited, raw))!
    expect(written.versions.find((v) => v.from === CUT)!.blocks.filter((b) => b.session).map((b) => b.id)).toEqual(['londyn', 'ny'])
    // Its rules are older: it gives way to this version as the leader and freezes no day (`decideLeader`, `mayFreeze`).
    expect(RULES_VERSION).toBeGreaterThanOrEqual(14)
  })

  it('kreator zapisuje sesje do szablonów od początku: dni jak z warstwy sesji, bez drugiego przeniesienia', () => {
    const settings = { ...DEFAULT_SETTINGS, dayTypes: { ...DEFAULT_SETTINGS.dayTypes, weekend: { ...DEFAULT_SETTINGS.dayTypes.weekend, sessions: ['no', 'no', 'no', 'no', 'no', 'yes', 'no'] as SessionChoice[] } } }
    const records = firstComputerRecords({ settings, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} }, 1_800_000_000_000, 'pca')
    expect(records.map((r) => r.rel)).toEqual(['rd.json', 'templates/zwykly.json', 'templates/sobota.json', 'templates/zwykly_67.json', 'templates/sesje-zjazd-zdalny.json'])
    const rd = rdFrom(records[0]!.value)
    expect(rd.settings.map((c) => c.id)).toEqual(['kreator', SESSIONS_CHANGE_ID])
    const templates = records.filter((r) => r.rel.startsWith('templates/')).map((r) => templateFrom(r.value)!)
    expect(moveSessions(rd.settings, templates, '2026-10-21')).toBeNull()
    // Saturday of the weekend „tak” (a change in the wizard): the Saturday template has the sessions.
    expect(templates.find((t) => t.id === 'sobota')!.versions[0]!.blocks.filter((b) => b.session).map((b) => b.id)).toEqual(['londyn', 'ny'])
    const before = { changes: setup(settingsPatch(DEFAULT_SETTINGS, settings)), templates: defaultTemplates() }
    const move = moveSessions(before.changes, before.templates, SETUP_FROM)!
    expectSameDays(before, { changes: rd.settings, templates }, move, '2026-10-19', 14)
  })
})

