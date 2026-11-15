/**
 * Block categories (spec „Kategorie”, „Koszty startowe kategorii”): every block has a category with a class (work, life
 * and care, free), costs per hour for the four pools and the properties the engine reads. Ids are stable; removing a
 * category archives it. The values are shared settings with a date they apply from (rd.json, spec „Macierz ustawień”).
 */

/** The three classes (spec „Klasy bloków”): only work sets the boundary and uses the work budget. */
export type BlockClass = 'work' | 'life' | 'free'

/** Where a block happens: at the computer, passively at the computer, away from it. */
export type Place = 'computer' | 'passive' | 'away'

/**
 * What a category means to the rules beyond its class: a session waits for „Zacznij” and has the session mode, a lecture
 * comes from the plan of lectures, regeneration and projects are the two kinds of free time, a request is a request.
 */
export type CategoryKind = 'session' | 'lecture' | 'remoteClass' | 'commute' | 'meal' | 'routine' | 'request' | 'regen' | 'project' | 'other'

/** Cost per hour for the cognitive, emotional, sensory and physical pool, −5…5 (spec „Model energii”; `body` – D520). */
export interface Costs {
  head: number
  emotions: number
  senses: number
  body: number
}

/** The four pools (spec „Pule”): „głowa”, „emocje”, „bodźce”, „ciało” (D520). */
export type Pool = keyof Costs
export const POOLS: readonly Pool[] = ['head', 'emotions', 'senses', 'body']
/** The letter of a pool wherever the interface abbreviates it (D500, D520, D524: G · E · B · C); in this order every text and drawing names the four. */
export const POOL_LETTER: Record<Pool, string> = { head: 'G', emotions: 'E', senses: 'B', body: 'C' }
/** A state of the four pools, 0–100. */
export type PoolValues = Record<Pool, number>

/**
 * The pools as a log of a version before the body (D520, ≤ 1.26) may hold them: the three first always, the body only from 1.27 on –
 * the answers of a check-in (`energy.checkin`), the state before an anchor (`before`) and the costs of an event (`block.start.planned`,
 * `block.cost`, `routine.cost`). Costs read through `startingBody` (T1520), the answers and `before` as the energy says (T1522, T1523).
 */
export type LoggedPools<T> = Omit<Record<Pool, T>, 'body'> & { body?: T }

export interface Variant {
  id: string
  name: string
  /** A variant may sit elsewhere (listening is passive, a game is at the computer). */
  place?: Place
  costs?: Costs
  /** Removed: out of the choice, kept in the history and the counters (spec „Usunięcie to archiwizacja”). */
  archived?: boolean
}

/** What the engine reads of a category – shared settings with a date (rd.json). */
export interface CategoryRules {
  cls: BlockClass
  kind: CategoryKind
  place: Place
  /** May run alongside another block („w tle”). */
  background: boolean
  /** Starts in the background unless placed otherwise (the lecture recording). */
  startsInBackground: boolean
  /** Variants never shorten nor move it. */
  protected: boolean
  noMoveTomorrow: boolean
  /** The computer does not sleep while it runs (spec „nie usypiaj komputera”). */
  noSleep: boolean
  /** Contact with people: a solitude suggestion after more than 30 min. */
  contact: boolean
  /** The class mode runs during the block. */
  classMode: boolean
  /** A background block that takes no regeneration away and counts only to the work budget (spec „nie przerywa regeneracji”). */
  keepsRegen: boolean
  /** Started after the first end of work it counts as a project (D195): learning, watching a lecture, journaling. */
  afterWorkAsProject: boolean
  costs: Costs
  variants: Variant[]
}

export interface Category extends CategoryRules {
  id: string
  name: string
  archived: boolean
}

const c = (head: number, emotions: number, senses: number, body: number): Costs => ({ head, emotions, senses, body })

