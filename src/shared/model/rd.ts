/**
 * rd.json (spec „Pliki na OneDrive”): the shared settings with the dates they apply from, the shared settings that work
 * at once (the modules, the water reminder, the break and solitude suggestions), the names, colours and archive of
 * categories, and the people. Read tolerantly: a broken field falls back, unknown fields stay in the file (edits go
 * field by field through the queue, so two computers changing different things never meet).
 *
 * Lists of records with ids (settings changes, people) are lists of objects with `id`: the queue edits them item by
 * item (`#id` paths), so two computers adding different items merge without a question.
 */
import { BLOCK_COLORS } from '../theme'
import { DEFAULT_CATEGORIES } from './categories'
import { changeFrom, changeOrder, type SettingsChange } from './settings'
import { isIsoDate } from '../time/zone'

export const RD_SCHEMA = 1

/** The modules you switch on and off (spec „Moduły”): they work at once, all on at the start. */
export type ModuleId = 'energy' | 'requests' | 'projects' | 'game' | 'water'
export const MODULES: readonly ModuleId[] = ['energy', 'requests', 'projects', 'game', 'water']
export const MODULE_NAMES: Record<ModuleId, string> = {
  energy: 'Energia i sygnały',
  requests: 'Prośby',
  projects: 'Projekty',
  game: 'Gra',
  water: 'Przypomnienie o wodzie'
}

/** Shared settings without a date: they work from the moment you change them (spec „Macierz ustawień”). */
export interface GeneralSettings {
  modules: Record<ModuleId, boolean>
  /** The water reminder every this many minutes (at a transition after 2/3 of it). */
  waterEveryMin: number
  /** The break proposal after this much continuous work (0 = off), and the break's length. */
  breakAfterMin: number
  breakMin: number
  /** The solitude suggestion after contact longer than this (0 = off). */
  solitudeAfterMin: number
}

export const GENERAL_RANGES = {
  waterEveryMin: [15, 120],
  breakAfterMin: [30, 240],
  breakMin: [5, 60],
  solitudeAfterMin: [10, 180]
} as const

export const DEFAULT_GENERAL: GeneralSettings = {
  modules: { energy: true, requests: true, projects: true, game: true, water: true },
  waterEveryMin: 45,
  breakAfterMin: 90,
  breakMin: 15,
  solitudeAfterMin: 30
}

/** What a category is called and how it looks; its rules are dated settings (RulesSettings.categories). */
export interface CategoryMeta {
  name: string
  /** One of CATEGORY_COLORS; null: the colour of its class. */
  color: string | null
  archived: boolean
}

export interface Person {
  id: string
  name: string
  archived: boolean
}

export interface RdFile {
  schema: number
  settings: SettingsChange[]
  general: GeneralSettings
  categories: Record<string, CategoryMeta>
  people: Person[]
  /** The first computer's wizard finished (when, on which computer): the folder holds this app's data. */
  setup: { at: number; by: string } | null
  /**
   * The first day of the closing ritual (D320): the day the first version with its screen ran on any computer – written
   * once by the leader; earlier days close themselves „jak zapisano”. Null: none yet.
   */
  ritualFrom: string | null
  /**
   * The first day in the game (T509): the day after the first version with the game's screens ran on any computer –
   * written once by the leader; earlier days are outside the game. Null: no game yet.
   */
  gameFrom: string | null
}

/**
 * rd.json's days written once by the leader (D320, T509): the ritual's and the game's first day. Never taken away – also
 * not by a restore of an older rd.json (its version from before them lacks them).
 */
