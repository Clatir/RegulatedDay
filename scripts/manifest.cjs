/**
 * The manifest of a release (spec „Instalacja, aktualizacje i log”): every file of win-unpacked with its size and SHA-256,
 * the version and the Electron version – written as release/Regulated-Day-manifest.json after signing (electron-builder's
 * afterSign). The files the installer adds by itself (the uninstaller, its icon, resources/package-type, the marker
 * resources/rd-installed) are not in win-unpacked, and package-type is left out should a build ever add it. The owner of
 * an installation compares only the files of the manifest; CI checks that a fresh installation agrees with it.
 */
const { createHash } = require('node:crypto')
const { createReadStream, readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } = require('node:fs')
const { join, relative } = require('node:path')

const SKIPPED = new Set(['resources/package-type', 'resources/rd-installed'])
const MANIFEST = 'Regulated-Day-manifest.json'

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

async function buildManifest(appOutDir, version, electron) {
  const files = []
  for (const file of walk(appOutDir).sort()) {
    const path = relative(appOutDir, file).replace(/\\/g, '/')
    if (SKIPPED.has(path)) continue
    files.push({ path, size: statSync(file).size, sha256: await sha256(file) })
  }
  return { format: 1, version, electron, files }
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return
  const version = context.packager.appInfo.version
  const electron = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8')).version
  const manifest = await buildManifest(context.appOutDir, version, electron)
  mkdirSync(context.outDir, { recursive: true })
  writeFileSync(join(context.outDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`  • manifest ${MANIFEST}: ${manifest.files.length} plików, wersja ${version}, Electron ${electron}`)
}

module.exports.buildManifest = buildManifest
module.exports.MANIFEST = MANIFEST