const base: Omit<CategoryRules, 'cls' | 'kind' | 'place' | 'costs'> = {
  background: false,
  startsInBackground: false,
  protected: false,
  noMoveTomorrow: false,
  noSleep: false,
  contact: false,
  classMode: false,
  keepsRegen: false,
  afterWorkAsProject: false,
  variants: []
}

const cat = (id: string, name: string, rules: Partial<CategoryRules> & Pick<CategoryRules, 'cls' | 'kind' | 'place' | 'costs'>): Category => ({
  id,
  name,
  archived: false,
  ...base,
  ...rules
})

/** The starting categories (spec tables „Kategorie startowe” and „Koszty startowe kategorii”). */
export const DEFAULT_CATEGORIES: readonly Category[] = [
  cat('sesja', 'Sesja tradingowa', { cls: 'work', kind: 'session', place: 'computer', background: true, noSleep: true, costs: c(2, 2, 2, 0) }),
  cat('analiza', 'Analiza', { cls: 'work', kind: 'other', place: 'computer', costs: c(3, 1, 1, 0) }),
  cat('nauka', 'Nauka (NotebookLM)', {
    cls: 'work',
    kind: 'other',
    place: 'computer',
    afterWorkAsProject: true,
    costs: c(3, 0, 1, 0),
    variants: [{ id: 'sluchanie', name: 'Nauka — słuchanie', place: 'passive', costs: c(2, 0, 0, 0) }]
  }),
  cat('wyklad', 'Wykład online (nagrywanie)', {
    cls: 'work',
    kind: 'lecture',
    place: 'passive',
    background: true,
    startsInBackground: true,
    noSleep: true,
    keepsRegen: true,
    costs: c(1, 0, 1, 0)
  }),
  cat('ogladanie', 'Oglądanie wykładu', { cls: 'work', kind: 'other', place: 'passive', afterWorkAsProject: true, costs: c(2, 0, 1, 0) }),
  cat('zajecia-zdalne', 'Zajęcia zdalne', { cls: 'work', kind: 'remoteClass', place: 'passive', contact: true, classMode: true, costs: c(2, 2, 2, 0) }),
  cat('inne', 'Inne obowiązki', { cls: 'work', kind: 'other', place: 'computer', costs: c(1, 1, 1, 1) }),
  cat('posilek', 'Posiłek', { cls: 'life', kind: 'meal', place: 'away', protected: true, costs: c(0, 1, 1, 0) }),
  cat('rutyny', 'Rutyny i opieka nad zwierzętami', { cls: 'life', kind: 'routine', place: 'away', protected: true, noMoveTomorrow: true, costs: c(1, 0, 1, 1) }),
  cat('prosby', 'Prośby domowe', { cls: 'life', kind: 'request', place: 'away', contact: true, costs: c(1, 3, 2, 1) }),
  cat('dojazd', 'Dojazd, zajęcia stacjonarne', {
    cls: 'work',
    kind: 'commute',
    place: 'away',
    contact: true,
    costs: c(2, 4, 4, 1),
    variants: [
      { id: 'dojazd', name: 'Dojazd', costs: c(1, 2, 4, 1) },
      { id: 'zajecia', name: 'Zajęcia', costs: c(2, 4, 4, 1) }
    ]
  }),
  cat('regeneracja', 'Regeneracja', {
    cls: 'free',
    kind: 'regen',
    place: 'away',
    protected: true,
    costs: c(-1, -2, -3, -1),
    variants: [
      { id: 'cisza', name: 'Cisza, koc obciążeniowy, ciepłe światło', costs: c(-1, -2, -3, -1) },
      { id: 'spacer', name: 'Samotny spacer', costs: c(-1, -3, -2, 1) },
      { id: 'prysznic', name: 'Gorący prysznic', costs: c(0, -1, -3, -2) },
      { id: 'drzemka', name: 'Leżenie, drzemka', costs: c(-3, -1, -2, -3) },
      { id: 'przerwa-od-ekranu', name: 'Przerwa od ekranu', costs: c(-1, 0, -2, 0) },
      { id: 'gra', name: 'Gra, film', place: 'computer', costs: c(-1, -1, 0, 0) }
    ]
  }),
  cat('projekty', 'Projekty', { cls: 'free', kind: 'project', place: 'computer', costs: c(3, 0, 1, 0) }),
  cat('journaling', 'Journaling', { cls: 'work', kind: 'other', place: 'computer', afterWorkAsProject: true, costs: c(3, 1, 1, 0) }),
  cat('sprawy', 'Sprawy domowe', {
    cls: 'life',
    kind: 'other',
    place: 'away',
    costs: c(1, 1, 1, 1),
    variants: [{ id: 'przy-komputerze', name: 'Opłaty, zamówienia, wizyty', place: 'computer' }]
  })
]

