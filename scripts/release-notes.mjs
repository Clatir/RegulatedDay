#!/usr/bin/env node
// adapted from FI scripts/release-notes.mjs @ de81f2b
// Prints the CHANGELOG.md section of a version (default: package.json version) – the GitHub release
// notes the app shows under "Co nowego". Fails when the section is missing, so a version bump without
// notes is caught by CI before anything is published. `--since <version>` (the last published release):
// the sections of the versions between it and this one follow – versions never published (a red CI on
// the default branch) still reach the update's notes.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const sinceAt = args.indexOf('--since')
const since = sinceAt >= 0 ? args.splice(sinceAt, 2)[1] || null : null
const version = args[0] ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const lines = text.split('\n')
// The sections, newest first: their versions and first lines.
const heads = lines.flatMap((l, i) => (l.startsWith('## ') ? [{ i, version: l.slice(3).trim().split(/\s+/)[0] }] : []))
const sectionOf = (v) => {
  const at = heads.findIndex((h) => h.version === v)
  if (at < 0) return null
  return lines.slice(heads[at].i + 1, heads[at + 1]?.i ?? lines.length).join('\n').trim()
}
let notes = sectionOf(version)
if (notes == null) {
  console.error(`CHANGELOG.md nie ma sekcji "## ${version}" – dopisz opis zmian tej wersji.`)
  process.exit(1)
}
if (!notes) {
  console.error(`Sekcja "## ${version}" w CHANGELOG.md jest pusta.`)
  process.exit(1)
}
if (since) {
  const from = heads.findIndex((h) => h.version === version)
  const to = heads.findIndex((h) => h.version === since)
  if (to > from + 1) for (const h of heads.slice(from + 1, to)) notes += `\n\n### ${h.version} (niewydana osobno – zawarta w tej wersji)\n\n${sectionOf(h.version)}`
}
process.stdout.write(`${notes}\n`)
