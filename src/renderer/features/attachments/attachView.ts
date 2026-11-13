/**
 * What the screens of attachments say and draw (SNT4, D410), without the DOM: the kind of a file by its extension (the icon),
 * its size in Polish („1,5 MB”), where an attachment a block shows comes from (its own, the template's, the series'), the
 * notes of an attachment (not arrived yet, a program) and the counts on the tiles of the axis.
 */
import { isExecutableName, THUMB_EXTS, type Attachment, type BlockPlace } from '@shared/model/attachment'
import { attachmentsOfBlock } from '@shared/model/attachment'
import type { PlanBlock } from '@shared/model/plan'

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'image' | 'media' | 'program' | 'other'

const KINDS: Record<Exclude<FileKind, 'image' | 'program' | 'other'>, readonly string[]> = {
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages'],
  sheet: ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'numbers'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  archive: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'],
  media: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'm4v']
}
const BY_EXT = new Map<string, FileKind>(Object.entries(KINDS).flatMap(([k, exts]) => exts.map((e): [string, FileKind] => [e, k as FileKind])))

/** The kind of a file by its extension (lower case, no dot) – its icon; a program (Windows would run it) before anything else. */
export function fileKind(fileName: string, ext: string): FileKind {
  if (isExecutableName(fileName)) return 'program'
  if (THUMB_EXTS.has(ext) || ext === 'svg' || ext === 'ico' || ext === 'tif' || ext === 'tiff' || ext === 'heic') return 'image'
  return BY_EXT.get(ext) ?? 'other'
}

/** The short word under an icon (its tooltip and label). */
export const KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  doc: 'Dokument',
  sheet: 'Arkusz',
  slides: 'Prezentacja',
  archive: 'Archiwum',
  image: 'Obraz',
  media: 'Dźwięk lub wideo',
  program: 'Program',
  other: 'Plik'
}

/** A size in words: bytes, KB, MB, GB – with a decimal comma, one decimal under 10, none after „,0”. */
export function sizeText(bytes: number): string {
  const n = Math.max(0, Math.floor(bytes))
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  const text = v < 10 ? v.toFixed(1).replace(/\.0$/, '').replace('.', ',') : String(Math.round(v))
  return `${text} ${units[u]}`
}

/** Where an attachment of a day's block comes from, when it is not the block's own: its tag in the list („z szablonu”, „z serii”). */
export function originTag(a: Pick<Attachment, 'owner'>, place: BlockPlace): string | null {
  if (place.scope !== 'day') return null
  if (a.owner.scope === 'template') return 'z szablonu'
  if (a.owner.scope === 'series') return 'z serii'
  return null
}

/** The attachment is the shown block's own: only then it can be renamed or removed here (T811). */
export const isOwnHere = (a: Pick<Attachment, 'owner'>, place: BlockPlace): boolean => originTag(a, place) == null

/**
 * Where a day's block is shown, for its attachments (T831): the day, the template of its snapshot and every template there
 * is – a block left by a change of the day's type is found in its own template by its id.
 */
export const dayPlace = (date: string, templateId: string | null, templates: readonly { id: string }[]): BlockPlace => ({ scope: 'day', date, templateId, templateIds: templates.map((t) => t.id) })

export const MISSING_NOTE = 'Plik jeszcze nie dotarł z drugiego komputera (OneDrive).'
export const PROGRAM_NOTE = 'Program – kliknięcie pokaże go w folderze.'

/** The 📎 of a tile: its count (the tile shows nothing for none). */
export const attachBadge = (n: number): string => `📎${n}`
export const attachBadgeTitle = (n: number): string => (n === 1 ? '1 załącznik' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} załączniki` : `${n} załączników`)

/**
 * The items of an axis with the count of the attachments of each tile's block (`attach`, 0 included – such a tile takes a
 * drop of files); a tile whose block is not known (begun outside the plan) has none.
 */
export function withAttachCounts<T extends { id: string }>(
  items: readonly T[],
  blockOf: (id: string) => Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null,
  place: BlockPlace,
  list: readonly Attachment[]
): Array<T & { attach?: number }> {
  return items.map((i) => {
    const b = blockOf(i.id)
    return b ? { ...i, attach: attachmentsOfBlock(list, b, place).length } : i
  })
}
