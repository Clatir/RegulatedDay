/**
 * Access to the data folder, behind one interface (spec „Zapis jest atomowy, z ponowieniem przy blokadzie OneDrive albo
 * antywirusa”): the real one on node:fs, and in tests a faulty one over it (the sync simulator of E1 fails listings,
 * locks files and shows other computers' clocks). A file that cannot be read now is read again; only a syntax error
 * makes a file broken, and an unreadable one is never taken as empty. A failed listing is „unknown”, never an empty
 * folder (in FI an empty list from a read error gave an empty day).
 */
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { withRetry, writeFileAtomic } from '../datastore/atomic'

export interface Entry {
  name: string
  dir: boolean
}

export interface Stat {
  size: number
  mtimeMs: number
}

export interface DataFs {
  /** The file's bytes; ENOENT → null; other errors after the retries throw (never „empty”). */
  read(abs: string): Promise<Buffer | null>
  /** The folder's entries; a missing folder → []; any other failure throws („unknown”). */
  list(abs: string): Promise<Entry[]>
  stat(abs: string): Promise<Stat | null>
  writeAtomic(abs: string, data: string | Uint8Array): Promise<void>
  /** Appends to a file (made with its folder when missing). */
  append(abs: string, text: string): Promise<void>
  remove(abs: string): Promise<void>
}

const code = (e: unknown) => (e as NodeJS.ErrnoException).code

export const nodeFs: DataFs = {
  async read(abs) {
    try {
      return await withRetry(() => fs.readFile(abs), 10)
    } catch (e) {
      if (code(e) === 'ENOENT') return null
      throw e
    }
  },
  async list(abs) {
    try {
      const entries = await withRetry(() => fs.readdir(abs, { withFileTypes: true }), 10)
      return entries.map((d) => ({ name: d.name, dir: d.isDirectory() }))
    } catch (e) {
      if (code(e) === 'ENOENT') return []
      throw e
    }
  },
  async stat(abs) {
    try {
      const st = await withRetry(() => fs.stat(abs), 10)
      return { size: st.size, mtimeMs: st.mtimeMs }
    } catch (e) {
      if (code(e) === 'ENOENT') return null
      throw e
    }
  },
  writeAtomic: (abs, data) => writeFileAtomic(abs, data),
  async append(abs, text) {
    await fs.mkdir(dirname(abs), { recursive: true })
    await withRetry(() => fs.appendFile(abs, text, 'utf8'), 10)
  },
  async remove(abs) {
    await withRetry(() => fs.rm(abs, { force: true }), 10)
  }
}
