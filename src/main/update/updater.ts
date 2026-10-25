// adapted from FI src/main/update/updater.ts @ de81f2b
/**
 * Checking and downloading updates (spec „Instalacja, aktualizacje i log”): at most once in 10 min on this computer,
 * the list of releases with per_page=20 and If-None-Match; after a refusal of the server (GitHub's limit) the next try
 * waits ever longer. The newest usable release newer than this version is downloaded – the installer and its manifest,
 * both checked against SHA256SUMS.txt – into update\<X>\download; a failed download of a newer version keeps the one
 * downloaded before. The installation itself is install.ts (at the exit, „Zainstaluj teraz”, the start of Windows).
 */
import { existsSync, promises as fs, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHECKSUMS_ASSET,
  CHECK_MIN_INTERVAL_MS,
  MANIFEST_ASSET,
  SETUP_ASSET,
  UPDATE_REPO,
  backoffMs,
  compareVersions,
  expectedSha256,
  isNewerVersion,
  parseChecksums,
  parseReleases,
  type ReleaseInfo
} from '@shared/update'
import type { UpdatePhase, UpdateView } from '@shared/updateView'
import { HttpError, downloadVerified, fetchText, getBody, sha256File, type FetchLike } from './download'
import { writeFileAtomic } from '../datastore/atomic'

export interface Ready {
  version: string
  notes: string
  dir: string
}

export interface UpdaterDeps {
  currentVersion: string
  updateDir: string
  fetch: FetchLike
  /** GitHub API base; a local stand-in in tests (plain http allowed only then). */
  apiBase: string
  allowInsecure: boolean
  log: (level: 'info' | 'warn' | 'error', msg: string, detail?: unknown) => void
  onState: (view: UpdateView) => void
  now?: () => number
  /** Why updates work differently here (e.g. the FI path), shown in the settings. */
  note: () => string | null
  nightInstall: () => boolean
}

const NETWORK_ERROR =
  /net::ERR_|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|fetch failed|failed to fetch|terminated|other side closed|socket hang up|aborted/i

function describeError(e: unknown, during: 'check' | 'download'): string {
  if (e instanceof HttpError) {
    if (e.status === 403 || e.status === 429) return 'GitHub chwilowo ogranicza liczbę zapytań – spróbuję ponownie później.'
    return `GitHub odpowiedział błędem ${e.status}.`
  }
  const err = e instanceof Error ? e : new Error(String(e))
  const text = `${err.message} ${(err.cause as { code?: string; message?: string } | undefined)?.code ?? ''} ${(err.cause as Error | undefined)?.message ?? ''}`
  if (NETWORK_ERROR.test(text)) return during === 'download' ? 'Pobieranie przerwane – połączenie z GitHubem zostało zerwane. Spróbuję ponownie później.' : 'Brak połączenia z GitHubem (praca offline?). Spróbuję ponownie później.'
  return err.message
}

/** The downloads in update\*\download (ready.json beside the files), newest first. */
export function readyDownloads(updateDir: string): Ready[] {
  const out: Ready[] = []
  for (const name of existsSync(updateDir) ? readdirSync(updateDir) : []) {
    const dir = join(updateDir, name, 'download')
    try {
      const r = JSON.parse(readFileSync(join(dir, 'ready.json'), 'utf8')) as { version?: unknown; notes?: unknown }
      if (typeof r.version === 'string' && existsSync(join(dir, SETUP_ASSET)) && existsSync(join(dir, MANIFEST_ASSET))) out.push({ version: r.version, notes: typeof r.notes === 'string' ? r.notes : '', dir })
    } catch {
      /* no ready download there */
    }
  }
  return out.sort((a, b) => compareVersions(b.version, a.version))
}

export class Updater {
  private phase: UpdatePhase = 'idle'
  private latest: ReleaseInfo | null = null
  private ready: Ready | null = null
  private progress: { received: number; total: number } | null = null
  private error: string | null = null
  private lastCheckAt: number | null = null
  private nextAllowedAt = 0
  private refusals = 0
  private etag: string | null = null
  private cachedList: unknown = null
  private timer: ReturnType<typeof setInterval> | null = null
  private downloading: Promise<void> | null = null
  banner: UpdateView['banner'] = null
  whatsNew: UpdateView['whatsNew'] = null

  constructor(private readonly d: UpdaterDeps) {}

  private get now(): number {
    return this.d.now?.() ?? Date.now()
  }

  view(): UpdateView {
    return {
      current: this.d.currentVersion,
      phase: this.phase,
      available: this.ready ? { version: this.ready.version, notes: this.ready.notes } : this.latest ? { version: this.latest.version, notes: this.latest.notes } : null,
      progress: this.progress,
      error: this.error,
      lastCheckAt: this.lastCheckAt,
      note: this.d.note(),
      banner: this.banner,
      whatsNew: this.whatsNew,
      nightInstall: this.d.nightInstall()
    }
  }

  private set(phase: UpdatePhase, patch: { error?: string | null } = {}): void {
    this.phase = phase
    if ('error' in patch) this.error = patch.error ?? null
    this.d.onState(this.view())
  }

  /** The download of an earlier run that is still newer than this version. */
  init(): void {
    const ready = readyDownloads(this.d.updateDir).find((r) => isNewerVersion(r.version, this.d.currentVersion))
    if (ready) {
      this.ready = ready
      this.phase = 'ready'
      this.d.log('info', `pobrana wcześniej wersja ${ready.version} czeka na instalację`)
    }
    this.d.onState(this.view())
  }

