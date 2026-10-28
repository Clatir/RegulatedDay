/**
 * Fields and values of records in the interface's own words (spec „Historia i konflikty: widok pokazuje nazwy pól
 * i wartości tak jak w interfejsie, nigdy klucze, identyfikatory, UTC ani milisekundy”): the history's differences and
 * the questions of the queue use them.
 */
import { classify } from '@shared/data/paths'
import { countLabel, durationLabel, logicalClock, plDate } from '@shared/format'
import { fieldByKey } from '@shared/model/fields'
import { categoryName, MODULE_NAMES, personName, type ModuleId, type RdFile } from '@shared/model/rd'
import { DAY_TYPE_NAMES, type DayTypeId } from '@shared/model/settings'

export interface TextNames {
  rd: RdFile
  /** A block's name by its id on a day (or in a template). */
  blockName?: (id: string) => string | null
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const BLOCK_FIELDS: Record<string, string> = {
  categoryId: 'kategoria',
  variantId: 'wariant',
  startMin: 'początek',
  anchor: 'po bloku',
  durationMin: 'długość',
  fixed: 'rodzaj',
  background: 'miejsce',
  tag: 'oznaczenie',
  waitUntilMin: 'czeka do',
  note: 'notatka',
  recorder: 'komputer nagrywający',
  moves: 'licznik przeniesień',
  requests: 'prośby',
  routine: 'rutyna',
  movedFrom: 'przeniesiony z',
  byVariant: 'zmieniony wariantem'
}

const REQUEST_FIELDS: Record<string, string> = { person: 'osoba', estimateMin: 'szacunek', note: 'notatka', state: 'stan', day: 'dzień', block: 'blok' }
const ROUTINE_FIELDS: Record<string, string> = { name: 'nazwa', normal: 'kroki (zwykła)', worse: 'kroki (na gorsze dni)', archived: 'archiwum' }
const STATES: Record<string, string> = { queued: 'w kolejce', planned: 'w planie', done: 'zrobiona', dropped: 'porzucona' }

/** A value as shown: minutes and times as the fields show them, ids as names, objects briefly. */
export function valueText(key: string | undefined, v: unknown, n: TextNames): string {
  if (v === undefined || v === null || v === '') return '—'
  if (typeof v === 'boolean') {
    if (key === 'fixed') return v ? 'stały' : 'elastyczny'
    if (key === 'background') return v ? 'w tle' : 'pierwszy plan'
    return v ? 'tak' : 'nie'
  }
  if (typeof v === 'number') {
    if (key === 'startMin' || key === 'waitUntilMin' || key === 'wakeMin' || key === 'maxMin' || key === 'bedtimeMin') return logicalClock(v)
    if (key && /Min$/.test(key)) return durationLabel(v)
    if (key === 'savedAt' || key === 'createdAt' || key === 'at') return new Date(v).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })
    return String(v)
  }
  if (typeof v === 'string') {
    if (key === 'categoryId') return categoryName(n.rd, v)
    if (key === 'person') return personName(n.rd, v)
    if (key === 'dayType') return DAY_TYPE_NAMES[v as DayTypeId] ?? v
    if (key === 'state') return STATES[v] ?? v
    if (key === 'tag') return v === 'secondShift' ? 'druga zmiana' : v === 'weeklyAnalysis' ? 'analiza tygodniowa' : v
    if (key === 'anchor' || key === 'block') return n.blockName?.(v) ?? 'inny blok'
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return plDate(v)
    if (key === 'variantId' || key === 'routine' || key === 'recorder' || key === 'id') return 'wybrany'
    return v.length > 80 ? `${v.slice(0, 80)}…` : v
  }
  if (Array.isArray(v)) {
    if (!v.length) return 'brak'
    // Blocks of a day or a template: by their names – a count says nothing of which one changed (A6-20).
    if (v.every((x) => isPlain(x) && typeof x.categoryId === 'string')) {
      const names = v.slice(0, 3).map((x) => valueText(key, x, n))
      return v.length > 3 ? `${names.join(', ')} i ${countLabel(v.length - 3, 'inny', 'inne', 'innych')}` : names.join(', ')
    }
    return countLabel(v.length, 'pozycja', 'pozycje', 'pozycji')
  }
  if (isPlain(v)) {
    if (typeof v.categoryId === 'string') {
      const start = typeof v.startMin === 'number' ? ` ${logicalClock(v.startMin)}` : ''
      const dur = typeof v.durationMin === 'number' ? `, ${durationLabel(v.durationMin)}` : ''
      return `${categoryName(n.rd, v.categoryId)}${start}${dur}`
    }
    if (typeof v.name === 'string') return v.name
    return 'zmienione ustawienia'
  }
  return String(v)
}

