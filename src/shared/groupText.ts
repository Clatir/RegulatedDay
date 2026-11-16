/**
 * The words of the line after a change of a selection (D529, D530, D531): „Zmieniono 4 bloki · pominięto 2: zaczęty, sesja · najniższa
 * energia 52 → 44”, with „Cofnij” as a button of its own beside. Polish plurals of the things a selection holds (blocks, cases, days).
 * Pure – the screens give the counts and the reasons.
 */
import { countLabel, plural } from './format'

/** What a selection holds. */
export type GroupKind = 'block' | 'case' | 'day'

interface Noun {
  one: string
  few: string
  many: string
  /** „zmieniony / zmieniona”, „został / została” – the gender of the noun (m, f). */
  feminine: boolean
}

const NOUNS: Record<GroupKind, Noun> = {
  block: { one: 'blok', few: 'bloki', many: 'bloków', feminine: false },
  case: { one: 'sprawa', few: 'sprawy', many: 'spraw', feminine: true },
  day: { one: 'dzień', few: 'dni', many: 'dni', feminine: false }
}

/** „1 blok”, „3 bloki”, „5 bloków” (and the cases, the days). */
export const groupCount = (n: number, kind: GroupKind = 'block'): string => countLabel(n, NOUNS[kind].one, NOUNS[kind].few, NOUNS[kind].many)

/** The verbs of the line (impersonal, as „Przesunięto N bloków”). */
export const VERB = { changed: 'Zmieniono', moved: 'Przeniesiono', planned: 'Zaplanowano', removed: 'Usunięto', copied: 'Skopiowano' } as const

/** What the line says besides the count. */
export interface GroupLineParts {
  /** Default „Zmieniono”. */
  verb?: string
  /** How many elements the change took. */
  n: number
  kind?: GroupKind
  /** One reason per element left out (D529: „zaczęty”, „sesja”); the line says how many and the reasons once each, in order of first appearance. */
  skipped?: readonly string[]
  /** One reason per element that stayed where it was (D531: „już trwa”): „1 został – już trwa”. */
  stayed?: readonly string[]
  /** The lowest energy of the day before and after (D529) – only when the change touched a day with a forecast. */
  energy?: { from: number; to: number } | null
  /** The selection held blocks of a series: they changed as „Tylko to” (D529). */
  series?: boolean
}

const unique = (xs: readonly string[]): string[] => [...new Set(xs)]

/** „pominięto 2: zaczęty, sesja”; null for none. */
export const skippedText = (reasons: readonly string[]): string | null => (reasons.length ? `pominięto ${reasons.length}: ${unique(reasons).join(', ')}` : null)

/** „1 został – już trwa”, „2 zostały – już trwa, zaparkowany” (blocks: D531), „1 została – …” for a case; null for none. */
export function stayedText(reasons: readonly string[], kind: GroupKind = 'block'): string | null {
  if (!reasons.length) return null
  const n = reasons.length
  const verb = NOUNS[kind].feminine ? plural(n, 'została', 'zostały', 'zostało') : plural(n, 'został', 'zostały', 'zostało')
  return `${n} ${verb} – ${unique(reasons).join(', ')}`
}

/** „najniższa energia 52 → 44”. */
export const energyChangeText = (from: number, to: number): string => `najniższa energia ${Math.round(from)} → ${Math.round(to)}`

/** What a change of blocks of a series says (D529). */
export const SERIES_NOTE = 'bloki serii – tylko te dni'

/** The text of the line without „Cofnij”: the parts joined with „ · ”. */
export function groupLineText(l: GroupLineParts): string {
  const parts = [`${l.verb ?? VERB.changed} ${groupCount(l.n, l.kind)}`]
  const skipped = skippedText(l.skipped ?? [])
  if (skipped) parts.push(skipped)
  const stayed = stayedText(l.stayed ?? [], l.kind)
  if (stayed) parts.push(stayed)
  if (l.energy && Math.round(l.energy.from) !== Math.round(l.energy.to)) parts.push(energyChangeText(l.energy.from, l.energy.to))
  if (l.series) parts.push(SERIES_NOTE)
  return parts.join(' · ')
}

/**
 * The message of a „Cofnij” that left elements as they are because they changed since (D529, D313): „2 bloki zmienione od tego czasu –
 * zostały”.
 */
export function keptText(n: number, kind: GroupKind = 'block'): string {
  const noun = NOUNS[kind]
  const changed = noun.feminine ? plural(n, 'zmieniona', 'zmienione', 'zmienionych') : plural(n, 'zmieniony', 'zmienione', 'zmienionych')
  const stayed = noun.feminine ? plural(n, 'została', 'zostały', 'zostało') : plural(n, 'został', 'zostały', 'zostało')
  return `${groupCount(n, kind)} ${changed} od tego czasu – ${stayed}`
}
