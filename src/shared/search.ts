/**
 * The global search (Ctrl K, D387, T650): pure matching and ranking. Text is folded (lower case, no diacritics – „ł” by
 * hand, it has no decomposition), cut into words, and every typed word must be the beginning of some word of the record
 * (no typos). Highlights are ranges in the ORIGINAL text, never in the folded one. Blocks go today first, then the coming
 * days from the nearest, then the past from the newest; every group shows five results and counts the rest.
 */

export type Range = [number, number]

export type SearchKind = 'command' | 'screen' | 'setting' | 'category' | 'block' | 'allDay' | 'template' | 'templateBlock' | 'request' | 'routine'

/** One thing that can be found. `title` and `text` are shown (and searched), `keys` only searched, `hint` only shown. */
export interface SearchRecord {
  kind: SearchKind
  /** Unique within its kind (a block: the block's id with `date`; a template's block: the block's id with `parent`). */
  id: string
  /** A block's day. */
  date?: string
  /** A template block's template. */
  parent?: string
  title: string
  /** A note, the steps of a routine …: searched, shown as a fragment with the phrase marked. */
  text?: string
  keys?: string
  hint?: string
}

export type GroupId = 'command' | 'screen' | 'category' | 'block' | 'allDay' | 'template' | 'request' | 'routine'

/** The groups in the order they are shown. */
export const GROUPS: ReadonlyArray<{ id: GroupId; label: string; kinds: readonly SearchKind[] }> = [
  { id: 'command', label: 'Polecenia', kinds: ['command'] },
  { id: 'screen', label: 'Ekrany i ustawienia', kinds: ['screen', 'setting'] },
  { id: 'category', label: 'Kategorie', kinds: ['category'] },
  { id: 'block', label: 'Bloki', kinds: ['block'] },
  { id: 'allDay', label: 'Wydarzenia', kinds: ['allDay'] },
  { id: 'template', label: 'Szablony', kinds: ['template', 'templateBlock'] },
  { id: 'request', label: 'Prośby', kinds: ['request'] },
  { id: 'routine', label: 'Rutyny', kinds: ['routine'] }
]

export const GROUP_SIZE = 5
/** The longest fragment of a note shown, and how much of the text before the first mark it keeps. */
export const SNIPPET_MAX = 90
const SNIPPET_LEAD = 30
export const RECENT_MAX = 5

/** The stable key of a record (the last chosen ones are remembered by it). */
export const recordKey = (r: SearchRecord): string => [r.kind, r.parent ?? '', r.date ?? '', r.id].join(':')

const folded = new Map<string, string>()

/** One code point folded: lower case, without diacritics, „ł” → „l”; a combining mark gives nothing. */
function foldChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (ch.length === 1 && code < 128) return code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : ch
  let out = folded.get(ch)
  if (out === undefined) {
    out = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ł/g, 'l')
    folded.set(ch, out)
  }
  return out
}

export interface Folded {
  text: string
  /** For every code unit of `text`: where it starts and ends in the original (marks after it included). */
  from: number[]
  to: number[]
}

/** The text folded, with where every folded code unit is in the original (for the highlights). */
export function fold(text: string): Folded {
  let out = ''
  const from: number[] = []
  const to: number[] = []
  let i = 0
  for (const ch of text) {
    const start = i
    i += ch.length
    const f = foldChar(ch)
    if (!f) {
      // A combining mark: the letter before it takes it into its range.
      if (to.length) to[to.length - 1] = i
      continue
    }
    out += f
    for (let k = 0; k < f.length; k++) {
      from.push(start)
      to.push(i)
    }
  }
  return { text: out, from, to }
}

/** The text folded, nothing more (the words of an index). */
function foldText(text: string): string {
  let out = ''
  for (const ch of text) out += foldChar(ch)
  return out
}

const WORD = /[\p{L}\p{N}]+/gu

/** The words of folded text with where each is in it. */
function wordSpans(text: string): Array<{ word: string; start: number }> {
  const out: Array<{ word: string; start: number }> = []
  for (const m of text.matchAll(WORD)) out.push({ word: m[0], start: m.index })
  return out
}

const wordsOf = (text: string | undefined): string[] => (text ? wordSpans(foldText(text)).map((w) => w.word) : [])

/** The words of a typed query (folded, distinct). Empty: nothing to search. */
export function queryWords(query: string): string[] {
  return [...new Set(wordSpans(foldText(query)).map((w) => w.word))]
}

/** Every typed word is the beginning of some word of the list. */
const startsAll = (qw: readonly string[], words: readonly string[]): boolean => qw.length > 0 && qw.every((q) => words.some((w) => w.startsWith(q)))

/** The record answers the query: every typed word begins a word of its title, text or keys. */
export function matchesQuery(qw: readonly string[], r: Pick<SearchRecord, 'title' | 'text' | 'keys'>): boolean {
  return startsAll(qw, [...wordsOf(r.title), ...wordsOf(r.text), ...wordsOf(r.keys)])
}