/** A field of a record (its path) as the interface names it. */
export function fieldText(rel: string, path: readonly string[], n: TextNames): string {
  const c = classify(rel)
  const kind = c?.kind
  const [a, b, ...rest] = path
  const blockPart = (id: string | undefined, field: string | undefined) => {
    const name = id ? (n.blockName?.(id.replace(/^#/, '')) ?? 'blok') : 'blok'
    return field ? `${name}: ${BLOCK_FIELDS[field] ?? 'inne pole'}` : name
  }
  if (kind === 'day') {
    if (a === 'blocks') return blockPart(b, rest[0])
    if (a === 'dayType') return 'typ dnia'
    if (a === 'wakeMin') return 'pobudka dnia'
    if (a === 'cancelled') return b ? `${blockPart(b, undefined)}: odwołany` : 'odwołane bloki'
    if (a === 'movedTo') return b ? `${blockPart(b, undefined)}: przeniesiony na` : 'przeniesione bloki'
    if (a === 'sessions') return 'odpowiedzi warstwy sesji'
    if (a === 'asked') return 'pytania tego dnia'
    return 'inne pole dnia'
  }
  if (kind === 'template') {
    if (a === 'name') return 'nazwa szablonu'
    if (a === 'weekdays') return 'dni tygodnia'
    if (a === 'dayType') return 'typ dnia'
    if (a === 'archived') return 'archiwum'
    if (a === 'versions') return b ? `wersja od ${plDate(b)}${rest[0] === 'blocks' ? `: ${blockPart(rest[1], rest[2])}` : rest[0] === 'budgetMin' ? ': budżet' : rest[0] === 'maxMin' ? ': maksimum' : ''}` : 'wersje'
    return 'inne pole szablonu'
  }
  if (kind === 'request') return REQUEST_FIELDS[a ?? ''] ?? 'inne pole prośby'
  if (kind === 'routine') return ROUTINE_FIELDS[a ?? ''] ?? 'inne pole rutyny'
  if (kind === 'schedule') return a === 'name' ? 'nazwa' : a === 'weekday' ? 'dzień tygodnia' : a === 'startMin' ? 'godzina' : a === 'durationMin' ? 'długość' : a === 'from' ? 'od' : a === 'to' ? 'do' : 'inne pole wykładu'
  if (kind === 'settings') {
    if (a === 'people') return b ? `osoba ${n.rd.people.find((p) => `#${p.id}` === b)?.name ?? ''}`.trim() : 'osoby'
    if (a === 'categories') return b ? `kategoria ${categoryName(n.rd, b)}${rest[0] === 'name' ? ': nazwa' : rest[0] === 'color' ? ': kolor' : rest[0] === 'archived' ? ': archiwum' : ''}` : 'kategorie'
    if (a === 'general') {
      if (b === 'modules') return rest[0] ? `moduł ${MODULE_NAMES[rest[0] as ModuleId] ?? ''}`.trim() : 'moduły'
      return fieldByKey(b ?? '')?.label ?? 'ustawienie'
    }
    if (a === 'settings') return 'zmiana ustawień'
    return 'inne ustawienie'
  }
  return 'pole'
}

/** The last key of a path that names a value (for valueText). */
export function keyOf(path: readonly string[]): string | undefined {
  for (let i = path.length - 1; i >= 0; i--) if (!path[i]!.startsWith('#')) return path[i]
  return undefined
}
