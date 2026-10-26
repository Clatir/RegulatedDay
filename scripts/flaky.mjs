#!/usr/bin/env node
/**
 * The log of flaky tests (plan „Plan budowy”): the tests that passed only on their retry, from Playwright's JSON reports,
 * printed and appended to the job's summary on GitHub. Usage: node scripts/flaky.mjs test-results/*.json
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const flaky = []
function walk(suite, file) {
  for (const s of suite.suites ?? []) walk(s, file)
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests ?? []) if (t.status === 'flaky') flaky.push(`${spec.file ?? file}: ${spec.title}`)
}
for (const f of process.argv.slice(2)) {
  if (!existsSync(f)) continue
  const report = JSON.parse(readFileSync(f, 'utf8'))
  for (const s of report.suites ?? []) walk(s, f)
}
const text = flaky.length ? `Niestabilne testy (przeszły dopiero przy ponowieniu):\n${flaky.map((x) => `- ${x}`).join('\n')}` : 'Niestabilne testy: brak'
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