/** The marks of the typed words in the original text (merged where they touch). */
export function highlightRanges(text: string, qw: readonly string[]): Range[] {
  if (!qw.length || !text) return []
  const f = fold(text)
  const found: Range[] = []
  for (const { word, start } of wordSpans(f.text)) {
    let len = 0
    for (const q of qw) if (word.startsWith(q) && q.length > len) len = q.length
    if (len) found.push([f.from[start]!, f.to[start + len - 1]!])
  }
  found.sort((a, b) => a[0] - b[0])
  const out: Range[] = []
  for (const r of found) {
    const last = out.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** A fragment of a note around the first mark, with the marks in the fragment's own text; null – the note has none. */
export function snippetOf(text: string, qw: readonly string[], max = SNIPPET_MAX): { text: string; ranges: Range[] } | null {
  const ranges = highlightRanges(text, qw)
  if (!ranges.length) return null
  if (text.length <= max) return { text, ranges }
  const first = ranges[0]!
  let start = Math.max(0, first[0] - SNIPPET_LEAD)
  if (start > 0) {
    // From a word's beginning, not from its middle.
    const gap = text.slice(start, first[0]).search(/\s/)
    if (gap >= 0) start += gap + 1
  }
  let end = Math.min(text.length, start + max)
  if (end < text.length) {
    let cut = end
    while (cut > first[1] && !/\s/.test(text[cut]!)) cut--
    if (cut > first[1]) end = cut
  }
  const lead = start > 0 ? 1 : 0
  const inside: Range[] = []
  for (const [a, b] of ranges) {
    const x = Math.max(a, start)
    const y = Math.min(b, end)
    if (x < y) inside.push([x - start + lead, y - start + lead])
  }
  return { text: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`, ranges: inside }
}

/** What to show of one result: the marks in its title and the fragment of its text. */
export function hitView(r: Pick<SearchRecord, 'title' | 'text'>, qw: readonly string[]): { title: Range[]; snippet: { text: string; ranges: Range[] } | null } {
  return { title: highlightRanges(r.title, qw), snippet: r.text ? snippetOf(r.text, qw) : null }
}

/** Today first, then the coming days from the nearest, then the past from the newest. */
export function compareDays(a: string, b: string, today: string): number {
  const rank = (d: string) => (d === today ? 0 : d > today ? 1 : 2)
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra - rb
  if (a === b) return 0
  return ra === 1 ? (a < b ? -1 : 1) : a < b ? 1 : -1
}

export interface SearchHit {
  record: SearchRecord
}

export interface SearchGroup {
  id: GroupId
  label: string
  hits: SearchHit[]
}

interface Indexed {
  record: SearchRecord
  title: string[]
  all: string[]
}

/** The records with their words folded once – a query is only a test of prefixes then. */
export function buildIndex(records: readonly SearchRecord[]): Indexed[] {
  return records.map((record) => {
    const title = wordsOf(record.title)
    return { record, title, all: [...title, ...wordsOf(record.text), ...wordsOf(record.keys)] }
  })
}

const groupOf = (kind: SearchKind): GroupId => GROUPS.find((g) => g.kinds.includes(kind))!.id

/** The index searched: groups with hits only, each in its order (blocks by day, the rest title first, then as given). */
export function searchIndex(index: readonly Indexed[], query: string, today: string): SearchGroup[] {
  const qw = queryWords(query)
  if (!qw.length) return []
  const byGroup = new Map<GroupId, Array<{ record: SearchRecord; title: boolean; at: number }>>()
  index.forEach((x, at) => {
    if (!startsAll(qw, x.all)) return
    const id = groupOf(x.record.kind)
    const list = byGroup.get(id) ?? []
    list.push({ record: x.record, title: startsAll(qw, x.title), at })
    byGroup.set(id, list)
  })
  const out: SearchGroup[] = []
  for (const g of GROUPS) {
    const list = byGroup.get(g.id)
    if (!list) continue
    list.sort((a, b) => {
      // Blocks: the day first (today, coming, past), then a title match before a text match; the rest: a title match first. Ties keep the order given.
      if (g.id === 'block') return compareDays(a.record.date ?? '', b.record.date ?? '', today) || Number(b.title) - Number(a.title) || a.at - b.at
      return Number(b.title) - Number(a.title) || a.at - b.at
    })
    out.push({ id: g.id, label: g.label, hits: list.map((x) => ({ record: x.record })) })
  }
  return out
}

export const search = (records: readonly SearchRecord[], query: string, today: string): SearchGroup[] => searchIndex(buildIndex(records), query, today)

/** The results a group shows: the first five, or all of them once opened. */
export const visibleHits = (g: SearchGroup, open: boolean): SearchHit[] => (open ? g.hits : g.hits.slice(0, GROUP_SIZE))

/** The keys of the last chosen results after one more choice: the newest first, none twice, at most five. */
export function rememberRecent(list: readonly string[], key: string): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, RECENT_MAX)
}

/** The stored list of the last chosen results: anything unreadable is an empty list, a wrong element is left out. */
export function parseRecents(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return [...new Set(v.filter((k): k is string => typeof k === 'string' && k !== ''))].slice(0, RECENT_MAX)
  } catch {
    return []
  }
}
