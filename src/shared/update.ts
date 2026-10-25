// adapted from FI src/shared/update.ts @ de81f2b
/**
 * Updates from GitHub Releases, the pure parts (spec „Instalacja, aktualizacje i log”): the public repository, the list
 * of releases (per_page=20 with If-None-Match), a release counts only without being a draft or a test version and with
 * the installer, its manifest and SHA256SUMS.txt; checksums verified before anything runs.
 */
import { z } from 'zod'

export const UPDATE_REPO = { owner: 'Clatir', repo: 'RegulatedDay' } as const
export const GITHUB_API = 'https://api.github.com'
export const RELEASES_PAGE = `https://github.com/${UPDATE_REPO.owner}/${UPDATE_REPO.repo}/releases`
export const SETUP_ASSET = 'Regulated-Day-Setup.exe'
export const MANIFEST_ASSET = 'Regulated-Day-manifest.json'
export const CHECKSUMS_ASSET = 'SHA256SUMS.txt'
/** The fixed nsis.guid (electron-builder.cjs): the uninstall entry and the installer's mutex are named by it. */
export const NSIS_GUID = 'E2A45BEE-EF15-48BC-9498-F12E5B866145'
export const UNINSTALL_KEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${NSIS_GUID}`

/** Checks at most this often on one computer (spec „Schematy…”: najwyżej raz na 10 min). */
export const CHECK_MIN_INTERVAL_MS = 10 * 60_000
/** After a refusal of the server (GitHub's limit of queries) the next try waits ever longer, up to this. */
export const CHECK_BACKOFF_MAX_MS = 6 * 60 * 60_000

export interface ReleaseAsset {
  name: string
  size: number
  url: string
  /** sha256 hex reported by GitHub (asset "digest"), when present. */
  sha256: string | null
}

export interface ReleaseInfo {
  version: string
  tag: string
  name: string
  notes: string
  publishedAt: string | null
  htmlUrl: string
  assets: ReleaseAsset[]
}

// ---------------------------------------------------------------- versions

export interface Version {
  major: number
  minor: number
  patch: number
  pre: string[]
}

export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] }
}

/** Semantic-version precedence: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) throw new Error(`Nieprawidłowy numer wersji: ${!x ? a : b}`)
  for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] - y[k]
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) - Number(q)
    if (pn !== qn) return pn ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

export const isNewerVersion = (candidate: string, current: string): boolean => compareVersions(candidate, current) > 0

// ---------------------------------------------------------------- GitHub releases

const assetSchema = z.looseObject({
  name: z.string().min(1),
  size: z.number().nonnegative(),
  browser_download_url: z.string().min(1),
  digest: z.string().nullable().optional()
})

const releaseSchema = z.looseObject({
  tag_name: z.string().min(1),
  name: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  html_url: z.string().min(1),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z.array(assetSchema)
})

/** The usable releases of the list, newest first: no drafts, no test versions, no release without the installer, its manifest or checksums. */
export function parseReleases(json: unknown): ReleaseInfo[] {
  if (!Array.isArray(json)) throw new Error('Nieoczekiwana odpowiedź GitHub (brak listy wydań).')
  const out: ReleaseInfo[] = []
  for (const item of json) {
    const r = releaseSchema.safeParse(item)
    if (!r.success || r.data.draft || r.data.prerelease) continue
    const v = parseVersion(r.data.tag_name)
    if (!v || v.pre.length) continue
    const assets = r.data.assets.map((a) => ({
      name: a.name,
      size: a.size,
      url: a.browser_download_url,
      sha256: a.digest && /^sha256:[0-9a-f]{64}$/i.test(a.digest) ? a.digest.slice(7).toLowerCase() : null
    }))
    const has = (n: string) => assets.some((a) => a.name === n)
    if (!has(SETUP_ASSET) || !has(MANIFEST_ASSET) || !has(CHECKSUMS_ASSET)) continue
    const version = r.data.tag_name.trim().replace(/^v/, '')
    out.push({
      version,
      tag: r.data.tag_name,
      name: r.data.name?.trim() || `Wersja ${version}`,
      notes: (r.data.body ?? '').replace(/\r\n/g, '\n').trim(),
      publishedAt: r.data.published_at ?? null,
      htmlUrl: r.data.html_url,
      assets
    })
  }
  return out.sort((a, b) => compareVersions(b.version, a.version))
}

/** Parse `sha256sum` output ("<hex>  <name>" or "<hex> *<name>"). */
export function parseChecksums(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim())
    if (m) out.set(m[2] as string, (m[1] as string).toLowerCase())
  }
  return out
}

/**
 * Expected sha256 of an asset: from SHA256SUMS.txt and/or the GitHub digest. When both exist they must agree; with neither
 * the update is refused (an executable is never run unverified).
 */
export function expectedSha256(asset: ReleaseAsset, sums: Map<string, string> | null): string {
  const fromSums = sums?.get(asset.name) ?? null
  if (fromSums && asset.sha256 && fromSums !== asset.sha256) throw new Error('Sumy kontrolne wydania się nie zgadzają – aktualizacja wstrzymana.')
  const hash = fromSums ?? asset.sha256
  if (!hash) throw new Error(`Wydanie nie zawiera sumy kontrolnej pliku ${asset.name} – aktualizacja wstrzymana.`)
  return hash
}

/** The delay before the next check after `refusals` refusals of the server in a row: 10 min, 20, 40 … at most 6 h. */
export const backoffMs = (refusals: number): number => Math.min(CHECK_BACKOFF_MAX_MS, CHECK_MIN_INTERVAL_MS * 2 ** Math.max(0, refusals - 1))

// ---------------------------------------------------------------- the manifest

export interface ManifestFile {
  path: string
  size: number
  sha256: string
}

export interface ReleaseManifest {
  format: number
  version: string
  electron: string
  files: ManifestFile[]
}

const manifestSchema = z.looseObject({
  format: z.number().int(),
  version: z.string().min(1),
  electron: z.string().min(1),
  files: z.array(z.looseObject({ path: z.string().min(1), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
})

export function parseManifest(text: string): ReleaseManifest {
  const r = manifestSchema.safeParse(JSON.parse(text))
  if (!r.success) throw new Error('Manifest wydania jest nieczytelny.')
  return { format: r.data.format, version: r.data.version, electron: r.data.electron, files: r.data.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })) }
}
