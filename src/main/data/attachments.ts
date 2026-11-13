/**
 * Attachments of blocks in the main process (SNT4, D410, T800–T810): the file copied into the data folder before its
 * record is written (a second computer may see the record before the file – „not here yet”, never an error), a link
 * with its title and icon fetched afterwards, opening that never trusts the window (it names an attachment by its id; the
 * path and the address come from the record, checked again here), thumbnails of images, and the leader's deletion 30 days
 * after a removal. The records go through the queue like every edit of the window (`edit`); the window removes and
 * brings back attachments itself (`removedAt`, store/attachments.ts).
 */
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { AddLinkResult, AttachResult, AttachmentOpen, EditEntry, EditOutcome } from '@shared/api'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import {
  ATTACHMENT_NAME_MAX,
  ATTACHMENT_SCHEME,
  attachmentFrom,
  attachmentJson,
  attachmentRel,
  domainOf,
  extOf,
  isExecutableName,
  isImageName,
  ownerFrom,
  safeAttachmentUrl,
  safeFileName,
  type Attachment,
  type AttachmentOwner
} from '@shared/model/attachment'
import { isId, newId } from '@shared/model/ids'
import { tempPathFor, withRetry } from '../datastore/atomic'
import type { DataFolder } from './folder'

const code = (e: unknown) => (e as NodeJS.ErrnoException | null)?.code

/** The files of attachments in the data folder (tests: a faulty one). */
export interface AttachmentFiles {
  /**
   * `source` (a file outside or inside the folder) copied into attachments/<id>/<fileName>: streamed into a hidden temp
   * file in that folder, then renamed into place – a half copy never has the file's name (T802). The size copied. The
   * data folder's root must be there (nothing is made in place of a folder that is away).
   */
  copyIn(dataDir: string, id: string, fileName: string, source: string): Promise<number>
  /**
   * The file's real path when it lies in attachments/<id>/ itself (after links and junctions are followed – `realpath`);
   * 'missing' – not there (yet); null – it leads elsewhere or cannot be looked at now.
   */
  realInside(dataDir: string, id: string, fileName: string): Promise<string | 'missing' | null>
  /** attachments/<id>/ with everything in it removed (none – nothing). */
  removeDir(dataDir: string, id: string): Promise<void>
}

/** A folder made unless there: one whose parent is not there fails (never `recursive` – the data folder is never made). */
async function mkdirOnce(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir)
  } catch (e) {
    if (code(e) !== 'EEXIST') throw e
  }
}

/** `p` lies directly in `dir` (one name below it, on Windows in either case). */
function directlyIn(p: string, dir: string): boolean {
  const r = relative(dir, p)
  return !!r && !isAbsolute(r) && !r.includes(sep) && !r.includes('/') && r !== '..'
}

export const nodeAttachmentFiles: AttachmentFiles = {
  async copyIn(dataDir, id, fileName, source) {
    const st = await fs.stat(source)
    if (!st.isFile()) throw Object.assign(new Error('to nie jest plik'), { code: 'ENOTFILE' })
    // The root must be there: mkdir without `recursive` below it fails when it is not.
    const top = join(dataDir, paths.attachmentDir(id).split('/')[0]!)
    await mkdirOnce(top)
    const dir = join(dataDir, ...paths.attachmentDir(id).split('/'))
    await mkdirOnce(dir)
    const target = join(dir, fileName)
    const tmp = tempPathFor(target)
    try {
      await pipeline(createReadStream(source), createWriteStream(tmp, { flags: 'wx', flush: true }))
      await withRetry(() => fs.rename(tmp, target))
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => undefined)
      await fs.rmdir(dir).catch(() => undefined)
      throw e
    }
    return (await fs.stat(target)).size
  },
  async realInside(dataDir, id, fileName) {
    const dir = resolve(dataDir, ...paths.attachmentDir(id).split('/'))
    const abs = resolve(dir, fileName)
    if (!directlyIn(abs, dir)) return null
    try {
      // The folder of the attachment itself is no link elsewhere (a junction of attachments/<id> would pass the check
      // below): its real path is the real data folder's attachments/<id>.
      const [realRoot, realDir, real] = await Promise.all([fs.realpath(dataDir), fs.realpath(dir), fs.realpath(abs)])
      if (relative(resolve(realRoot, ...paths.attachmentDir(id).split('/')), realDir) !== '' || !directlyIn(real, realDir)) return null
      const st = await fs.stat(real)
      return st.isFile() ? real : null
    } catch (e) {
      if (code(e) !== 'ENOENT') return null
      // Not there: the file (OneDrive still bringing it) – unless the data folder itself is away.
      return (await fs.stat(dataDir).then(() => true, () => false)) ? 'missing' : null
    }
  },
  async removeDir(dataDir, id) {
    await withRetry(() => fs.rm(join(dataDir, ...paths.attachmentDir(id).split('/')), { recursive: true, force: true }))
  }
}

