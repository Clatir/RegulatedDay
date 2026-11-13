/**
 * Attachments of blocks (SNT4, D410; attachments/<id>.json, the file in attachments/<id>/<name>): a file copied into the
 * data folder or a link, with its owner – a block of a day, a block of a template, or a series (T800). The block's own
 * format does not change (an older version on another computer would drop a field of it when it writes the day): the
 * record says whose it is. A removal is soft (`removedAt`, its „Cofnij” clears it); the leader deletes the file and the
 * record 30 days after it (T806). Records are read leniently: one this version cannot read is left out (null), fields it
 * does not know stay in the file (`attachmentJson`).
 */
import type { EditEntry, RawRecord } from '../api'
import { recordEdit } from '../data/merge'
import { paths } from '../data/paths'
import { isIsoDate } from '../time/zone'
import { templateBlockId } from '../engine/createDay'
import { derivedId, isId } from './ids'
import type { PlanBlock } from './plan'

export const ATTACHMENT_SCHEMA = 1

/**
 * Whose an attachment is (T800): a block of a day (by its id – a block moved to another day keeps it, so its attachments
 * go with it; `date` is the day it was added on), a block of a template (its id is unique only within the template – the
 * defaults share theirs), or a series (its root, D381 – every occurrence, „Cała seria”).
 */
export type AttachmentOwner = { scope: 'day'; date: string; blockId: string } | { scope: 'template'; templateId: string; blockId: string } | { scope: 'series'; root: string }

export interface AttachmentFile {
  /** The file's name in attachments/<id>/ (`safeFileName` of the original's). */
  fileName: string
  size: number
  /** Its extension in lower case without the dot ('' – none). */
  ext: string
}

export interface AttachmentLink {
  /** As `safeAttachmentUrl` gave it (http, https, mailto). */
  url: string
  /** The page's own title (fetched once, T807); null – none (yet, or never: no network, mailto). */
  title: string | null
  /** The page's icon as a small data URL of an image (never SVG); null – none. */
  iconDataUrl: string | null
  /** The host (a link) or the address (mailto) – shown under the title. */
  domain: string
}

export interface Attachment {
  id: string
  kind: 'file' | 'link'
  /** What the interface calls it: the file's name or the link's title – yours to change. */
  name: string
  file: AttachmentFile | null
  link: AttachmentLink | null
  owner: AttachmentOwner
  addedAt: number
  /** Removed (D410: its file stays 30 days, „Cofnij” and a backup bring it back); null – not removed. */
  removedAt: number | null
}

/** 30 days after its removal an attachment's file and record go (D410) – the leader's task (T806). */
export const ATTACHMENT_KEEP_MS = 30 * 24 * 60 * 60_000
/** The longest name kept (the interface's, not the file's). */
export const ATTACHMENT_NAME_MAX = 200
/** The longest file name in attachments/<id>/ (code points): the whole path stays far below Windows' 260 characters. */
export const FILE_NAME_MAX = 100
/** The longest link kept. */
export const LINK_URL_MAX = 2048

type Raw = Record<string, unknown>
const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** The owner of a record, or null when it is no owner this version knows (the record is then left out). */
export function ownerFrom(v: unknown): AttachmentOwner | null {
  if (!isPlain(v)) return null
  if (v.scope === 'day' && isIsoDate(v.date) && isId(v.blockId)) return { scope: 'day', date: v.date, blockId: v.blockId }
  if (v.scope === 'template' && isId(v.templateId) && isId(v.blockId)) return { scope: 'template', templateId: v.templateId, blockId: v.blockId }
  if (v.scope === 'series' && isId(v.root)) return { scope: 'series', root: v.root }
  return null
}

/**
 * The attachment of a record, leniently: no valid id, kind or owner – no attachment (null, never an error); a file whose
 * name is not one `safeFileName` would give is no attachment either (a record made elsewhere never names a path).
 */
