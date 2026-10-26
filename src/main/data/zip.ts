// adapted from FI src/main/datastore/zip.ts @ ca3da9e (walkFiles, mapLimit: FI src/main/datastore/fsutil.ts @ 816604d)
/**
 * The ZIP of the backups (spec „Kopie zapasowe”): FI's one-pass writer (W7) and a reader to take a backup back.
 * Changed against FI:
 * - a file is read whole under one retry (open and read; FI retried only the open): a read refused for a moment by
 *   OneDrive or an antivirus (EBUSY, EPERM) is tried again, and one still refused fails the ZIP – never a ZIP without it;
 * - the files gone before their turn are named in the result (`skipped`), FI left them out silently;
 * - the folder itself missing or unreadable fails the ZIP (FI's walk listed nothing there: an empty backup); listing a
 *   folder is retried like reading a file;
 * - `zipFolder` takes the source of each file (the backup cuts a log to its whole lines);
 * - a reader (`ZipReader`) in place of yauzl, which this app does not have: the central directory, ZIP64, stored and
 *   deflated entries, each entry checked against its size and CRC.
 */
import { promises as fs, type Stats } from 'node:fs'
import { dirname, join } from 'node:path'
import zlib from 'node:zlib'
import { tempPathFor, withRetry } from '../datastore/atomic'

/**
 * Compression of one small file: in place, a file at a time – handing ~1 KB to the thread pool costs more than
 * compressing it (3 s against 1 s for 30 thousand files, W7). A 4 KB window: the files are small, and its smaller
 * state is quicker to set up.
 */
const DEFLATE: zlib.ZlibOptions = { windowBits: 12, memLevel: 6 }
/** Files compressed between two turns of the event loop (about 2 ms): the main process stays responsive. */
const SLICE = 32
const tick = () => new Promise<void>((r) => setImmediate(r))

export interface ZipResult {
  files: number
  bytes: number
  /** Files gone before their turn (removed meanwhile): left out of the ZIP, named here. */
  skipped: string[]
}

/** Files got at a time: the disk kept busy, little memory held. */
const BATCH = 256
const READ_CONCURRENCY = 16
/** Written in chunks of about this size. */
const FLUSH_BYTES = 1 << 20

const VERSION_MADE_BY = (3 << 8) | 63 // UNIX, spec 6.3 – the external attributes carry the file mode
const VERSION_NEEDED = 20
const VERSION_ZIP64 = 45
const FLAG_UTF8 = 0x0800
const FILE_MODE = 0o100664
const MAX16 = 0xffff
const MAX32 = 0xffffffff

interface Entry {
  name: Buffer
  crc: number
  size: number
  csize: number
  method: number
  time: number
  date: number
  unix: number
  offset: number
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    date: (d.getDate() & 0x1f) | (((d.getMonth() + 1) & 0xf) << 5) | (((year - 1980) & 0x7f) << 9),
    time: Math.floor(d.getSeconds() / 2) | ((d.getMinutes() & 0x3f) << 5) | ((d.getHours() & 0x1f) << 11)
  }
}

/** The extended timestamp (0x5455): the modification time in seconds, UTC – the DOS time has no zone and 2 s steps. */
function timestampExtra(unix: number): Buffer {
  const b = Buffer.alloc(9)
  b.writeUInt16LE(0x5455, 0)
  b.writeUInt16LE(5, 2)
  b.writeUInt8(1, 4)
  b.writeUInt32LE(unix >>> 0, 5)
  return b
}

/**
 * A ZIP written in one pass (W7): entries appended in order with their sizes and CRC known (no data descriptors), the
 * central directory at the end, ZIP64 end records past 65 535 entries or 4 GB. Its cost grows with the number of
 * files – yazl looked for the next entry from the first one at every step, minutes at 150 thousand files.
 */
class ZipWriter {
  private readonly entries: Entry[] = []
  private offset = 0
  private chunks: Buffer[] = []
  private pending = 0

  constructor(private readonly fh: fs.FileHandle) {}