/** What opens files and links: Electron's `shell` (tests: a record of the calls). */
export interface AttachmentShell {
  /** The file in its program; '' – done, else Windows' words why not. */
  openPath(abs: string): Promise<string>
  showItemInFolder(abs: string): void
  openExternal(url: string): Promise<void>
}

/** The title and icon of a page (`linkFetch.ts`; null – nothing, never an error). */
export type MetaFetch = (url: string) => Promise<{ title: string | null; iconDataUrl: string | null } | null>

export interface AttachmentIo {
  folder: DataFolder
  dataDir: string
  files: AttachmentFiles
  /** The window's edit (the hub's: the queue, then the window told). */
  edit: (entries: EditEntry[]) => Promise<EditOutcome[]>
  now: () => number
  shell: AttachmentShell
  fetchMeta?: MetaFetch
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
}

/** Files of one drop or one choice at most (more – the rest is refused with the reason). */
export const ATTACH_MAX = 50

export const MISSING_TEXT = 'Ten plik jeszcze nie dotarł na ten komputer – OneDrive go przenosi. Spróbuj za chwilę.'
export const GONE_TEXT = 'Tego załącznika już nie ma.'
export const LINK_REFUSED_TEXT = 'Ten adres się nie otworzy – tylko http, https i mailto.'
export const SHOWN_TEXT = 'To plik programu – pokazano go w folderze, nie uruchomiono.'

/** Why a copy failed, in words. */
function copyError(e: unknown): string {
  switch (code(e)) {
    case 'ENOENT':
      return 'pliku już nie ma w tym miejscu (albo folder danych jest niedostępny)'
    case 'ENOTFILE':
    case 'EISDIR':
      return 'to folder – dołączyć można tylko pliki'
    case 'EACCES':
    case 'EPERM':
    case 'EBUSY':
      return 'brak dostępu do pliku (otwarty w innym programie?)'
    case 'ENOSPC':
      return 'brak miejsca na dysku'
    default:
      return e instanceof Error ? e.message : String(e)
  }
}

/** The name a file is called by in the window: its own (no folder, no control characters), cut to the longest kept. */
const shownName = (source: string): string =>
  Array.from(
    basename(source)
      .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
      .trim()
  )
    .slice(0, ATTACHMENT_NAME_MAX)
    .join('')

const saved = (out: readonly EditOutcome[]): boolean => out.every((o) => o.status === 'applied' || o.status === 'waiting')

/** A copy made for a block whose record is not written yet (`prepareFiles` → `commitFiles`). */
export interface PreparedFile {
  id: string
  owner: AttachmentOwner
  raw: Record<string, unknown>
}

/**
 * Files dropped or chosen for a block (D410), the first half (T839): each copied into the data folder (T802 – the file,
 * then its record), no record yet – the window writes them in the turn of its edits (`commitFiles`), so a block removed
 * while gigabytes are copied is known then. A copy that fails is said by name.
 */
