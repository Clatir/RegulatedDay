#!/usr/bin/env node
/**
 * Builds the three C# programs into build/helper (spec „Baza kodu i technika”): rd-helper.exe (the helper), rd-guard.exe
 * (the guard) and rd-install.exe (the install helper). On Windows with the compiler built into .NET Framework (csc.exe,
 * C# 5 – no separate installation); with RD_HELPER_ROSLYN=1 (CI on Linux) with Roslyn and -langversion:5 against the
 * reference assemblies of .NET Framework 4.7.2, because newer APIs compiled on a newer machine would not run on LTSC 2019.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'build', 'helper')
const src = join(root, 'helper', 'src')

export const PROGRAMS = [
  { name: 'rd-helper', dirs: ['Common', 'Helper'] },
  { name: 'rd-guard', dirs: ['Common', 'Owner', 'Guard'] },
  { name: 'rd-install', dirs: ['Common', 'Owner', 'Install'] }
]

const sources = (dirs) => dirs.flatMap((d) => (existsSync(join(src, d)) ? readdirSync(join(src, d)).filter((f) => f.endsWith('.cs')).map((f) => join(src, d, f)) : []))

function csc() {
  const windir = process.env.SystemRoot ?? 'C:\\Windows'
  for (const fw of ['Framework64', 'Framework']) {
    const p = join(windir, 'Microsoft.NET', fw, 'v4.0.30319', 'csc.exe')
    if (existsSync(p)) return p
  }
  return null
}

mkdirSync(out, { recursive: true })
if (process.env.RD_HELPER_ROSLYN === '1') {
  for (const p of PROGRAMS) {
    if (!existsSync(join(src, p.dirs.at(-1)))) {
      console.log(`${p.name}: brak źródeł – pominięty`)
      continue
    }
    const r = spawnSync('dotnet', ['build', join(root, 'helper', `${p.name}.csproj`), '-c', 'Release', '-nologo', '-v', 'minimal', '-o', join(out, 'roslyn', p.name)], { stdio: 'inherit' })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  console.log('Roslyn (C# 5, .NET Framework 4.7.2): rd-helper, rd-guard, rd-install – zbudowane')
  process.exit(0)
}
if (process.platform !== 'win32') {
  console.log('Pomocnik C#: budowany tylko na Windows (albo RD_HELPER_ROSLYN=1) – pominięty.')
  process.exit(0)
}
const compiler = csc()
if (!compiler) {
  console.error('Brak csc.exe z .NET Framework 4 – pomocnika nie da się zbudować.')
  process.exit(1)
}
// RD_HELPER_ONLY=rd-helper: only that program (a quick round while working on it).
for (const p of PROGRAMS.filter((x) => !process.env.RD_HELPER_ONLY || x.name === process.env.RD_HELPER_ONLY)) {
  if (!existsSync(join(src, p.dirs.at(-1)))) {
    console.log(`${p.name}: brak źródeł (helper/src/${p.dirs.at(-1)}) – pominięty`)
    continue
  }
  const files = sources(p.dirs)
  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/warnaserror+',
    '/utf8output',
    '/codepage:65001',
    `/out:${join(out, `${p.name}.exe`)}`,
    `/win32manifest:${join(root, 'helper', 'app.manifest')}`,
    `/win32icon:${join(root, 'resources', 'icon.ico')}`,
    '/r:System.dll',
    '/r:System.Core.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    ...files
  ]
  const r = spawnSync(compiler, args, { encoding: 'utf8' })
  process.stdout.write(r.stdout ?? '')
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? '')
    console.error(`${p.name}: kompilacja nie udała się (kod ${r.status})`)
    process.exit(r.status ?? 1)
  }
  copyFileSync(join(root, 'helper', 'app.config'), join(out, `${p.name}.exe.config`))
  console.log(`${p.name}.exe – zbudowany (${files.length} plików, C# 5)`)
}
