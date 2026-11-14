/**
 * The move of the layer of sessions into the templates (D511): the grid „tak / nie / pytaj” and the sessions of the settings
 * become entries of the templates from the day of the move, a template with weekdays of different answers is split into
 * copies, the days from then have the same sessions as before (ids, hours, early closes, questions) and the days before it
 * stay as they were. Deterministic and once: two computers make the same records, a second move changes nothing. An older
 * version reads the entries as fixed blocks of their category – each session once – and keeps the field in the file.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { sessionQuestions } from '@shared/engine/morning'
import { defaultTemplates, firstComputerRecords, settingsPatch, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { ownersOf, templateRemovalIds, type Attachment } from '@shared/model/attachment'
import { RULES_VERSION } from '@shared/model/events'
import { DEFAULT_GENERAL, rdFrom } from '@shared/model/rd'
import { dayFileFrom, planBlock, templateFrom, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { moveSessions, movedTemplates, SESSIONS_CHANGE_ID, sessionsMoved } from '@shared/model/sessionMigration'
import { DAY_TYPES, DEFAULT_SETTINGS, settingsOn, type SessionChoice, type SettingsChange } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'

const holidays = (m: Parameters<typeof marketDay>[0], d: string) => marketDay(m, d)
const CUT = '2026-10-19'

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

/** Every type on every date of a range, before the move and after it: the same days. */
function expectSameDays(before: { changes: SettingsChange[]; templates: Template[] }, after: { changes: SettingsChange[]; templates: Template[] }, from: string, days: number) {
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    for (const type of DAY_TYPES) {
      const file = dayFileFrom({ dayType: type }, date)
      const a = day(date, before.changes, before.templates, file)
      const b = day(date, after.changes, after.templates, file)
      expect({ date, type, ...shape(b) }).toEqual({ date, type, ...shape(a) })
      expect(sessionQuestions(b, file, date).map((s) => s.id)).toEqual(sessionQuestions(a, file, date).map((s) => s.id))
    }
  }
}

const journaling = planBlock({ id: 'jrn', categoryId: 'journaling', anchor: 'session:ny', durationMin: 30, origin: 'template' })
const ordinary = (blocks: PlanBlock[] = [journaling]): Template => ({ id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], archived: false, versions: [{ from: SETUP_FROM, blocks, budgetMin: null, maxMin: null }] })
const setup = (patch: Record<string, unknown> = {}): SettingsChange[] => [{ id: 'kreator', from: SETUP_FROM, at: null, made: 1, patch }]

