/**
 * Block categories (spec „Kategorie”, „Koszty startowe kategorii”): every block has a category with a class (work, life
 * and care, free), costs per hour for the three pools and the properties the engine reads. Ids are stable; removing a
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

/** Cost per hour for the cognitive, emotional and sensory pool, −5…5 (spec „Model energii”). */
export interface Costs {
  head: number
  emotions: number
  senses: number
}

export interface Variant {
  id: string
  name: string
  /** A variant may sit elsewhere (listening is passive, a game is at the computer). */
  place?: Place
  costs?: Costs
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

const c = (head: number, emotions: number, senses: number): Costs => ({ head, emotions, senses })

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
  cat('sesja', 'Sesja tradingowa', { cls: 'work', kind: 'session', place: 'computer', background: true, noSleep: true, costs: c(2, 2, 2) }),
  cat('analiza', 'Analiza', { cls: 'work', kind: 'other', place: 'computer', costs: c(3, 1, 1) }),
  cat('nauka', 'Nauka (NotebookLM)', {
    cls: 'work',
    kind: 'other',
    place: 'computer',
    afterWorkAsProject: true,
    costs: c(3, 0, 1),
    variants: [{ id: 'sluchanie', name: 'Nauka — słuchanie', place: 'passive', costs: c(2, 0, 0) }]
  }),
  cat('wyklad', 'Wykład online (nagrywanie)', {
    cls: 'work',
    kind: 'lecture',
    place: 'passive',
    background: true,
    startsInBackground: true,
    noSleep: true,
    keepsRegen: true,
    costs: c(1, 0, 1)
  }),
  cat('ogladanie', 'Oglądanie wykładu', { cls: 'work', kind: 'other', place: 'passive', afterWorkAsProject: true, costs: c(2, 0, 1) }),
  cat('zajecia-zdalne', 'Zajęcia zdalne', { cls: 'work', kind: 'remoteClass', place: 'passive', contact: true, classMode: true, costs: c(2, 2, 2) }),
  cat('inne', 'Inne obowiązki', { cls: 'work', kind: 'other', place: 'computer', costs: c(1, 1, 1) }),
  cat('posilek', 'Posiłek', { cls: 'life', kind: 'meal', place: 'away', protected: true, costs: c(0, 1, 1) }),
  cat('rutyny', 'Rutyny i opieka nad zwierzętami', { cls: 'life', kind: 'routine', place: 'away', protected: true, noMoveTomorrow: true, costs: c(1, 0, 1) }),
  cat('prosby', 'Prośby domowe', { cls: 'life', kind: 'request', place: 'away', contact: true, costs: c(1, 3, 2) }),
  cat('dojazd', 'Dojazd, zajęcia stacjonarne', {
    cls: 'work',
    kind: 'commute',
    place: 'away',
    contact: true,
    costs: c(2, 4, 4),
    variants: [
      { id: 'dojazd', name: 'Dojazd', costs: c(1, 2, 4) },
      { id: 'zajecia', name: 'Zajęcia', costs: c(2, 4, 4) }
    ]
  }),
  cat('regeneracja', 'Regeneracja', {
    cls: 'free',
    kind: 'regen',
    place: 'away',
    protected: true,
    costs: c(-1, -2, -3),
    variants: [
      { id: 'cisza', name: 'Cisza, koc obciążeniowy, ciepłe światło', costs: c(-1, -2, -3) },
      { id: 'spacer', name: 'Samotny spacer', costs: c(-1, -3, -2) },
      { id: 'prysznic', name: 'Gorący prysznic', costs: c(0, -1, -3) },
      { id: 'drzemka', name: 'Leżenie, drzemka', costs: c(-3, -1, -2) },
      { id: 'przerwa-od-ekranu', name: 'Przerwa od ekranu', costs: c(-1, 0, -2) },
      { id: 'gra', name: 'Gra, film', place: 'computer', costs: c(-1, -1, 0) }
    ]
  }),
  cat('projekty', 'Projekty', { cls: 'free', kind: 'project', place: 'computer', costs: c(3, 0, 1) }),
  cat('journaling', 'Journaling', { cls: 'work', kind: 'other', place: 'computer', afterWorkAsProject: true, costs: c(3, 1, 1) }),
  cat('sprawy', 'Sprawy domowe', {
    cls: 'life',
    kind: 'other',
    place: 'away',
    costs: c(1, 1, 1),
    variants: [{ id: 'przy-komputerze', name: 'Opłaty, zamówienia, wizyty', place: 'computer' }]
  })
]

/** The category id the session layer and the second shift use. */
export const SESSION_CATEGORY = 'sesja'
export const LECTURE_CATEGORY = 'wyklad'
export const REMOTE_CLASS_CATEGORY = 'zajecia-zdalne'
export const COMMUTE_CATEGORY = 'dojazd'
export const REGEN_CATEGORY = 'regeneracja'
export const PROJECT_CATEGORY = 'projekty'
export const OTHER_WORK_CATEGORY = 'inne'

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