export async function prepareFiles(io: AttachmentIo, ownerIn: unknown, sourcesIn: unknown): Promise<{ made: PreparedFile[]; failed: AttachResult['failed'] }> {
  const owner = ownerFrom(ownerIn)
  if (!owner) return { made: [], failed: [{ name: '', error: 'nie wiadomo, do którego bloku' }] }
  const sources = Array.isArray(sourcesIn) ? sourcesIn.filter((s): s is string => typeof s === 'string' && s.length > 0) : []
  const failed: AttachResult['failed'] = []
  const made: PreparedFile[] = []
  for (const [i, source] of sources.entries()) {
    const name = shownName(source) || 'plik'
    if (i >= ATTACH_MAX) {
      failed.push({ name, error: `najwyżej ${ATTACH_MAX} plików naraz` })
      continue
    }
    if (!isAbsolute(source)) {
      failed.push({ name, error: 'nieznane miejsce pliku' })
      continue
    }
    const id = newId()
    const fileName = safeFileName(basename(source))
    let size: number
    try {
      size = await io.files.copyIn(io.dataDir, id, fileName, source)
    } catch (e) {
      failed.push({ name, error: copyError(e) })
      continue
    }
    const a: Attachment = { id, kind: 'file', name, file: { fileName, size, ext: extOf(fileName) }, link: null, owner, addedAt: io.now(), removedAt: null }
    made.push({ id, owner, raw: attachmentJson(a) })
  }
  return { made, failed }
}

/**
 * The records of copies made (`prepareFiles`) as one edit (T839). `removedAt` – the block is gone meanwhile (removed while
 * the files were copied): the records are written removed at once, so the leader deletes the files after 30 days (D410)
 * and „Cofnij” of the block's removal can still bring them back. Each copy by its own record: written or waiting – it
 * stays; any other answer, or none (an error after the edit may have gone) – it stays while its record may be there (in
 * the folder, unreadable now, or in the queue); only the copy of a record surely not there goes. A file without a record
 * is better than a record without its file.
 */
export async function commitFiles(io: AttachmentIo, made: readonly PreparedFile[], removedAt: number | null = null): Promise<AttachResult> {
  const failed: AttachResult['failed'] = []
  if (!made.length) return { added: [], failed }
  let out: EditOutcome[] | null = null
  try {
    out = await io.edit(made.map((m) => recordEdit(attachmentRel(m.id), null, removedAt == null ? m.raw : { ...m.raw, removedAt })!))
  } catch (e) {
    io.log?.('warn', `załączniki: rekordy nie zapisały się – ${e instanceof Error ? e.message : String(e)}`)
  }
  const added: string[] = []
  for (const [i, m] of made.entries()) {
    const o = out?.[i]
    if ((o && (o.status === 'applied' || o.status === 'waiting')) || (await recordMayBe(io, m.id))) {
      added.push(m.id)
      continue
    }
    await io.files.removeDir(io.dataDir, m.id).catch(() => undefined)
    failed.push({ name: String(m.raw.name), error: 'nie zapisano – spróbuj jeszcze raz' })
  }
  return { added, failed }
}

/** Both halves at once (`prepareFiles`, `commitFiles`) – for a caller with no turn of the window's edits to wait for. */
export async function attachFiles(io: AttachmentIo, ownerIn: unknown, sourcesIn: unknown): Promise<AttachResult> {
  const p = await prepareFiles(io, ownerIn, sourcesIn)
  const r = await commitFiles(io, p.made)
  return { added: r.added, failed: [...p.failed, ...r.failed] }
}

/** The record of an attachment may be there: queued here, or a file in the folder (also one that cannot be read now). */
async function recordMayBe(io: AttachmentIo, id: string): Promise<boolean> {
  const rel = attachmentRel(id)
  if (io.folder.queue.relsUnder(paths.attachmentDir(id).split('/')[0]!).includes(rel)) return true
  return (await io.folder.records.read(rel)).status !== 'missing'
}