  /** One file: `deflated` = its compressed content (null = stored as it is, also when compressing gained nothing). */
  async add(name: string, data: Buffer, mtime: Date, deflated: Buffer | null): Promise<void> {
    const stored = !deflated || deflated.length >= data.length
    const body = stored ? data : deflated
    const { date, time } = dosDateTime(mtime)
    const entry: Entry = {
      name: Buffer.from(name, 'utf8'),
      crc: zlib.crc32(data) >>> 0,
      size: data.length,
      csize: body.length,
      method: stored ? 0 : 8,
      time,
      date,
      unix: Math.floor(mtime.getTime() / 1000),
      offset: this.offset
    }
    if (entry.size >= MAX32) throw new Error(`Plik za duży do kopii: ${name}`)
    const extra = timestampExtra(entry.unix)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(VERSION_NEEDED, 4)
    head.writeUInt16LE(FLAG_UTF8, 6)
    head.writeUInt16LE(entry.method, 8)
    head.writeUInt16LE(entry.time, 10)
    head.writeUInt16LE(entry.date, 12)
    head.writeUInt32LE(entry.crc, 14)
    head.writeUInt32LE(entry.csize, 18)
    head.writeUInt32LE(entry.size, 22)
    head.writeUInt16LE(entry.name.length, 26)
    head.writeUInt16LE(extra.length, 28)
    this.entries.push(entry)
    await this.write(head, entry.name, extra, body)
  }