export function attachmentFrom(v: unknown): Attachment | null {
  if (!isPlain(v) || !isId(v.id) || (v.kind !== 'file' && v.kind !== 'link')) return null
  const owner = ownerFrom(v.owner)
  if (!owner) return null
  let file: AttachmentFile | null = null
  let link: AttachmentLink | null = null
  if (v.kind === 'file') {
    const f = isPlain(v.file) ? v.file : null
    const fileName = str(f?.fileName)
    if (!fileName || safeFileName(fileName) !== fileName) return null
    file = { fileName, size: Math.max(0, num(f?.size) ?? 0), ext: extOf(fileName) }
  } else {
    const l = isPlain(v.link) ? v.link : null
    const url = str(l?.url)
    if (!url || url.length > LINK_URL_MAX) return null
    const title = str(l?.title)
    const icon = str(l?.iconDataUrl)
    link = { url, title: title ? title.slice(0, ATTACHMENT_NAME_MAX) : null, iconDataUrl: icon && isImageDataUrl(icon) ? icon : null, domain: str(l?.domain) ?? domainOf(url) }
  }
  const name = (typeof v.name === 'string' ? v.name.trim() : '').slice(0, ATTACHMENT_NAME_MAX)
  return {
    id: v.id,
    kind: v.kind,
    name: name || file?.fileName || link?.title || link?.domain || 'Załącznik',
    file,
    link,
    owner,
    addedAt: num(v.addedAt) ?? 0,
    removedAt: num(v.removedAt)
  }
}

const FIELDS = ['kind', 'name', 'file', 'link', 'owner', 'addedAt', 'removedAt'] as const

/**
 * The record as written. Over the file as it was (`before`) only the fields whose value differs from what this version
 * read of them are written: unknown fields stay (spec „nieznane wartości zachowywane”).
 */
export function attachmentJson(a: Attachment, before?: Raw | null): Raw {
  const read = before ? attachmentFrom(before) : null
  const out: Raw = before ? { ...before } : { schema: ATTACHMENT_SCHEMA }
  out.id = a.id
  for (const k of FIELDS) if (!read || JSON.stringify(read[k]) !== JSON.stringify(a[k])) out[k] = a[k] === undefined ? null : a[k]
  if (out.schema === undefined) out.schema = ATTACHMENT_SCHEMA
  return out
}

/** The file of an attachment's record. */
export const attachmentRel = (id: string): string => paths.record('attachment', id)
/** The file of an attachment itself, relative to the data folder. */
export const attachmentFileRel = (a: Pick<Attachment, 'id' | 'file'>): string | null => (a.file ? `${paths.attachmentDir(a.id)}/${a.file.fileName}` : null)

/** Two owners are the same: a block of a day by its id alone (it keeps it when moved), a template's by both ids. */
export function sameOwner(a: AttachmentOwner, b: AttachmentOwner): boolean {
  if (a.scope === 'day') return b.scope === 'day' && a.blockId === b.blockId
  if (a.scope === 'template') return b.scope === 'template' && a.templateId === b.templateId && a.blockId === b.blockId
  return b.scope === 'series' && a.root === b.root
}

/**
 * Where a block is shown (T800): in a day's plan – with the template the day was made from (its snapshot's), whose blocks
 * the day's blocks of origin „template” are; in a template's editor; or a series (its panel in „Szablony”).
 */
export type BlockPlace =
  /**
   * `templateId` – the template of the day's snapshot; `templateIds` – the templates there are (a block of another one,
   * left in the day's file by a change of the day's type, is found by its id – T831).
   */
  | { scope: 'day'; date: string; templateId: string | null; templateIds?: readonly string[] }
  | { scope: 'template'; templateId: string }
  | { scope: 'series'; root: string }

/**
 * The template a block of a day of origin „template” was made from (T831): its id is derived from the day, the template
 * and the template's block (`templateBlockId`), so the one whose derived id is the block's own; none – null (its
 * template's attachments are not shown rather than another template's, whose blocks may share ids – T800).
 */
export function templateOfDayBlock(block: Pick<PlanBlock, 'id' | 'sourceId'>, date: string, candidates: ReadonlyArray<string | null | undefined>): string | null {
  if (!block.sourceId) return null
  for (const t of candidates) {
    if (!t) continue
    // A block brought back by a change of the day's type is a copy of the parked one: `derivedId(date, 'back', id)`.
    let id = templateBlockId(date, t, block.sourceId)
    for (let back = 0; back <= BACK_DEPTH; back++, id = derivedId(date, 'back', id)) if (id === block.id) return t
  }
  return null
}

/** How many changes of the day's type back a block of the template is still found (a copy of a copy …, T831). */
const BACK_DEPTH = 4

/**
 * The owners whose attachments a block sees (D410): a block of a day its own, and those of the template block it was made
 * from and of its series (added in the template or with „Cała seria” – every occurrence sees them); a template's block and
 * a series their own.
 */
