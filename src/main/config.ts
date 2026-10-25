// adapted from FI src/main/config.ts @ de81f2b
/**
 * config.json of this computer (never synced). Changed against FI: the fields this version does not know are kept on
 * every level (FI dropped them), the file has a format number, and the computer's id lives in its own file – an
 * unreadable config.json never makes a new one.
 */
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { DEFAULT_CONFIG, configFrom, mergePreserving, type MachineConfig } from '@shared/config'
import { withRetry, writeFileAtomic } from './datastore/atomic'

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export class ConfigStore {
  private config: MachineConfig = { ...DEFAULT_CONFIG }
  /** What the file held, as read: written back under the known fields (unknown ones kept). */
  private raw: unknown = {}
  /**
   * config.json there but not readable now (held by an antivirus or a backup tool at the start with Windows – FI B114): the
   * defaults are used in memory, nothing is written over the file and the autostart is left alone – until it is read.
   */
  loadFailed: string | null = null
  /** A broken config.json moved aside at the load (its new name); the defaults are used. */
  setAside: string | null = null
  /** The changes made while config.json could not be read, field by field: put onto the file's settings once it is read. */
  private held: Array<[string[], unknown]> = []
  /** Writes are queued and always write the latest state, so an older snapshot never lands last. */
  private writing: Promise<void> = Promise.resolve()

  /** `writeDelayMs` – a slow disk in test runs (RD_CONFIG_WRITE_DELAY_MS): each write waits this long first. */
  constructor(
    private readonly userDataDir: string,
    private readonly writeDelayMs = 0
  ) {}

  get file(): string {
    return join(this.userDataDir, 'config.json')
  }

  async load(): Promise<MachineConfig> {
    let text: string
    try {
      text = await withRetry(() => fs.readFile(this.file, 'utf8'), 10)
    } catch (e) {
      // No file: the first start on this computer. Any other error: the file is there – never replaced by defaults.
      this.loadFailed = (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : e instanceof Error ? e.message : String(e)
      this.config = { ...DEFAULT_CONFIG }
      this.raw = {}
      return this.config
    }
    this.loadFailed = null
    let raw: unknown
    try {
      raw = JSON.parse(text)
      if (!isPlain(raw)) throw new Error('not an object')
    } catch {
      // Broken (a power cut while it was written): kept aside for a look, the defaults from here on.
      const aside = `config.uszkodzony-${new Date().toISOString().replace(/[-:.]/g, '')}.json`
      await fs.rename(this.file, join(this.userDataDir, aside)).catch(() => undefined)
      this.setAside = aside
      this.config = { ...DEFAULT_CONFIG }
      this.raw = {}
      return this.config
    }
    this.raw = raw
    this.config = configFrom(raw)
    if (this.held.length) {
      const held = this.held
      this.held = []
      let next: unknown = this.config
      for (const [path, value] of held) next = withValueAt(next, path, value)
      await this.update(configFrom(mergePreserving(this.raw, next)))
    }
    return this.config
  }

  get(): MachineConfig {
    return this.config
  }

  async update(patch: Partial<MachineConfig>): Promise<MachineConfig> {
    const before = this.config
    this.config = { ...this.config, ...patch }
    if (this.loadFailed) {
      this.held.push(...leafChanges(before, this.config))
      return this.config
    }
    const write = this.writing.then(async () => {
      if (this.writeDelayMs) await new Promise((r) => setTimeout(r, this.writeDelayMs))
      await fs.mkdir(this.userDataDir, { recursive: true })
      const merged = mergePreserving(this.raw, this.config)
      this.raw = merged
      await writeFileAtomic(this.file, `${JSON.stringify(merged, null, 2)}\n`)
    })
    this.writing = write.catch(() => undefined)
    await write
    return this.config
  }

  /** Waits for the writes queued so far (the quit waits for them). */
  flush(): Promise<void> {
    return this.writing
  }
}

/** The fields `after` changed against `before`, each with its new value (a list or a value as a whole). */
function leafChanges(before: unknown, after: unknown, path: string[] = [], out: Array<[string[], unknown]> = []): Array<[string[], unknown]> {
  if (isPlain(before) && isPlain(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) leafChanges(before[k], after[k], [...path, k], out)
  } else if (JSON.stringify(before) !== JSON.stringify(after)) out.push([path, after])
  return out
}

/** `obj` with `value` at `path` (objects made on the way, the rest kept). */
function withValueAt(obj: unknown, path: readonly string[], value: unknown): unknown {
  if (!path.length) return value
  const base = isPlain(obj) ? obj : {}
  const [k, ...rest] = path
  return { ...base, [k!]: withValueAt(base[k!], rest, value) }
}

/**
 * This computer's id (spec „Kilka komputerów”): a random id in its own file in the app data, with a copy in config.json.
 * The file missing, the copy restores it; both missing, a new id. A file that cannot be read now is read again – it never
 * makes a new id (the computer would turn into another one for the others).
 */
export async function computerId(userDataDir: string, copy: string | null): Promise<{ id: string; created: boolean }> {
  const file = join(userDataDir, 'computer-id')
  try {
    const text = (await withRetry(() => fs.readFile(file, 'utf8'), 20)).trim()
    const id = (JSON.parse(text) as { id?: unknown }).id
    if (typeof id === 'string' && /^[0-9a-z]{8,64}$/i.test(id)) return { id, created: false }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    // There but not readable (EBUSY after the retries): the copy, never a new id.
    if (code && code !== 'ENOENT') {
      if (copy) return { id: copy, created: false }
      throw e
    }
  }
  const id = copy ?? randomBytes(10).toString('hex')
  await writeFileAtomic(file, `${JSON.stringify({ id }, null, 2)}\n`)
  return { id, created: !copy }
}