export const WRITE_ONCE_FIELDS = ['ritualFrom', 'gameFrom'] as const
export type WriteOnceField = (typeof WRITE_ONCE_FIELDS)[number]

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const intIn = (v: unknown, [min, max]: readonly [number, number], fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback

/** `breakAfterMin` and `solitudeAfterMin` take 0 for „off” besides their range. */
const intOrOff = (v: unknown, range: readonly [number, number], fallback: number): number => (v === 0 ? 0 : intIn(v, range, fallback))

export function generalFrom(v: unknown): GeneralSettings {
  const r = isPlain(v) ? v : {}
  const m = isPlain(r.modules) ? r.modules : {}
  const modules = Object.fromEntries(MODULES.map((id) => [id, typeof m[id] === 'boolean' ? (m[id] as boolean) : DEFAULT_GENERAL.modules[id]])) as Record<ModuleId, boolean>
  return {
    modules,
    waterEveryMin: intIn(r.waterEveryMin, GENERAL_RANGES.waterEveryMin, DEFAULT_GENERAL.waterEveryMin),
    breakAfterMin: intOrOff(r.breakAfterMin, GENERAL_RANGES.breakAfterMin, DEFAULT_GENERAL.breakAfterMin),
    breakMin: intIn(r.breakMin, GENERAL_RANGES.breakMin, DEFAULT_GENERAL.breakMin),
    solitudeAfterMin: intOrOff(r.solitudeAfterMin, GENERAL_RANGES.solitudeAfterMin, DEFAULT_GENERAL.solitudeAfterMin)
  }
}

/**
 * The palette of category colours: warm, muted hues that keep the text readable on a block (the contrast test goes
 * through each, theme.ts). The classes' own colours come first.
 */
export const CATEGORY_COLORS = BLOCK_COLORS

/** The colour of a class (praca – lampka, życie i opieka – lawenda, wolne – morski), as the bar and the icon (D225). */
export const CLASS_COLORS = { work: '#F2B66D', life: '#B49FCC', free: '#79AFAB' } as const

function categoriesFrom(v: unknown): Record<string, CategoryMeta> {
  const out: Record<string, CategoryMeta> = {}
  for (const c of DEFAULT_CATEGORIES) out[c.id] = { name: c.name, color: null, archived: false }
  if (!isPlain(v)) return out
  for (const [id, x] of Object.entries(v)) {
    if (!isPlain(x)) continue
    const before = out[id]
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim().slice(0, 60) : before?.name
    if (!name) continue
    out[id] = {
      name,
      color: typeof x.color === 'string' && (CATEGORY_COLORS as readonly string[]).includes(x.color) ? x.color : (before?.color ?? null),
      archived: x.archived === true
    }
  }
  return out
}

function peopleFrom(v: unknown): Person[] {
  const out: Person[] = []
  for (const x of Array.isArray(v) ? v : []) {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id || typeof x.name !== 'string' || !x.name.trim()) continue
    if (out.some((p) => p.id === x.id)) continue
    out.push({ id: x.id, name: x.name.trim().slice(0, 60), archived: x.archived === true })
  }
  return out
}

/** rd.json as read (missing: the defaults – the app never writes them unless you change something). */
export function rdFrom(v: unknown): RdFile {
  const r = isPlain(v) ? v : {}
  // A list of changes (E1), or a map by id.
  const rawChanges = Array.isArray(r.settings) ? r.settings : isPlain(r.settings) ? Object.entries(r.settings).map(([id, x]) => (isPlain(x) ? { id, ...x } : x)) : []
  const settings = rawChanges.map(changeFrom).filter((c): c is SettingsChange => !!c)
  settings.sort(changeOrder)
  const setup = isPlain(r.setup) && typeof r.setup.at === 'number' && typeof r.setup.by === 'string' ? { at: r.setup.at, by: r.setup.by } : null
  return {
    schema: typeof r.schema === 'number' && Number.isInteger(r.schema) ? r.schema : RD_SCHEMA,
    settings,
    general: generalFrom(r.general),
    categories: categoriesFrom(r.categories),
    people: peopleFrom(r.people),
    setup,
    ritualFrom: isIsoDate(r.ritualFrom) ? r.ritualFrom : null,
    gameFrom: isIsoDate(r.gameFrom) ? r.gameFrom : null
  }
}

/** The name of a category for the interface (an unknown id: the id is never shown – „kategoria usunięta”). */
export function categoryName(rd: Pick<RdFile, 'categories'>, id: string): string {
  return rd.categories[id]?.name ?? 'kategoria usunięta'
}

export function personName(rd: Pick<RdFile, 'people'>, id: string | null): string {
  if (!id) return 'osoba: ?'
  return rd.people.find((p) => p.id === id)?.name ?? 'osoba usunięta'
}