export function ownersOf(block: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null, place: BlockPlace): AttachmentOwner[] {
  if (place.scope === 'series') return [{ scope: 'series', root: place.root }]
  if (!block) return []
  if (place.scope === 'template') return [{ scope: 'template', templateId: place.templateId, blockId: block.id }]
  const out: AttachmentOwner[] = [{ scope: 'day', date: place.date, blockId: block.id }]
  const tpl = block.origin === 'template' ? templateOfDayBlock(block, place.date, [place.templateId, ...(place.templateIds ?? [])]) : null
  if (tpl && block.sourceId) out.push({ scope: 'template', templateId: tpl, blockId: block.sourceId })
  if (block.origin === 'series' && block.sourceId) out.push({ scope: 'series', root: block.sourceId })
  return out
}

/** The owner an attachment added to a block where it is shown gets: always the block's own (a day's – only that day, D410). */
export function ownerToAdd(block: Pick<PlanBlock, 'id'> | null, place: BlockPlace): AttachmentOwner | null {
  if (place.scope === 'series') return { scope: 'series', root: place.root }
  if (!block) return null
  return place.scope === 'template' ? { scope: 'template', templateId: place.templateId, blockId: block.id } : { scope: 'day', date: place.date, blockId: block.id }
}

/** The order everywhere: as they were added (then by id). */
export const compareAttachments = (a: Attachment, b: Attachment): number => a.addedAt - b.addedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The attachments a block sees where it is shown (`ownersOf`), in their order – without the removed ones. */
export function attachmentsOfBlock(list: readonly Attachment[], block: Pick<PlanBlock, 'id' | 'origin' | 'sourceId'> | null, place: BlockPlace): Attachment[] {
  const owners = ownersOf(block, place)
  return list.filter((a) => a.removedAt == null && owners.some((o) => sameOwner(o, a.owner))).sort(compareAttachments)
}

/** An attachment due for deletion (D410): removed at least 30 days before `now`. */
export const purgeDue = (a: Pick<Attachment, 'removedAt'>, now: number): boolean => a.removedAt != null && now - a.removedAt >= ATTACHMENT_KEEP_MS

/** What „Cofnij” of a removal needs: the attachments and the instant written into each (only those still so go back). */
export interface AttachmentUndo {
  ids: string[]
  removedAt: number
}

/**
 * The edits that remove `ids` of `list` at `at` (D410: soft – `removedAt`), with the value before as the base: one removed
 * meanwhile (another computer) is left alone. Goes in the same edit as the block's removal (T805).
 */
export function removalEdits(raws: readonly RawRecord[], ids: readonly string[], at: number): EditEntry[] {
  const out: EditEntry[] = []
  for (const raw of raws) {
    const a = attachmentFrom(raw)
    if (!a || !ids.includes(a.id) || a.removedAt != null) continue
    const e = recordEdit(attachmentRel(a.id), raw, attachmentJson({ ...a, removedAt: at }, raw))
    if (e) out.push(e)
  }
  return out
}

/** „Cofnij” of a removal: the attachments still removed at that very instant (`AttachmentUndo`) brought back. */
export function restoreEdits(raws: readonly RawRecord[], undo: AttachmentUndo): EditEntry[] {
  const out: EditEntry[] = []
  for (const raw of raws) {
    const a = attachmentFrom(raw)
    if (!a || !undo.ids.includes(a.id) || a.removedAt !== undo.removedAt) continue
    const e = recordEdit(attachmentRel(a.id), raw, attachmentJson({ ...a, removedAt: null }, raw))
    if (e) out.push(e)
  }
  return out
}

/** The attachments of a day's block a removal of the block removes with it (T805): its own (a day's) – not the template's nor the series'. */
export function ownAttachmentIds(list: readonly Attachment[], blockId: string): string[] {
  return list.filter((a) => a.removedAt == null && a.owner.scope === 'day' && a.owner.blockId === blockId).map((a) => a.id)
}

/**
 * The attachments a removal of blocks of a template takes with it (D415, T841): the template's own of those blocks – they
 * go from every day, the days gone by too – and the days' own of their occurrences from `from` on (the day it is removed
 * from; a day made before keeps its block and its own). An occurrence is known by its id, derived from its day, the
 * template and the block (also a copy brought back by a change of the day's type – `templateOfDayBlock`), on the day the
 * attachment was added on.
 */
