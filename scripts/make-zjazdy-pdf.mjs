#!/usr/bin/env node
/**
 * Writes tests/fixtures/zjazdy.pdf – the made-up schedule of „zjazdy” of `tests/fixtures/zjazdy-pdf.ts` (D357; no real
 * subject nor name: the repository is public, D279). Run again after a change of the sample:
 *   node scripts/make-zjazdy-pdf.mjs
 * (Node 22.18 or newer – it imports the TypeScript module directly.) tests/unit/zjazdy-pdf.test.ts checks that the file
 * and the sample agree.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { SAMPLE, pdfOf } = await import(new URL('../tests/fixtures/zjazdy-pdf.ts', import.meta.url).href)
const target = fileURLToPath(new URL('../tests/fixtures/zjazdy.pdf', import.meta.url))
writeFileSync(target, pdfOf(SAMPLE))
console.log(`zapisano ${target}`)
