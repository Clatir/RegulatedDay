// adapted from FI src/main/config.ts @ de81f2b
/**
 * config.json of this computer (never synced). Changed against FI: the fields this version does not know are kept on
 * every level (FI dropped them), the file has a format number, and the computer's id lives in its own file – an
 * unreadable config.json never makes a new one.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
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
  private retryTimer: ReturnType<typeof setTimeout> | null = null

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
      raw = {}
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

  /**
   * config.json was there but unreadable at the load: read again every `everyMs` until it is (the changes held meanwhile
   * then go onto its settings and are written); `onRead` gets the settings as they are now.
   */
  retryLoad(everyMs: number, onRead: (config: MachineConfig) => void): void {
    if (!this.loadFailed || this.retryTimer) return
    // One read at a time: the next is timed from the end of the last.
    const again = () => {
      this.retryTimer = setTimeout(() => {
        this.load().then(
          (c) => {
            if (this.loadFailed) return again()
            this.retryTimer = null
            onRead(c)
          },
          () => again()
        )
      }, everyMs)
      this.retryTimer.unref?.()
    }
    again()
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
 * makes a new id (the computer would turn into another one for the others). The file keeps Windows' own id of the
 * computer it was made on: another one there (the app data copied from another computer) makes a new id – the old one is
 * that computer's (`copiedFrom`, spec „Obecność zapisuje też identyfikator Windows komputera”, A3-05).
 */
export async function computerId(userDataDir: string, copy: string | null, windowsId: string | null = null): Promise<{ id: string; created: boolean; copiedFrom: string | null }> {
  const file = join(userDataDir, 'computer-id')
  const write = (id: string) => writeFileAtomic(file, `${JSON.stringify(windowsId ? { id, windowsId } : { id }, null, 2)}\n`)
  let parsed: { id?: unknown; windowsId?: unknown } | null = null
  try {
    parsed = JSON.parse((await withRetry(() => fs.readFile(file, 'utf8'), 20)).trim()) as { id?: unknown; windowsId?: unknown }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    // There but not readable (EBUSY after the retries): the copy, never a new id.
    if (code && code !== 'ENOENT') {
      if (copy) return { id: copy, created: false, copiedFrom: null }
      throw e
    }
  }
  const id = parsed?.id
  if (typeof id === 'string' && /^[0-9a-z]{8,64}$/i.test(id)) {
    const was = typeof parsed!.windowsId === 'string' ? parsed!.windowsId : null
    // Another computer's (a write that fails throws – never the other one's id again with nothing said).
    if (windowsId && was && was !== windowsId) return renewComputerId(userDataDir, windowsId, id)
    // Made before the id was kept: it is this computer's from now on.
    if (windowsId && !was) await write(id).catch(() => undefined)
    return { id, created: false, copiedFrom: null }
  }
  const fresh = copy ?? randomBytes(10).toString('hex')
  await write(fresh)
  return { id: fresh, created: !copy, copiedFrom: null }
}

/** A new id for this computer, its old one being another computer's (`from`); a write that fails throws. */
export async function renewComputerId(userDataDir: string, windowsId: string | null, from: string): Promise<{ id: string; created: boolean; copiedFrom: string }> {
  const id = randomBytes(10).toString('hex')
  await writeFileAtomic(join(userDataDir, 'computer-id'), `${JSON.stringify(windowsId ? { id, windowsId } : { id }, null, 2)}\n`)
  return { id, created: true, copiedFrom: from }
}

/**
 * Windows' id the data folder's presence of `computer` names (spec: „gdy się nie zgadza … nowy identyfikator”): a profile
 * copied before 0.17.0 has no id of its own to compare – the presence its first computer wrote tells. null: none.
 */
export async function presenceWindowsId(dataDir: string, computer: string): Promise<string | null> {
  try {
    const v = JSON.parse(await fs.readFile(join(dataDir, '.presence', `${computer}.json`), 'utf8')) as { windowsId?: unknown }
    return typeof v.windowsId === 'string' ? v.windowsId : null
  } catch {
    return null
  }
}

/** Windows' own id of this computer (MachineGuid); null off Windows or when it cannot be read. */
export async function windowsMachineId(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await promisify(execFile)('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { timeout: 5_000, windowsHide: true })
    return machineGuidOf(stdout)
  } catch {
    return null
  }
}

/** The MachineGuid in the output of `reg query`. */
export function machineGuidOf(output: string): string | null {
  const m = /MachineGuid\s+REG_SZ\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(output)
  return m ? m[1]!.toLowerCase() : null
}