export function templateRemovalIds(list: readonly Attachment[], templateId: string, blockIds: readonly string[], from: string): string[] {
  return list
    .filter((a) => {
      if (a.removedAt != null) return false
      const o = a.owner
      if (o.scope === 'template') return o.templateId === templateId && blockIds.includes(o.blockId)
      if (o.scope !== 'day' || o.date < from) return false
      return blockIds.some((b) => templateOfDayBlock({ id: o.blockId, sourceId: b }, o.date, [templateId]) === templateId)
    })
    .map((a) => a.id)
}

// ---------------------------------------------------------------------------------------------------------------------
// Names of files (T802)

/** The names Windows keeps for devices (also with an extension: „con.txt”, „nul.tar.gz”), in either case. */
const RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|clock\$|com[0-9¹²³]|lpt[0-9¹²³])$/i

/** The extension of a name in lower case without its dot ('' – none; trailing dots and spaces Windows drops first). */
export function extOf(name: string): string {
  const n = name.replace(/[. ]+$/, '')
  const dot = n.lastIndexOf('.')
  if (dot <= 0 || dot === n.length - 1) return ''
  return n.slice(dot + 1).toLowerCase()
}

/**
 * A name a file of an attachment may have in the data folder (T802), from the original's: its last part only (no
 * folder), without the characters Windows refuses (`< > : " / \ | ? *`, control characters) and the trailing dots and
 * spaces it drops, never hidden (a leading dot) nor a temp file's („.tmp-”, the scanner skips those), never a device name
 * (CON, NUL, COM1…), at most `FILE_NAME_MAX` code points with its extension kept. Never empty („plik”).
 */
export function safeFileName(raw: string): string {
  let n = raw.normalize('NFC')
  n = n.slice(Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1)
  // Bidirectional controls go too: „x‮fdp.exe” would show as a PDF.
  n = n.replace(/[‎‏‪-‮⁦-⁩]/g, '')
  n = n.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/\.tmp-/gi, '_tmp-')
  n = n.replace(/[. ]+$/, '')
  const lead = /^[ .]+/.exec(n)?.[0] ?? ''
  n = `${lead.includes('.') ? '_' : ''}${n.slice(lead.length)}`.trim()
  if (!n) return 'plik'
  const dot = n.lastIndexOf('.')
  let stem = dot > 0 ? n.slice(0, dot) : n
  let ext = dot > 0 ? n.slice(dot) : ''
  // A long „extension” (a sentence after a dot) is part of the name.
  if (ext.length > 17) {
    stem = n
    ext = ''
  }
  if (RESERVED.test(stem.split('.')[0]!.trim())) stem = `_${stem}`
  const points = Array.from(stem)
  const room = FILE_NAME_MAX - Array.from(ext).length
  if (points.length > room) stem = points.slice(0, Math.max(1, room)).join('').replace(/[. ]+$/, '') || '_'
  return `${stem}${ext}`
}

/**
 * Kinds of files Windows would run rather than open (T803): such an attachment is shown in its folder, never started (D410).
 * By the last extension – what Windows goes by (`x.pdf.exe` runs) – after the trailing dots and spaces it drops.
 */
export const EXECUTABLE_EXTS: ReadonlySet<string> = new Set([
  'exe', 'com', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'msh', 'msh1', 'msh2', 'mshxml', 'msh1xml', 'msh2xml',
  'vbs', 'vbe', 'vb', 'js', 'jse', 'wsf', 'wsh', 'ws', 'wsc', 'sct', 'msi', 'msp', 'mst', 'lnk', 'scr', 'pif', 'cpl', 'hta', 'jar', 'reg', 'url',
  'appref-ms', 'application', 'gadget', 'inf', 'scf', 'sys', 'dll', 'ocx', 'drv', 'chm', 'hlp', 'msc', 'shb', 'shs', 'website', 'xbap', 'job',
  'library-ms', 'search-ms', 'searchconnector-ms', 'settingcontent-ms', 'appx', 'appxbundle', 'msix', 'msixbundle', 'appinstaller', 'diagcab',
  'xll', 'ade', 'adp', 'mde', 'accde', 'jnlp', 'py', 'pyw', 'pyz', 'pyc', 'rb', 'pl', 'sh', 'bash', 'theme', 'themepack', 'deskthemepack', 'mof', 'vsto',
  // T832: what Windows installs, mounts, connects to or runs add-ins of when opened.
  'msu', 'ppkg', 'wsb', 'rdp', 'iso', 'img', 'vhd', 'vhdx', 'mht', 'mhtml', 'xla', 'xlam', 'ppa', 'ppam', 'ins', 'isp', 'vsix', 'cer', 'crt', 'der', 'p7b',
  // Certificates, keys and lists Windows imports with a wizard; OneNote packages and sections (embedded files run from them).
  'pfx', 'p12', 'p7r', 'p7c', 'p7s', 'spc', 'sst', 'crl', 'stl', 'one', 'onepkg'
])

