#!/usr/bin/env node
// adapted from FI scripts/check-context.mjs @ e2cd030
// Keeps the files Claude Code loads on its own small: CLAUDE.md (every turn of every session and subagent),
// docs/postep.md (read on every resume) and the path-scoped rules in .claude/rules/. Fails CI when one outgrows
// its limit – history belongs in CHANGELOG.md and docs/archiwum/, module knowledge in .claude/rules/.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const limits = [
  { file: 'CLAUDE.md', lines: 200, kb: 20 },
  { file: 'docs/postep.md', lines: 400, kb: 60 },
  // The register of decisions has a limit too (spec „Dokumenty w repozytorium”): replaced decisions go to the archive.
  { file: 'docs/decyzje.md', lines: 1000, kb: 200 },
]
const rules = new URL('.claude/rules/', root)
if (existsSync(rules)) {
  for (const name of readdirSync(rules).filter((n) => n.endsWith('.md')).sort()) {
    limits.push({ file: `.claude/rules/${name}`, lines: 200, kb: 20 })
  }
}

let failed = false
for (const { file, lines, kb } of limits) {
  const text = readFileSync(new URL(file, root), 'utf8')
  const count = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  const size = Buffer.byteLength(text) / 1024
  const ok = count <= lines && size <= kb
  console.log(`${ok ? 'ok ' : 'ZA DUŻY'} ${file}: ${count} / ${lines} linii, ${size.toFixed(1)} / ${kb} KB`)
  if (!ok) failed = true
}
if (failed) {
  console.error('Historia → CHANGELOG.md albo docs/archiwum/, wiedza modułu → .claude/rules/<moduł>.md.')
  process.exit(1)
}
