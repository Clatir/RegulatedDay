/**
 * A simulated OneDrive between two computers (plan E1 „symulator synchronizacji”): two folders on the disk, each the
 * local copy of one computer, kept in step by a sync with its own virtual clock and seeded randomness. It reproduces
 * what OneDrive does to the app's files: random delays per file (so changes arrive out of order), a log handed over
 * with a cut last line, conflict copies when both sides changed a file, the computer's own log swapped for an older
 * version, an atomic rename seen as a removal and a creation, times of modification from the other computer's clock,
 * and a computer whose sync is paused (90 min, or while it is off). Listing errors come from `FaultyFs`.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

/** A small seeded random generator (mulberry32): the same seed gives the same run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Side {
  name: string
  /** The computer's name as OneDrive puts it into conflict copies (upper case). */
  host: string
  dir: string
  /** The computer's wall clock minus the true time (ms). */
  skew: number
}

export interface SyncOptions {
  /** Delay of a file's transfer: uniform in [min, max] ms. */
  delay: [number, number]
  /** Chance that a log goes over first with its last line cut. */
  cutTail: number
  /** Chance that a computer's own log is swapped for an older version it had sent before. */
  swapOwnLog: number
  /** Chance that a replaced file is seen first as removed (then created). */
  renameGap: number
}

interface Transfer {
  rel: string
  from: Side
  to: Side
  due: number
  bytes: Buffer
  mtimeMs: number
  /** The version the target side had when this change started (a change there meanwhile is a conflict). */
  targetBase: string | null
  stage: 'full' | 'cut' | 'removed'
}

const hash = (b: Buffer) => createHash('sha1').update(b).digest('hex')

function walk(root: string, dir = ''): string[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(root, rel))
    else if (!e.name.includes('.tmp-')) out.push(rel)
  }
  return out
}

export class OneDriveSim {
  /** What each side's file was when the sync last saw or wrote it: rel → hash. */
  private readonly known = new Map<string, Map<string, string>>()
  private readonly sent = new Map<string, Buffer[]>()
  private transfers: Transfer[] = []
  readonly paused = new Set<string>()
  readonly stats = { transfers: 0, cut: 0, conflicts: 0, swaps: 0, gaps: 0 }

  constructor(
    private readonly a: Side,
    private readonly b: Side,
    private readonly opts: SyncOptions,
    private readonly random: () => number
  ) {
    this.known.set(a.name, new Map())
    this.known.set(b.name, new Map())
  }

  private other(s: Side): Side {
    return s === this.a ? this.b : this.a
  }

  /** One step of the sync at true time `now`: new local changes start their way, transfers that are due land. */
  tick(now: number): void {
    for (const side of [this.a, this.b]) {
      if (this.paused.has(side.name)) continue
      const known = this.known.get(side.name)!
      for (const rel of walk(side.dir)) {
        const abs = join(side.dir, rel)
        let bytes: Buffer
        try {
          bytes = readFileSync(abs)
        } catch {
          continue
        }
        const h = hash(bytes)
        if (known.get(rel) === h) continue
        known.set(rel, h)
        const to = this.other(side)
        const [min, max] = this.opts.delay
        const base = this.known.get(to.name)!.get(rel) ?? null
        // The same file already on its way: the newer version goes in its place, no later than it would have landed
        // (OneDrive sends the latest – a file written every minute still arrives).
        const before = this.transfers.find((t) => t.rel === rel && t.from === side)
        const due = Math.min(before?.due ?? Number.POSITIVE_INFINITY, now + min + this.random() * (max - min))
        this.transfers = this.transfers.filter((t) => t !== before)
        const mtimeMs = statSync(abs).mtimeMs
        const stage: Transfer['stage'] = rel.endsWith('.jsonl') && this.random() < this.opts.cutTail ? 'cut' : existsSync(join(to.dir, rel)) && this.random() < this.opts.renameGap ? 'removed' : 'full'
        this.transfers.push({ rel, from: side, to, due, bytes, mtimeMs, targetBase: base, stage })
        const list = this.sent.get(`${side.name}:${rel}`) ?? []
        list.push(bytes)
        this.sent.set(`${side.name}:${rel}`, list.slice(-5))
      }
    }
    const due = this.transfers.filter((t) => t.due <= now && !this.paused.has(t.to.name) && !this.paused.has(t.from.name))
    this.transfers = this.transfers.filter((t) => !due.includes(t))
    for (const t of due) this.land(t, now)
    this.maybeSwapOwnLog()
  }