/** Windows would run the file of this name (T803). */
export const isExecutableName = (name: string): boolean => EXECUTABLE_EXTS.has(extOf(name))

/**
 * The scheme the window shows images of attachments by (T837): `rd-attachment://img/<id>` – the main process finds the file
 * from the record (never from the address) and answers with its bytes; the window decodes and scales it (`<img>`).
 */
export const ATTACHMENT_SCHEME = 'rd-attachment'
export const attachmentImageUrl = (id: string): string => `${ATTACHMENT_SCHEME}://img/${id}`
/** A larger image gets no thumbnail (T837): the window decodes it whole for 32 px – the kind's icon instead. */
export const ATTACHMENT_IMAGE_MAX = 20 * 1024 * 1024

/** The images with a thumbnail (D410, T808). */
export const THUMB_EXTS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])
export const isImageName = (name: string): boolean => THUMB_EXTS.has(extOf(name))

// ---------------------------------------------------------------------------------------------------------------------
// Links (T804)

const MAIL_FIELDS = new Set(['subject', 'body', 'cc', 'bcc', 'to'])

/**
 * A link of an attachment that may open (D410, T804): only http and https (the default browser) and mailto (the mail
 * program) – never file:, javascript:, data:, vbscript:, a path (C:\…, \\server\…) nor another app's protocol. An http(s)
 * link has a host and no user or password in it (`https://bank.pl@evil.example` would show one host and go to another);
 * mailto only with the fields of a message (an „attach=” of some mail programs reads a file of this computer). The window
 * checks it before it asks, the main process again before `shell.openExternal` – with the address from the record. The
 * address as `URL` writes it, or null.
 */
export function safeAttachmentUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > LINK_URL_MAX || /[\u0000-\u001f\u007f]/.test(text) || text.startsWith('\\') || text.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (!url.hostname || url.username || url.password) return null
    return url.href
  }
  if (url.protocol === 'mailto:') {
    if (!url.pathname || url.pathname.startsWith('/')) return null
    for (const k of url.searchParams.keys()) if (!MAIL_FIELDS.has(k.toLowerCase())) return null
    return url.href
  }
  return null
}

/**
 * What you typed or pasted as a link, as an address: one without a scheme is https (an e-mail address – mailto); then
 * `safeAttachmentUrl` (null – not a link that opens).
 */
export function linkFromInput(raw: string): string | null {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return null
  // A host with a port („localhost:3000”, „intranet.local:8080/wiki”) – no scheme, though it looks like one (T833).
  const hostPort = /^([a-z0-9][a-z0-9.-]*):\d{1,5}(?:[/?#]|$)/i.exec(text)
  if (hostPort && (hostPort[1]!.includes('.') || hostPort[1]!.toLowerCase() === 'localhost')) return safeAttachmentUrl(`https://${text}`)
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return safeAttachmentUrl(text)
  if (text.startsWith('\\') || text.startsWith('/') || text.startsWith('.')) return null
  if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(text)) return safeAttachmentUrl(`mailto:${text}`)
  if (!/^[^/?#]+\.[^/?#]{2,}/.test(text)) return null
  return safeAttachmentUrl(`https://${text}`)
}

/** The host of a link (or the address of mailto) shown under its title; '' when it is no address. */
export function domainOf(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'mailto:') return decodeURIComponent(u.pathname)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A data URL of a raster image (the icon of a page, T807): png, gif, jpeg, webp, bmp or ico, base64 – never SVG. */
export const isImageDataUrl = (v: string): boolean => v.length <= 100_000 && /^data:image\/(png|gif|jpeg|webp|bmp|x-icon);base64,[A-Za-z0-9+/]+=*$/.test(v)