/**
 * A link added to a block (D410): checked again here (`safeAttachmentUrl`), written at once with its host as its name;
 * the page's title and icon come later (`meta` – not awaited by the window; mailto has none), written into the fields of
 * the link only – never `name`, which is yours (an empty one shows the title).
 */
export async function addLink(io: AttachmentIo, ownerIn: unknown, urlIn: unknown): Promise<{ result: AddLinkResult; meta: Promise<void> }> {
  const none = Promise.resolve()
  const owner = ownerFrom(ownerIn)
  if (!owner) return { result: { ok: false, id: null, error: 'nie wiadomo, do którego bloku' }, meta: none }
  const url = safeAttachmentUrl(urlIn)
  if (!url) return { result: { ok: false, id: null, error: LINK_REFUSED_TEXT }, meta: none }
  const id = newId()
  const mail = url.startsWith('mailto:')
  const a: Attachment = { id, kind: 'link', name: '', file: null, link: { url, title: mail ? domainOf(url) : null, iconDataUrl: null, domain: domainOf(url) }, owner, addedAt: io.now(), removedAt: null }
  const out = await io.edit([recordEdit(attachmentRel(id), null, attachmentJson(a))!])
  if (!saved(out)) return { result: { ok: false, id: null, error: 'nie zapisano – spróbuj jeszcze raz' }, meta: none }
  const meta = mail || !io.fetchMeta ? none : fetchInto(io, id, url)
  return { result: { ok: true, id, error: null }, meta }
}

/** The page's title and icon written into the link's record; any failure – the link stays as it is (no message). */
async function fetchInto(io: AttachmentIo, id: string, url: string): Promise<void> {
  try {
    const meta = await io.fetchMeta!(url)
    if (!meta || (!meta.title && !meta.iconDataUrl)) return
    const rel = attachmentRel(id)
    const raw = await io.folder.recordView(rel)
    const a = raw ? attachmentFrom(raw) : null
    if (!raw || !a?.link) return
    const next = { ...a, link: { ...a.link, title: meta.title ?? a.link.title, iconDataUrl: meta.iconDataUrl ?? a.link.iconDataUrl } }
    const e = recordEdit(rel, raw, attachmentJson(next, raw))
    if (e) await io.edit([e])
  } catch (e) {
    io.log?.('info', `załącznik-link: bez tytułu ze strony (${e instanceof Error ? e.message : String(e)})`)
  }
}

/** The attachment of an id as this computer sees it now (its queued edits too); null – none, removed or unreadable. */
async function current(io: AttachmentIo, id: unknown): Promise<Attachment | null> {
  if (!isId(id)) return null
  const raw = await io.folder.recordView(attachmentRel(id)).catch(() => undefined)
  const a = raw ? attachmentFrom(raw) : null
  return a && a.removedAt == null ? a : null
}

type FileWhere = { ok: true; a: Attachment; abs: string } | { ok: false; result: AttachmentOpen }

/** The real path of an attachment's file, inside its folder of the data folder only. */
async function fileOf(io: AttachmentIo, id: string, a: Attachment): Promise<FileWhere> {
  const at = await io.files.realInside(io.dataDir, a.id, a.file!.fileName)
  if (at === 'missing') return { ok: false, result: { id, ok: false, how: null, code: 'missing', text: MISSING_TEXT } }
  if (at == null) return { ok: false, result: { id, ok: false, how: null, code: 'refused', text: 'Tego pliku nie da się teraz otworzyć – nie leży w folderze załącznika.' } }
  return { ok: true, a, abs: at }
}

/**
 * An attachment opened (D410, T803, T804): the window gives only its id. A link – its address from the record, checked
 * again, in the default browser or mail program; a file – its path built here and checked to lie in its own folder; a file
 * Windows would run – shown in its folder instead (`how: 'shown'`); another – in its program (`shell.openPath`'s words,
 * when it refuses, are the answer's text).
 */