describe('przeniesienie sesji do szablonów (D511)', () => {
  it('ustawienia domyślne: dzień zwykły dostaje sesje, jego sobota i niedziela – kopię bez sesji, zjazd zdalny – szablon z „pytaj rano”', () => {
    const templates = [ordinary(), ...defaultTemplates().filter((t) => t.id !== 'zwykly')]
    const move = moveSessions(setup(), templates, CUT)!
    expect(move.change).toEqual({ id: SESSIONS_CHANGE_ID, from: CUT, at: null, made: 1, patch: { sessions: [], dayTypes: Object.fromEntries(DAY_TYPES.map((t) => [t, { sessions: ['no', 'no', 'no', 'no', 'no', 'no', 'no'] }])) } })
    expect(move.changed.map((t) => t.id)).toEqual(['zwykly'])
    expect(move.made.map((t) => [t.id, t.name, t.dayType, t.weekdays, t.blockIdsOf ?? null])).toEqual([
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
    expect(move.made[0]!.versions.at(-1)!.blocks).toEqual([journaling])
    expect(move.made[1]!.versions[0]!.blocks.map((b) => [b.id, b.session?.ask])).toEqual([
      ['londyn', true],
      ['ny', true]
    ])
    // Every type on every day of six weeks from the move (the week of the shift, Thanksgiving, its early close): the same days.
    expectSameDays({ changes: setup(), templates }, { changes: [...setup(), move.change], templates: movedTemplates(templates, move) }, CUT, 42)
  })

  it('siatka z mieszanymi odpowiedziami: szablon wtorku i czwartku dzieli się na kopie, domyślny – według dni, których nie ma inny', () => {
    const tueThu: Template = {
      id: 'wt-czw',
      name: 'Wykłady',
      dayType: 'zwykly',
      weekdays: [2, 4],
      archived: false,
      versions: [{ from: SETUP_FROM, blocks: [planBlock({ id: 'w', categoryId: 'wyklad', startMin: 17 * 60, durationMin: 90, fixed: true, origin: 'template' }), journaling], budgetMin: null, maxMin: null }]
    }
    // Monday „pytaj”, Tuesday „tak”, Wednesday „nie”, Thursday „pytaj”, Friday „tak”, the weekend „nie”.
    const changes = setup({ dayTypes: { zwykly: { sessions: ['ask', 'yes', 'no', 'ask', 'yes', 'no', 'no'] } } })
    const templates = [ordinary(), tueThu]
    const move = moveSessions(changes, templates, CUT)!
    const after = movedTemplates(templates, move)
    // Tuesday and Thursday: a tie – the template keeps Tuesday, a copy takes Thursday with „pytaj rano”.
    expect(after.find((t) => t.id === 'wt-czw')!.weekdays).toEqual([2])
    const thu = after.find((t) => t.id === 'wt-czw_4')!
    expect([thu.weekdays, thu.blockIdsOf, thu.name]).toEqual([[4], 'wt-czw', 'Wykłady (cz)'])
    expect(thu.versions.at(-1)!.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.ask])).toEqual([
      ['londyn', true],
      ['ny', true]
    ])
    // The default one makes Monday, Wednesday, Friday and the weekend: Monday „pytaj” and Friday „tak” are one each – the
    // default keeps the most (Wednesday with the weekend, „nie”), the others get copies.
    expect(move.made.map((t) => [t.id, t.weekdays])).toEqual([
      ['wt-czw_4', [4]],
      ['zwykly_1', [1]],
      ['zwykly_5', [5]],
      ['sesje-zjazd-zdalny', []]
    ])
    expect(after.find((t) => t.id === 'zwykly')!.versions.at(-1)!.blocks.some((b) => b.session)).toBe(false)
    expectSameDays({ changes, templates }, { changes: [...changes, move.change], templates: after }, CUT, 21)
  })

  it('dwa komputery: z tych samych plików te same rekordy i identyfikatory; drugi raz – nic', () => {
    const templates = [ordinary(), ...defaultTemplates().filter((t) => t.id !== 'zwykly')]
    const a = moveSessions(setup(), structuredClone(templates), CUT)!
    const b = moveSessions(setup(), structuredClone(templates), CUT)!
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    // The files as written (both computers write the same text – OneDrive's conflict copies join without a question).
    expect(movedTemplates(templates, b).map((t) => JSON.stringify(templateJson(t)))).toEqual(movedTemplates(templates, a).map((t) => JSON.stringify(templateJson(t))))
    // The change in the settings: the move is made – not again.
    const moved = [...setup(), a.change]
    expect(sessionsMoved(moved)).toBe(true)
    expect(moveSessions(moved, movedTemplates(templates, a), CUT)).toBeNull()
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

  it('dzień przeszły bez zmian: dzień sprzed przeniesienia ma te same bloki i ustawienia; zmiany przyszłego dnia kopii zostają', () => {
    const templates = [ordinary([journaling, planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })]), ...defaultTemplates().filter((t) => t.id !== 'zwykly')]
    const move = moveSessions(setup(), templates, CUT)!
    const after = movedTemplates(templates, move)
    const changes = [...setup(), move.change]
    for (let i = 1; i <= 14; i++) {
      const date = addDays(CUT, -i)
      for (const type of DAY_TYPES) {
        const file = dayFileFrom({ dayType: type }, date)
        const was = day(date, setup(), templates, file)
        const now = day(date, changes, after, file)
        expect({ ...now, templateId: null }).toEqual({ ...was, templateId: null })
      }
    }
    // A Saturday of the ordinary type after the move: the copy makes it with the ids the original gave – its cancel stays.
    const sat = '2026-10-31'
    const id = templateBlockId(sat, 'zwykly', 'an')
    const file = dayFileFrom({ dayType: 'zwykly', cancelled: [id] }, sat)
    const snap = day(sat, changes, after, file)
    expect(snap.templateId).toBe('zwykly_67')
    expect(snap.blocks.some((b) => b.id === id)).toBe(true)
    expect(dayPlan(snap, file).some((b) => b.id === id)).toBe(false)
    // Its attachments: the copy's own and its original's – those the block had before the split (`dayPlace` – `idsOf`).
    const block = snap.blocks.find((b) => b.id === id)!
    const place = { scope: 'day' as const, date: sat, templateId: 'zwykly_67', templateIds: after.map((t) => t.id), idsOf: { zwykly_67: 'zwykly' } }
    expect(ownersOf(block, place)).toEqual([
      { scope: 'day', date: sat, blockId: id },
      { scope: 'template', templateId: 'zwykly_67', blockId: 'an' },
      { scope: 'template', templateId: 'zwykly', blockId: 'an' }
    ])
    // The block taken out of the copy from tomorrow takes the attachment of its day with it (the day's id is the original's).
    const copy = after.find((t) => t.id === 'zwykly_67')!
    const without = { ...copy, versions: [...copy.versions, { ...copy.versions.at(-1)!, from: '2026-10-30', blocks: copy.versions.at(-1)!.blocks.filter((b) => b.id !== 'an') }] }
    const own = { id: 'a1', owner: { scope: 'day', date: sat, blockId: id }, removedAt: null } as unknown as Attachment
    expect(templateRemovalIds([own], 'zwykly_67', copy, without, '2026-10-30')).toEqual(['a1'])
  })

  it('starsza wersja: wpis sesji to stały blok swojej kategorii, każda sesja raz, blok „po sesji” za nią; pole zostaje w pliku po jej zapisie', () => {
    const templates = [ordinary(), ...defaultTemplates().filter((t) => t.id !== 'zwykly')]
    const move = moveSessions(setup(), templates, CUT)!
    const changes = [...setup(), move.change]
    // As an older version reads the files: the field „według czasu” is not in its model.
    const files = movedTemplates(templates, move).map((t) => templateJson(t))
    const older = files.map((raw) => {
      const t = templateFrom(raw)!
      return { ...t, versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.map(({ session: _s, ...b }) => b) })) }
    })
    // The layer of sessions is empty from the move – for any version.
    expect(settingsOn(changes, '2026-10-21').sessions).toEqual([])
    const wed = day('2026-10-21', changes, older)
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
    expectSameDays(before, { changes: rd.settings, templates }, '2026-10-19', 14)
  })
})
