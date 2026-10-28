/**
 * What the first computer's wizard writes (spec „Kreator pierwszego komputera”): the settings you chose as one change of
 * rd.json in force from the start (the fields that differ from the starting values – a later version's new defaults
 * still reach the rest), the shared settings that work at once, the people, the default templates (the ordinary day with
 * the second shift 20:00–21:00, Saturday with the weekly analysis 9:00–10:00 waiting until 15:00, D226), the plan of
 * lectures and the days marked in the calendar. Nothing is written before „Zakończ”.
 */
import type { RawRecord } from '../api'
import { paths } from '../data/paths'
import { ANALYSIS_CATEGORY, SESSION_CATEGORY } from './categories'
import { planBlock, templateFrom, type LectureSeries, type PlanBlock, type Template, type TemplateVersion } from './plan'
import { RD_SCHEMA, type CategoryMeta, type GeneralSettings, type Person } from './rd'
import { DEFAULT_SETTINGS, type DayTypeId, type RulesSettings } from './settings'

/** The wizard's settings apply from the start (every day before the first one too: the day of the wizard is outside the game). */
export const SETUP_FROM = '2020-01-01'
export const SETUP_CHANGE_ID = 'kreator'

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The fields of `next` that differ from `base`, nested like them; a list or a value as a whole. */
export function settingsPatch(base: unknown, next: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!isPlain(base) || !isPlain(next)) return out
  for (const [k, v] of Object.entries(next)) {
    const b = base[k]
    if (isPlain(v) && isPlain(b)) {
      const inner = settingsPatch(b, v)
      if (Object.keys(inner).length) out[k] = inner
    } else if (JSON.stringify(v) !== JSON.stringify(b)) out[k] = v
  }
  return out
}

export const SECOND_SHIFT_BLOCK = 'druga-zmiana'
export const WEEKLY_ANALYSIS_BLOCK = 'analiza-tygodniowa'

/** The default templates: the ordinary day (with the second shift) and Saturday (with the weekly analysis). */
export function defaultTemplates(secondShift: { on: boolean; startMin: number; durationMin: number } = { on: true, startMin: 20 * 60, durationMin: 60 }): Template[] {
  const ordinary: PlanBlock[] = secondShift.on
    ? [planBlock({ id: SECOND_SHIFT_BLOCK, categoryId: SESSION_CATEGORY, startMin: secondShift.startMin, durationMin: secondShift.durationMin, fixed: true, tag: 'secondShift', origin: 'template' })]
    : []
  const saturday: PlanBlock[] = [
    planBlock({ id: WEEKLY_ANALYSIS_BLOCK, categoryId: ANALYSIS_CATEGORY, startMin: 9 * 60, durationMin: 60, tag: 'weeklyAnalysis', waitUntilMin: 15 * 60, origin: 'template' })
  ]
  const v = (blocks: PlanBlock[]): TemplateVersion => ({ from: SETUP_FROM, blocks, budgetMin: null, maxMin: null })
  return [
    { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [v(ordinary)], archived: false },
    { id: 'sobota', name: 'Sobota', dayType: 'weekend', weekdays: [6], versions: [v(saturday)], archived: false }
  ]
}

/**
 * A template as written: its versions as a map by the date each applies from (one version per date). Over the file as it
 * was (`before`) every level keeps what this version cannot show (spec „nieznane wartości zachowywane”, A3-04): unknown
 * fields of the template, of a version and of a block, and versions and blocks this version cannot read at all – only
 * what the model holds is written over, and only what it removed is gone.
 */
export function templateJson(t: Template, before?: RawRecord | null): RawRecord {
  const read = before ? templateFrom(before) : null
  const rawVersions = new Map<string, Record<string, unknown>>()
  const list = Array.isArray(before?.versions) ? before.versions : isPlain(before?.versions) ? Object.entries(before.versions).map(([from, x]) => (isPlain(x) ? { from, ...x } : x)) : []
  for (const x of list) if (isPlain(x) && typeof x.from === 'string' && !rawVersions.has(x.from)) rawVersions.set(x.from, x)
  const versions: Record<string, unknown> = {}
  for (const [from, raw] of rawVersions) {
    if (read?.versions.some((v) => v.from === from)) continue
    const { from: _f, ...rest } = raw
    versions[from] = rest
  }
  for (const v of t.versions) {
    // A new version (from tomorrow, a review's) is a copy of the one in force at its date: what that one keeps of a newer
    // version goes on in it too.
    const source = rawVersions.has(v.from) ? v.from : [...rawVersions.keys()].filter((from) => from < v.from).sort().at(-1)
    const { from: _f, ...raw } = (source != null ? rawVersions.get(source) : undefined) ?? {}
    const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks.filter(isPlain) : isPlain(raw.blocks) ? Object.values(raw.blocks).filter(isPlain) : []
    const readIds = new Set(read?.versions.find((x) => x.from === source)?.blocks.map((b) => b.id) ?? [])
    const unreadable = rawBlocks.filter((x) => !(typeof x.id === 'string' && readIds.has(x.id)) && !v.blocks.some((b) => b.id === x.id))
    const blocks = [...v.blocks.map((b) => ({ ...(rawBlocks.find((x) => x.id === b.id) ?? {}), ...b })), ...unreadable]
    versions[v.from] = { ...raw, blocks, budgetMin: v.budgetMin, maxMin: v.maxMin }
  }
  return {
    ...(before ?? {}),
    schema: 1,
    id: t.id,
    name: t.name,
    dayType: t.dayType,
    weekdays: t.weekdays,
    archived: t.archived,
    versions
  }
}

export function lectureJson(s: LectureSeries): RawRecord {
  return { schema: 1, ...s }
}

export interface FirstSetup {
  settings: RulesSettings
  general: GeneralSettings
  categories: Record<string, CategoryMeta>
  people: Person[]
  templates: Template[]
  lectures: LectureSeries[]
  /** Days marked in the calendar (a „zjazd”, a free day). */
  days: Record<string, DayTypeId>
}

/** The records the first computer creates at „Zakończ”. */
export function firstComputerRecords(s: FirstSetup, at: number, computer: string): Array<{ rel: string; value: RawRecord }> {
  const rd: RawRecord = {
    schema: RD_SCHEMA,
    settings: [{ id: SETUP_CHANGE_ID, from: SETUP_FROM, at: null, made: at, patch: settingsPatch(DEFAULT_SETTINGS, s.settings) }],
    general: s.general,
    categories: s.categories,
    people: s.people,
    setup: { at, by: computer }
  }
  return [
    { rel: paths.settings, value: rd },
    ...s.templates.map((t) => ({ rel: paths.record('template', t.id), value: templateJson(t) })),
    ...s.lectures.map((l) => ({ rel: paths.record('schedule', l.id), value: lectureJson(l) })),
    ...Object.entries(s.days).map(([date, dayType]) => ({ rel: paths.day(date), value: { schema: 1, date, dayType } as RawRecord }))
  ]
}
