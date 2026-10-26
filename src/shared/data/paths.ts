// adapted from FI src/shared/paths.ts @ 130345b
/**
 * The files of the data folder (spec „Pliki na OneDrive”): their paths, what kind each is, and which names are sync
 * conflict copies of which file. Names never carry editable fields – a day's id is its date, a log's is the computer's.
 * Changed against FI: the layout of this app (logs per day and computer, the presence folder), ids in lower case so a
 * conflict copy's suffix („-DESKTOP-ABC”, „ (1)”) is told from an id with a dash.
 */

export const SETTINGS_FILE = 'rd.json'
export const BACKUPS_DIR = 'backups'
export const PRESENCE_DIR = '.presence'
export const HISTORY_DIR = '.history'

export type FileKind = 'settings' | 'template' | 'schedule' | 'day' | 'log' | 'request' | 'routine' | 'presence' | 'grades'

/** Collections of records stored one file per id. */
export const ID_COLLECTIONS = { template: 'templates', schedule: 'schedule', request: 'requests', routine: 'routines' } as const
export type IdKind = keyof typeof ID_COLLECTIONS

const ID = '[0-9a-z][0-9a-z_-]{0,63}'
const DATE = '\\d{4}-\\d{2}-\\d{2}'
const YEAR = '\\d{4}'

export const paths = {
  settings: SETTINGS_FILE,
  record: (kind: IdKind, id: string) => `${ID_COLLECTIONS[kind]}/${id}.json`,
  day: (date: string) => `days/${date.slice(0, 4)}/${date}.json`,
  logDir: (date: string) => `log/${date.slice(0, 4)}/${date}`,
  log: (date: string, computer: string) => `log/${date.slice(0, 4)}/${date}/${computer}.jsonl`,
  presence: (computer: string) => `${PRESENCE_DIR}/${computer}.json`,
  grades: (year: string, computer: string) => `grades/${year}/${computer}.jsonl`
}

export interface Classified {
  kind: FileKind
  /** The file's own path, or for a conflict copy the path of the file it is a copy of. */
  canonical: string
  /** A sync conflict copy (OneDrive keeps both versions beside each other). */
  conflict: boolean
  id: string | null
  date: string | null
  computer: string | null
}

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Files the scanner never treats as records: temp files of atomic writes, backups, hidden folders. */
export function isIgnoredPath(rel: string): boolean {
  const p = toPosix(rel)
  if (p === BACKUPS_DIR || p.startsWith(`${BACKUPS_DIR}/`)) return true
  if (p.includes('.tmp-')) return true
  return p.split('/').some((seg) => seg.startsWith('.') && seg !== PRESENCE_DIR)
}

/**
 * The suffix a sync tool adds to a conflict copy: OneDrive „-<COMPUTER-NAME>” (the name has upper-case letters; ids
 * here never do), „ (1)”, or a tool's words.
 */
export function isConflictSuffix(rest: string): boolean {
  if (/^ \(\d+\)$/.test(rest)) return true
  if (/sync-conflict|conflicted copy|kopia powoduj|konflikt/i.test(rest)) return true
  return /^-[A-Za-z0-9][A-Za-z0-9-]*$/.test(rest) && /[A-Z]/.test(rest)
}

interface Pattern {
  kind: FileKind
  re: RegExp
  /** The canonical name from the stem's matched part. */
  ext: '.json' | '.jsonl'
  fields: (m: RegExpExecArray) => Pick<Classified, 'id' | 'date' | 'computer'>
}

const PATTERNS: Pattern[] = [
  ...Object.entries(ID_COLLECTIONS).map(([kind, dir]) => ({
    kind: kind as FileKind,
    re: new RegExp(`^${dir}/(${ID})(.*)\\.json$`),
    ext: '.json' as const,
    fields: (m: RegExpExecArray) => ({ id: m[1]!, date: null, computer: null })
  })),
  { kind: 'day', re: new RegExp(`^days/(${YEAR})/(${DATE})(.*)\\.json$`), ext: '.json', fields: (m) => ({ id: m[2]!, date: m[2]!, computer: null }) },
  { kind: 'log', re: new RegExp(`^log/(${YEAR})/(${DATE})/(${ID})(.*)\\.jsonl$`), ext: '.jsonl', fields: (m) => ({ id: null, date: m[2]!, computer: m[3]! }) },
  { kind: 'presence', re: new RegExp(`^\\.presence/(${ID})(.*)\\.json$`), ext: '.json', fields: (m) => ({ id: null, date: null, computer: m[1]! }) },
  { kind: 'grades', re: new RegExp(`^grades/(${YEAR})/(${ID})(.*)\\.jsonl$`), ext: '.jsonl', fields: (m) => ({ id: null, date: null, computer: m[2]! }) }
]

/** What a file of the data folder is (null: not a file of this app). */
export function classify(rel: string): Classified | null {
  const p = toPosix(rel)
  if (p.includes('.tmp-')) return null
  if (p === SETTINGS_FILE) return { kind: 'settings', canonical: p, conflict: false, id: null, date: null, computer: null }
  const settingsCopy = /^rd(.+)\.json$/.exec(p)
  if (settingsCopy && isConflictSuffix(settingsCopy[1]!)) return { kind: 'settings', canonical: SETTINGS_FILE, conflict: true, id: null, date: null, computer: null }
  for (const pat of PATTERNS) {
    // The id may itself end in letters a suffix could start with: try the longest id first, then shorter ones.
    const m = pat.re.exec(p)
    if (!m) continue
    const groups = m.length - 1
    const rest = m[groups] ?? ''
    if (rest === '') return { kind: pat.kind, canonical: p, conflict: false, ...pat.fields(m) }
    if (isConflictSuffix(rest)) {
      const canonical = p.slice(0, p.length - rest.length - pat.ext.length) + pat.ext
      return { kind: pat.kind, canonical, conflict: true, ...pat.fields(m) }
    }
    // „abc-DESKTOP” matched as id „abc-” + „DESKTOP”? Regex took the longest id; a suffix starting inside the id:
    const stemStart = p.lastIndexOf('/') + 1
    const stem = p.slice(stemStart, p.length - pat.ext.length)
    for (let cut = stem.length - 1; cut > 0; cut--) {
      const tail = stem.slice(cut)
      if (!isConflictSuffix(tail)) continue
      const canonical = `${p.slice(0, stemStart)}${stem.slice(0, cut)}${pat.ext}`
      const c = classify(canonical)
      if (c && !c.conflict) return { ...c, canonical, conflict: true }
    }
  }
  return null
}

/** Reject absolute paths and traversal; a normalised posix relative path or null. */
export function sanitizeRelPath(rel: string): string | null {
  const p = toPosix(rel).replace(/^\.\/+/, '')
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null
  const parts = p.split('/')
  if (parts.some((s) => s === '..' || s === '' || s === '.')) return null
  return parts.join('/')
}