export async function openAttachment(io: AttachmentIo, idIn: unknown): Promise<AttachmentOpen> {
  const id = String(idIn)
  const a = await current(io, idIn)
  if (!a) return { id, ok: false, how: null, code: 'gone', text: GONE_TEXT }
  if (a.kind === 'link') {
    const url = safeAttachmentUrl(a.link?.url)
    if (!url) return { id, ok: false, how: null, code: 'refused', text: LINK_REFUSED_TEXT }
    try {
      await io.shell.openExternal(url)
      return { id, ok: true, how: 'link', code: null, text: null }
    } catch (e) {
      return { id, ok: false, how: null, code: 'failed', text: `Nie otworzono adresu: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  const where = await fileOf(io, id, a)
  if (!where.ok) return where.result
  if (isExecutableName(a.file!.fileName) || isExecutableName(basename(where.abs))) {
    io.shell.showItemInFolder(where.abs)
    return { id, ok: true, how: 'shown', code: null, text: SHOWN_TEXT }
  }
  const why = await io.shell.openPath(where.abs).catch((e: unknown) => (e instanceof Error ? e.message : String(e)))
  return why ? { id, ok: false, how: null, code: 'failed', text: `Nie otworzono pliku: ${why}` } : { id, ok: true, how: 'opened', code: null, text: null }
}

/** „Otwórz wszystko (N)” (D410): one after another by the same rules; the answer of each. */
export async function openAttachments(io: AttachmentIo, ids: unknown): Promise<AttachmentOpen[]> {
  const list = Array.isArray(ids) ? ids.slice(0, ATTACH_MAX) : []
  const out: AttachmentOpen[] = []
  for (const id of list) out.push(await openAttachment(io, id))
  return out
}

/** „Pokaż w folderze”: the file selected in Explorer (a link – nothing to show). */
export async function showAttachment(io: AttachmentIo, idIn: unknown): Promise<AttachmentOpen> {
  const id = String(idIn)
  const a = await current(io, idIn)
  if (!a || a.kind !== 'file') return { id, ok: false, how: null, code: 'gone', text: GONE_TEXT }
  const where = await fileOf(io, id, a)
  if (!where.ok) return where.result
  io.shell.showItemInFolder(where.abs)
  return { id, ok: true, how: 'shown', code: null, text: null }
}

/** The content types of the images shown (T837) – by the name's extension, the same list as the thumbnails. */
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

/**
 * The file an address of `ATTACHMENT_SCHEME` shows (T837, the window's `<img>`): `rd-attachment://img/<id>` of an
 * attachment there is (not removed), a file of an image kind (never a program's, never SVG), its path built from the record
 * and checked to lie in its own folder (`realInside`) – the address names nothing but the id. Not here yet – 404 (the window
 * shows the kind's icon; the next look asks again), refused – 403, anything else – 404 or 400.
 */
export async function attachmentImage(io: AttachmentIo, address: string): Promise<{ ok: true; abs: string; type: string } | { ok: false; status: 400 | 403 | 404 }> {
  let u: URL
  try {
    u = new URL(address)
  } catch {
    return { ok: false, status: 400 }
  }
  const id = u.pathname.replace(/^\//, '')
  if (u.protocol !== `${ATTACHMENT_SCHEME}:` || u.hostname !== 'img' || u.search || !isId(id)) return { ok: false, status: 400 }
  const a = await current(io, id)
  if (!a?.file) return { ok: false, status: 404 }
  const type = IMAGE_TYPES[extOf(a.file.fileName)]
  if (!type || !isImageName(a.file.fileName) || isExecutableName(a.file.fileName)) return { ok: false, status: 404 }
  const where = await fileOf(io, id, a)
  if (!where.ok) return { ok: false, status: where.result.code === 'missing' ? 404 : 403 }
  if (isExecutableName(basename(where.abs)) || IMAGE_TYPES[extOf(basename(where.abs))] !== type) return { ok: false, status: 403 }
  return { ok: true, abs: where.abs, type }
}