  /** The central directory and the end records; the file is complete once this resolves. */
  async finish(): Promise<number> {
    const cdStart = this.offset
    for (const e of this.entries) {
      const zip64 = e.offset >= MAX32
      const extra = zip64 ? Buffer.alloc(12) : Buffer.alloc(0)
      if (zip64) {
        extra.writeUInt16LE(0x0001, 0)
        extra.writeUInt16LE(8, 2)
        extra.writeBigUInt64LE(BigInt(e.offset), 4)
      }
      const time = timestampExtra(e.unix)
      const rec = Buffer.alloc(46)
      rec.writeUInt32LE(0x02014b50, 0)
      rec.writeUInt16LE(VERSION_MADE_BY, 4)
      rec.writeUInt16LE(zip64 ? VERSION_ZIP64 : VERSION_NEEDED, 6)
      rec.writeUInt16LE(FLAG_UTF8, 8)
      rec.writeUInt16LE(e.method, 10)
      rec.writeUInt16LE(e.time, 12)
      rec.writeUInt16LE(e.date, 14)
      rec.writeUInt32LE(e.crc, 16)
      rec.writeUInt32LE(e.csize, 20)
      rec.writeUInt32LE(e.size, 24)
      rec.writeUInt16LE(e.name.length, 28)
      rec.writeUInt16LE(time.length + extra.length, 30)
      rec.writeUInt16LE(0, 32)
      rec.writeUInt16LE(0, 34)
      rec.writeUInt16LE(0, 36)
      rec.writeUInt32LE((FILE_MODE << 16) >>> 0, 38)
      rec.writeUInt32LE(zip64 ? MAX32 : e.offset, 42)
      await this.write(rec, e.name, time, extra)
    }
    const cdSize = this.offset - cdStart
    const count = this.entries.length
    const zip64 = count >= MAX16 || cdStart >= MAX32 || cdSize >= MAX32
    if (zip64) {
      const recordAt = this.offset
      const rec = Buffer.alloc(56)
      rec.writeUInt32LE(0x06064b50, 0)
      rec.writeBigUInt64LE(44n, 4)
      rec.writeUInt16LE(VERSION_MADE_BY, 12)
      rec.writeUInt16LE(VERSION_ZIP64, 14)
      rec.writeUInt32LE(0, 16)
      rec.writeUInt32LE(0, 20)
      rec.writeBigUInt64LE(BigInt(count), 24)
      rec.writeBigUInt64LE(BigInt(count), 32)
      rec.writeBigUInt64LE(BigInt(cdSize), 40)
      rec.writeBigUInt64LE(BigInt(cdStart), 48)
      const locator = Buffer.alloc(20)
      locator.writeUInt32LE(0x07064b50, 0)
      locator.writeUInt32LE(0, 4)
      locator.writeBigUInt64LE(BigInt(recordAt), 8)
      locator.writeUInt32LE(1, 16)
      await this.write(rec, locator)
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(zip64 ? MAX16 : count, 8)
    end.writeUInt16LE(zip64 ? MAX16 : count, 10)
    end.writeUInt32LE(zip64 ? MAX32 : cdSize, 12)
    end.writeUInt32LE(zip64 ? MAX32 : cdStart, 16)
    end.writeUInt16LE(0, 20)
    await this.write(end)
    await this.flush()
    return count
  }

  private async write(...parts: Buffer[]): Promise<void> {
    for (const p of parts) {
      if (!p.length) continue
      this.chunks.push(p)
      this.pending += p.length
      this.offset += p.length
    }
    if (this.pending >= FLUSH_BYTES) await this.flush()
  }

  private async flush(): Promise<void> {
    if (!this.chunks.length) return
    const buf = Buffer.concat(this.chunks)
    this.chunks = []
    this.pending = 0
    for (let at = 0; at < buf.length; ) at += (await this.fh.write(buf, at, buf.length - at)).bytesWritten
  }
}

/** One read of a file: its stat and its content through one open; null = gone (or not a file any more). */
async function readOnce(abs: string): Promise<{ st: Stats; data: Buffer } | null> {
  let fh
  try {
    fh = await fs.open(abs, 'r')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
  try {
    const st = await fh.stat()
    // readFile reads the size the file has when it begins: a log appended to meanwhile gives the prefix it had then.
    return st.isFile() ? { st, data: await fh.readFile() } : null
  } finally {
    await fh.close()
  }
}

/** A file's stat and content, the open and the read retried together while the file is held (OneDrive, antivirus). */
function readFile(abs: string): Promise<{ st: Stats; data: Buffer } | null> {
  return withRetry(() => readOnce(abs))
}

/** One file of a ZIP: its name, and its content with its time (null = left out – gone meanwhile). */
export interface ZipSource {
  name: string
  read: () => ZipContent | null | Promise<ZipContent | null>
}

export interface ZipContent {
  data: Buffer
  mtime: Date
}

/** A file on the disk, read whole at once when its turn comes; gone = left out, unreadable = an error. */
export function diskSource(abs: string, name: string): ZipSource {
  return {
    name,
    read: async () => {
      const f = await readFile(abs)
      return f && { data: f.data, mtime: f.st.mtime }
    }
  }
}

/**
 * Run `fn` over items with bounded concurrency, preserving the order of results (FI fsutil `mapLimit`, without the
 * abort signal nobody here uses).
 */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Files under `root`, relative with forward slashes (FI fsutil `walkFiles`); `skip` – paths (files or folders) neither
 * listed nor walked. A folder gone meanwhile is left out; `root` itself missing or unreadable is an error.
 */
export async function walkFiles(root: string, skip?: (rel: string) => boolean): Promise<string[]> {
  const out: string[] = []
  async function visit(abs: string, rel: string): Promise<void> {
    let entries
    try {
      entries = await withRetry(() => fs.readdir(abs, { withFileTypes: true }))
    } catch (e) {
      if (rel && (e as NodeJS.ErrnoException).code === 'ENOENT') return
      throw e
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (skip?.(childRel)) continue
      if (entry.isDirectory()) await visit(join(abs, entry.name), childRel)
      else if (entry.isFile()) out.push(childRel)
    }
  }
  await visit(root, '')
  return out
}

/**
 * Write the files in the order given into `outFile`, atomically (a temp file renamed over it). Already-compressed
 * images are stored; the contents of a batch are got side by side (disk reads), compressed and appended in order.
 */
export async function writeZipFile(outFile: string, items: readonly ZipSource[]): Promise<ZipResult> {
  await fs.mkdir(dirname(outFile), { recursive: true })
  const tmp = tempPathFor(outFile)
  const skipped: string[] = []
  try {
    const fh = await fs.open(tmp, 'w')
    let files: number
    try {
      const zip = new ZipWriter(fh)
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH)
        const contents = await mapLimit(batch, READ_CONCURRENCY, async (item) => item.read())
        for (let j = 0; j < batch.length; j++) {
          const content = contents[j]
          const name = batch[j]!.name
          if (!content) {
            skipped.push(name)
            continue
          }
          const compress = content.data.length > 0 && !/\.(webp|png|jpe?g|zip)$/i.test(name)
          await zip.add(name, content.data, content.mtime, compress ? zlib.deflateRawSync(content.data, DEFLATE) : null)
          if (j % SLICE === SLICE - 1) await tick()
        }
      }
      files = await zip.finish()
      await fh.sync()
    } finally {
      await fh.close()
    }
    await withRetry(() => fs.rename(tmp, outFile))
    return { files, bytes: (await fs.stat(outFile)).size, skipped }
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}

/**
 * Zip files under `root` (relative paths accepted by `include`; folders `skip` names are not walked – `.history/` with
 * a folder per record, W7) into `outFile`, atomically. Each file is read whole at once (`source`, by default as it is on
 * the disk), so one rewritten meanwhile (an atomic write replaces it) goes in old or new, never half; one gone before
 * its turn is left out and named. A file held while zipping fails the attempt; it is retried once with a fresh listing
 * before giving up.
 */
export async function zipFolder(
  root: string,
  outFile: string,
  include: (rel: string) => boolean,
  skip?: (rel: string) => boolean,
  source: (abs: string, rel: string) => ZipSource = diskSource
): Promise<ZipResult> {
  for (let attempt = 1; ; attempt++) {
    const rels = (await walkFiles(root, skip)).filter(include).sort()
    const items = rels.map((rel) => source(join(root, ...rel.split('/')), rel))
    try {
      return await writeZipFile(outFile, items)
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading (new against FI, which reads with yauzl)

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_END = 0x06054b50
const SIG_END64 = 0x06064b50
const SIG_LOCATOR64 = 0x07064b50
const END_LEN = 22
const LOCATOR64_LEN = 20
const END64_LEN = 56
const CENTRAL_LEN = 46
const LOCAL_LEN = 30
const FLAG_ENCRYPTED = 0x0001

/** One file of a ZIP as its central directory describes it. */
export interface ZipEntry {
  /** As stored: forward slashes in this app's ZIPs; a foreign ZIP may hold anything (check before using it as a path). */
  name: string
  size: number
  csize: number
  method: number
  crc: number
  flags: number
  /** Where its local header is. */
  offset: number
}

const damaged = (why: string) => new Error(`Uszkodzony plik ZIP: ${why}`)

/** Exactly `length` bytes from `position`; fewer in the file = a cut ZIP. */
async function readAt(fh: fs.FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length)
  for (let at = 0; at < length; ) {
    const { bytesRead } = await fh.read(buf, at, length - at, position + at)
    if (!bytesRead) throw damaged('plik jest ucięty')
    at += bytesRead
  }
  return buf
}

const inflateRaw = (data: Buffer, maxOutputLength: number) =>
  new Promise<Buffer>((resolve, reject) => zlib.inflateRaw(data, { maxOutputLength }, (e, out) => (e ? reject(e) : resolve(out))))

/** The entries of the central directory (ZIP64 end records and extra fields understood). */
async function readDirectory(fh: fs.FileHandle, fileSize: number): Promise<ZipEntry[]> {
  const tailLen = Math.min(fileSize, END_LEN + MAX16)
  const tailAt = fileSize - tailLen
  const tail = await readAt(fh, tailAt, tailLen)
  let end = -1
  for (let i = tailLen - END_LEN; i >= 0; i--) {
    if (tail.readUInt32LE(i) === SIG_END && i + END_LEN + tail.readUInt16LE(i + 20) === tailLen) {
      end = i
      break
    }
  }
  if (end < 0) throw damaged('brak katalogu plików')
  let count = tail.readUInt16LE(end + 10)
  let cdSize = tail.readUInt32LE(end + 12)
  let cdStart = tail.readUInt32LE(end + 16)
  const locatorAt = tailAt + end - LOCATOR64_LEN
  if ((count === MAX16 || cdSize === MAX32 || cdStart === MAX32) && locatorAt >= 0) {
    const locator = await readAt(fh, locatorAt, LOCATOR64_LEN)
    if (locator.readUInt32LE(0) === SIG_LOCATOR64) {
      const recordAt = Number(locator.readBigUInt64LE(8))
      if (recordAt + END64_LEN > fileSize) throw damaged('rekord ZIP64 poza plikiem')
      const rec = await readAt(fh, recordAt, END64_LEN)
      if (rec.readUInt32LE(0) !== SIG_END64) throw damaged('rekord ZIP64')
      count = Number(rec.readBigUInt64LE(32))
      cdSize = Number(rec.readBigUInt64LE(40))
      cdStart = Number(rec.readBigUInt64LE(48))
    }
  }
  if (cdStart + cdSize > fileSize) throw damaged('katalog plików poza plikiem')
  const cd = await readAt(fh, cdStart, cdSize)
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < count; i++) {
    if (p + CENTRAL_LEN > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL) throw damaged('katalog plików')
    const flags = cd.readUInt16LE(p + 8)
    const nameEnd = p + CENTRAL_LEN + cd.readUInt16LE(p + 28)
    const extraEnd = nameEnd + cd.readUInt16LE(p + 30)
    const next = extraEnd + cd.readUInt16LE(p + 32)
    if (next > cd.length) throw damaged('katalog plików')
    const entry: ZipEntry = {
      name: cd.toString(flags & FLAG_UTF8 ? 'utf8' : 'latin1', p + CENTRAL_LEN, nameEnd),
      method: cd.readUInt16LE(p + 10),
      crc: cd.readUInt32LE(p + 16),
      csize: cd.readUInt32LE(p + 20),
      size: cd.readUInt32LE(p + 24),
      flags,
      offset: cd.readUInt32LE(p + 42)
    }
    // ZIP64 extended information: the 64-bit values of the fields set to 0xFFFFFFFF, in this order.
    for (let q = nameEnd; q + 4 <= extraEnd; ) {
      const id = cd.readUInt16LE(q)
      const len = cd.readUInt16LE(q + 2)
      if (id === 0x0001) {
        let at = q + 4
        const field = (): number => {
          if (at + 8 > q + 4 + len) throw damaged('pole ZIP64')
          const v = Number(cd.readBigUInt64LE(at))
          at += 8
          return v
        }
        if (entry.size === MAX32) entry.size = field()
        if (entry.csize === MAX32) entry.csize = field()
        if (entry.offset === MAX32) entry.offset = field()
      }
      q += 4 + len
    }
    entries.push(entry)
    p = next
  }
  return entries
}

/**
 * A ZIP opened for reading: its entries listed from the central directory, each read whole on demand and checked (size,
 * CRC). Errors are „Uszkodzony plik ZIP: …” for a damaged or foreign file, the fs error for an unreadable one.
 */
export class ZipReader {
  private constructor(
    private readonly fh: fs.FileHandle,
    private readonly fileSize: number,
    readonly entries: readonly ZipEntry[]
  ) {}

  static async open(file: string): Promise<ZipReader> {
    const fh = await withRetry(() => fs.open(file, 'r'))
    try {
      const size = (await fh.stat()).size
      return new ZipReader(fh, size, await readDirectory(fh, size))
    } catch (e) {
      await fh.close().catch(() => undefined)
      throw e
    }
  }

  /** The content of one entry (stored or deflated), never more bytes than its declared size. */
  async read(entry: ZipEntry): Promise<Buffer> {
    if (entry.flags & FLAG_ENCRYPTED) throw damaged(`${entry.name}: wpis zaszyfrowany`)
    if (entry.offset + LOCAL_LEN > this.fileSize) throw damaged(`${entry.name}: wpis poza plikiem`)
    const head = await readAt(this.fh, entry.offset, LOCAL_LEN)
    if (head.readUInt32LE(0) !== SIG_LOCAL) throw damaged(`${entry.name}: nagłówek wpisu`)
    const dataAt = entry.offset + LOCAL_LEN + head.readUInt16LE(26) + head.readUInt16LE(28)
    if (dataAt + entry.csize > this.fileSize) throw damaged(`${entry.name}: wpis poza plikiem`)
    const raw = await readAt(this.fh, dataAt, entry.csize)
    let data: Buffer
    if (entry.method === 0) data = raw
    else if (entry.method === 8) {
      try {
        data = await inflateRaw(raw, Math.max(1, entry.size))
      } catch (e) {
        throw damaged(`${entry.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else throw damaged(`${entry.name}: nieobsługiwana metoda kompresji ${entry.method}`)
    if (data.length !== entry.size || zlib.crc32(data) >>> 0 !== entry.crc) throw damaged(`${entry.name}: zawartość nie zgadza się z sumą kontrolną`)
    return data
  }

  close(): Promise<void> {
    return this.fh.close()
  }
}

/** `fn` over a ZIP opened for reading; closed afterwards whatever happens. */
export async function withZip<T>(file: string, fn: (zip: ZipReader) => Promise<T>): Promise<T> {
  const zip = await ZipReader.open(file)
  try {
    return await fn(zip)
  } finally {
    await zip.close()
  }
}