  get readyRelease(): Ready | null {
    return this.ready
  }

  startAuto(firstDelayMs: number): void {
    this.stopAuto()
    setTimeout(() => void this.check(false), firstDelayMs).unref?.()
    this.timer = setInterval(() => void this.check(false), CHECK_MIN_INTERVAL_MS)
    this.timer.unref?.()
  }

  stopAuto(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async check(userInitiated: boolean): Promise<UpdateView> {
    if (this.phase === 'checking' || this.phase === 'downloading' || this.phase === 'installing') return this.view()
    const now = this.now
    // At most once in 10 min; after refusals of the server ever later – also a click waits for that.
    if (now < this.nextAllowedAt || (!userInitiated && this.lastCheckAt != null && now - this.lastCheckAt < CHECK_MIN_INTERVAL_MS)) return this.view()
    const previous = this.phase
    this.set('checking', { error: null })
    this.lastCheckAt = now
    try {
      const { owner, repo } = UPDATE_REPO
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': `Regulated-Day/${this.d.currentVersion}`,
        ...(this.etag ? { 'If-None-Match': this.etag } : {})
      }
      const url = `${this.d.apiBase}/repos/${owner}/${repo}/releases?per_page=20`
      const { status, etag, json } = await getBody(this.d.fetch, url, headers, 20_000, async (res) => ({ status: res.status, etag: res.headers.get('etag'), json: res.status === 304 ? null : ((await res.json()) as unknown) }))
      if (status !== 304) {
        this.cachedList = json
        this.etag = etag
      }
      this.refusals = 0
      this.nextAllowedAt = 0
      const releases = parseReleases(this.cachedList ?? [])
      const newest = releases.find((r) => isNewerVersion(r.version, this.d.currentVersion)) ?? null
      if (!newest) {
        this.latest = null
        this.set(previous === 'ready' ? 'ready' : 'up-to-date')
        return this.view()
      }
      this.latest = newest
      if (this.ready && compareVersions(this.ready.version, newest.version) >= 0) {
        this.set('ready')
        return this.view()
      }
      this.set('available')
      this.d.log('info', `aktualizacja dostępna ${newest.version}`)
      void this.download().catch(() => undefined)
    } catch (e) {
      if (e instanceof HttpError && (e.status === 403 || e.status === 429)) {
        this.refusals++
        this.nextAllowedAt = now + backoffMs(this.refusals)
      }
      this.d.log('warn', 'sprawdzenie aktualizacji nie udało się', e instanceof Error ? e.message : e)
      this.set(previous === 'ready' ? 'ready' : 'error', { error: describeError(e, 'check') })
    }
    return this.view()
  }

  async download(): Promise<UpdateView> {
    if (this.downloading) {
      await this.downloading.catch(() => undefined)
      return this.view()
    }
    this.downloading = this.doDownload().finally(() => {
      this.downloading = null
    })
    await this.downloading.catch(() => undefined)
    return this.view()
  }

  private async doDownload(): Promise<void> {
    const release = this.latest
    if (!release) return
    const asset = (n: string) => release.assets.find((a) => a.name === n)!
    const dir = join(this.d.updateDir, release.version, 'download')
    try {
      for (const a of release.assets) if (!a.url.startsWith('https://') && !this.d.allowInsecure) throw new Error('Odrzucono adres pobierania bez HTTPS.')
      const sums = parseChecksums(await fetchText(this.d.fetch, asset(CHECKSUMS_ASSET).url))
      const setup = asset(SETUP_ASSET)
      const manifest = asset(MANIFEST_ASSET)
      const setupSha = expectedSha256(setup, sums)
      const manifestSha = expectedSha256(manifest, sums)
      this.progress = { received: 0, total: setup.size + manifest.size }
      this.set('downloading', { error: null })
      for (const [a, sha] of [
        [manifest, manifestSha],
        [setup, setupSha]
      ] as const) {
        const dest = join(dir, a.name)
        if (existsSync(dest) && (await sha256File(dest)) === sha) continue
        const base = a === setup ? manifest.size : 0
        await downloadVerified(this.d.fetch, a.url, dest, sha, {
          expectedSize: a.size,
          onProgress: (received) => {
            this.progress = { received: base + received, total: setup.size + manifest.size }
          }
        })
      }
      await writeFileAtomic(join(dir, 'ready.json'), `${JSON.stringify({ version: release.version, notes: release.notes, at: this.now }, null, 2)}\n`)
      this.ready = { version: release.version, notes: release.notes, dir }
      this.progress = null
      this.d.log('info', `aktualizacja ${release.version} pobrana (${dir})`)
      this.set('ready', { error: null })
    } catch (e) {
      this.progress = null
      this.d.log('warn', 'pobieranie aktualizacji nie udało się', e instanceof Error ? e.message : e)
      // A version downloaded before stays ready (FI B122).
      this.set(this.ready ? 'ready' : 'error', { error: describeError(e, 'download') })
      await fs.rm(join(dir, 'ready.json'), { force: true }).catch(() => undefined)
    }
  }

  markInstalling(): void {
    this.stopAuto()
    this.set('installing')
  }
}
