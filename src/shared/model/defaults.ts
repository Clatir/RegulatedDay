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
import { planBlock, type LectureSeries, type PlanBlock, type Template, type TemplateVersion } from './plan'
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

/** A template as written: its versions as a map by the date each applies from (one version per date). */
export function templateJson(t: Template): RawRecord {
  return {
    schema: 1,
    id: t.id,
    name: t.name,
    dayType: t.dayType,
    weekdays: t.weekdays,
    archived: t.archived,
    versions: Object.fromEntries(t.versions.map((v) => [v.from, { blocks: v.blocks.map((b) => ({ ...b })), budgetMin: v.budgetMin, maxMin: v.maxMin }]))
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