  private write(side: Side, rel: string, bytes: Buffer, mtimeMs: number): void {
    const abs = join(side.dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, bytes)
    // The time of modification comes from the other computer's clock.
    const t = new Date(mtimeMs)
    utimesSync(abs, t, t)
    this.known.get(side.name)!.set(rel, hash(bytes))
  }

  private land(t: Transfer, now: number): void {
    this.stats.transfers++
    const abs = join(t.to.dir, t.rel)
    const nowThere = existsSync(abs) ? hash(readFileSync(abs)) : null
    const changedThere = nowThere != null && nowThere !== t.targetBase && nowThere !== hash(t.bytes)
    if (changedThere && !t.rel.endsWith('.jsonl')) {
      // Both sides changed it: OneDrive keeps the local one and puts the incoming one beside it.
      const dot = t.rel.lastIndexOf('.')
      const copy = `${t.rel.slice(0, dot)}-${t.from.host}${t.rel.slice(dot)}`
      this.write(t.to, copy, t.bytes, t.mtimeMs)
      this.stats.conflicts++
      return
    }
    if (changedThere && t.rel.endsWith('.jsonl')) {
      // A log changed on both sides (a computer appended to the other's file never – but OneDrive may still decide so).
      const dot = t.rel.lastIndexOf('.')
      this.write(t.to, `${t.rel.slice(0, dot)}-${t.from.host}${t.rel.slice(dot)}`, t.bytes, t.mtimeMs)
      this.stats.conflicts++
      return
    }
    if (t.stage === 'cut') {
      const text = t.bytes.toString('utf8')
      const lastNl = text.lastIndexOf('\n', text.length - 2)
      const cut = lastNl > 0 ? lastNl + 1 + Math.floor(this.random() * Math.max(1, text.length - lastNl - 2)) : Math.floor(text.length / 2)
      this.write(t.to, t.rel, Buffer.from(text.slice(0, cut), 'utf8'), t.mtimeMs)
      this.stats.cut++
      this.transfers.push({ ...t, stage: 'full', due: now + 20_000, targetBase: hash(Buffer.from(text.slice(0, cut), 'utf8')) })
      return
    }
    if (t.stage === 'removed') {
      rmSync(abs, { force: true })
      this.known.get(t.to.name)!.delete(t.rel)
      this.stats.gaps++
      this.transfers.push({ ...t, stage: 'full', due: now + 5_000, targetBase: null })
      return
    }
    this.write(t.to, t.rel, t.bytes, t.mtimeMs)
  }

  /** Now and then a computer's own log is swapped for a version it sent before (OneDrive „restores” the server's copy). */
  private maybeSwapOwnLog(): void {
    if (this.random() >= this.opts.swapOwnLog) return
    const side = this.random() < 0.5 ? this.a : this.b
    if (this.paused.has(side.name)) return
    const own = [...this.sent.keys()].filter((k) => k.startsWith(`${side.name}:log/`) && k.endsWith(`/${side.name}.jsonl`))
    const key = own[Math.floor(this.random() * own.length)]
    const versions = key ? this.sent.get(key) : undefined
    if (!key || !versions || versions.length < 2) return
    const rel = key.slice(side.name.length + 1)
    this.write(side, rel, versions[0]!, Date.now())
    this.stats.swaps++
  }

  /**
   * A conflict copy of a computer's own log: its file is swapped for an older version and the version it had goes beside
   * it as „<computer>-<HOST>.jsonl” (OneDrive keeping both after the swap).
   */
  injectLogConflict(side: Side, rel: string): boolean {
    const versions = this.sent.get(`${side.name}:${rel}`)
    const abs = join(side.dir, rel)
    if (!versions || versions.length < 2 || !existsSync(abs)) return false
    const current = readFileSync(abs)
    this.write(side, rel, versions[0]!, Date.now())
    this.write(side, rel.replace(/\.jsonl$/, `-${side.host}.jsonl`), current, Date.now())
    this.stats.conflicts++
    return true
  }

  /** Nothing is on its way any more. */
  get idle(): boolean {
    return this.transfers.length === 0
  }
}

/** A file system over the real one that fails listings now and then („przejściowe błędy odczytu listy plików”). */
export function faultyFs(random: () => number, listErrors: number): DataFs & { failures: number } {
  const fs: DataFs & { failures: number } = {
    ...nodeFs,
    failures: 0,
    async list(abs) {
      if (random() < listErrors) {
        fs.failures++
        throw Object.assign(new Error('EIO: odczyt listy plików nie powiódł się'), { code: 'EIO' })
      }
      return nodeFs.list(abs)
    }
  }
  return fs
}