/** The category id the session layer uses. */
export const SESSION_CATEGORY = 'sesja'
/** The analysis of the default Saturday template. */
export const ANALYSIS_CATEGORY = 'analiza'
export const LECTURE_CATEGORY = 'wyklad'
export const REMOTE_CLASS_CATEGORY = 'zajecia-zdalne'
export const COMMUTE_CATEGORY = 'dojazd'
export const REGEN_CATEGORY = 'regeneracja'
/** The costs of a request (spec: „Prośby domowe”, plus the cost of contact). */
export const REQUEST_CATEGORY = 'prosby'
export const PROJECT_CATEGORY = 'projekty'
export const OTHER_WORK_CATEGORY = 'inne'
/** The starting subcategory of the kind „rutyna” – the one a routine's cost (D512) stands before in the starting settings. */
export const ROUTINE_CATEGORY = 'rutyny'

/** The rules part of a category (what a day's snapshot keeps). */
export function rulesOf(cat: Category): CategoryRules {
  const { id: _id, name: _name, archived: _archived, ...rules } = cat
  return rules
}

/** Where a block of this category and variant sits. */
export function placeOf(rules: CategoryRules, variantId?: string | null): Place {
  return (variantId && rules.variants.find((v) => v.id === variantId)?.place) || rules.place
}

/** The costs of a block of this category and variant (a block may still carry its own). */
export function costsOf(rules: CategoryRules, variantId?: string | null): Costs {
  return (variantId && rules.variants.find((v) => v.id === variantId)?.costs) || rules.costs
}

/** Whether the variant has a cost of its own – `costsOf` gives it, not the category's (D510: „Jak wariant” on the tile's window). */
export function variantHasCosts(rules: CategoryRules, variantId?: string | null): boolean {
  return !!(variantId && rules.variants.find((v) => v.id === variantId)?.costs)
}

const STARTING = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]))

/** Whether the variant is one of the starting ones of its subcategory (D523: a variant of yours has no starting cost of the body – 0). */
export const isStartingVariant = (categoryId: string, variantId: string): boolean => !!STARTING.get(categoryId)?.variants.some((v) => v.id === variantId)

/**
 * The body's cost (D520) of a cost written before the body (≤ 1.26: three pools – an own cost of a block, a routine's, a start's, a change's;
 * T1520, T1536): the starting cost (D523) of its subcategory and variant; a subcategory or a variant not among the starting ones (yours, or
 * none known) – 0, never its subcategory's (D523, as the settings read it – T1521); a routine's – of the starting subcategory of routines
 * (`ROUTINE_CATEGORY`). By the ids only (`Map` – an id such as „constructor” is none): the reading of a file or an event knows no settings,
 * and a day's snapshot keeps the costs of its blocks as they were when it was made.
 */
export function startingBody(categoryId: string | null | undefined, variantId?: string | null): number {
  const c = categoryId != null ? STARTING.get(categoryId) : undefined
  if (!c || (variantId && !isStartingVariant(c.id, variantId))) return 0
  return costsOf(c, variantId).body
}
