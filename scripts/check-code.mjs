#!/usr/bin/env node
/**
 * Checks of the code that a type checker cannot do (spec „Widget”, „Powiadomienia i dźwięki”, T381):
 * - the built `out/main/start.js` requires nothing but electron, Node's modules and index.js (run after the build);
 * - the desktop bar's window is changed only by showInactive, hide, setBounds and setContentProtection – never focus,
 *   blur, setFocusable, moveTop, moveAbove, show, restore, setAlwaysOnTop or setParentWindow;
 * - the bar's components have no title attribute (also no <title> in SVG), no <select>, no date or colour field and no
 *   alert / confirm / prompt – each would be a separate window of Chromium on top of every other;
 * - no window uses Notification (only the main process does, through notify.ts).
 * `--self-test` proves each check catches its case.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const rel = (p) => relative(root, p).replace(/\\/g, '/')

function files(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p, ext) : ext.some((e) => n.endsWith(e)) ? [p] : []
  })
}

/** The bundle of start: its requires. */
export function checkStart(text) {
  const problems = []
  for (const m of text.matchAll(/require\(([^)]*)\)/g)) {
    const arg = m[1].trim()
    const lit = /^["']([^"']+)["']$/.exec(arg)
    if (lit) {
      if (!/^(electron|node:[a-z_/]+)$/.test(lit[1])) problems.push(`start.js wymaga „${lit[1]}” – start może importować tylko electron i moduły Node`)
    } else if (!/join\(__dirname,\s*["']index\.js["']$/.test(arg)) problems.push(`start.js: nieoczekiwane require(${arg})`)
  }
  return problems
}

const BAR_ALLOWED = new Set(['showInactive', 'hide', 'setBounds', 'setContentProtection', 'getNativeWindowHandle', 'isDestroyed', 'on', 'once', 'webContents'])

/** The desktop bar's file: what it calls on its window. */
export function checkBarWindow(text) {
  const problems = []
  for (const m of text.matchAll(/this\.win\.(\w+)/g)) if (!BAR_ALLOWED.has(m[1])) problems.push(`pasek pulpitu: this.win.${m[1]} – dozwolone tylko showInactive, hide, setBounds, setContentProtection`)
  return problems
}

/** The bar's components: nothing that opens a window of its own. */
export function checkBarComponent(text) {
  const problems = []
  const rules = [
    [/\stitle=\{|\stitle="/, 'atrybut title (podpowiedź to osobne okno)'],
    [/<title[\s>]/, 'element <title> (podpowiedź SVG)'],
    [/<select[\s>]/, 'lista rozwijana <select>'],
    [/type=["'](date|time|datetime-local|month|week|color)["']/, 'systemowy wybór daty albo koloru'],
    [/\b(alert|confirm|prompt)\s*\(/, 'okno dialogowe alert / confirm / prompt'],
    [/onContextMenu/, 'menu kontekstowe']
  ]
  for (const [re, what] of rules) if (re.test(text)) problems.push(what)
  return problems
}

/** A window's code: no notifications of its own. */
export function checkRenderer(text) {
  return /\bNotification\b/.test(text) ? ['powiadomienie w oknie – powiadomienia pokazuje tylko proces główny (notify.ts)'] : []
}

function run() {
  const problems = []
  const startJs = join(root, 'out', 'main', 'start.js')
  if (existsSync(startJs)) problems.push(...checkStart(readFileSync(startJs, 'utf8')).map((p) => `out/main/start.js: ${p}`))
  else console.log('out/main/start.js nie istnieje (przed buildem) – sprawdzenie startu pominięte')
  const barFile = join(root, 'src', 'main', 'windows', 'desktopBar.ts')
  problems.push(...checkBarWindow(readFileSync(barFile, 'utf8')).map((p) => `${rel(barFile)}: ${p}`))
  for (const f of files(join(root, 'src', 'renderer', 'widget'), ['.tsx', '.ts'])) problems.push(...checkBarComponent(readFileSync(f, 'utf8')).map((p) => `${rel(f)}: ${p}`))
  for (const f of files(join(root, 'src', 'renderer'), ['.tsx', '.ts'])) problems.push(...checkRenderer(readFileSync(f, 'utf8')).map((p) => `${rel(f)}: ${p}`))
  for (const f of files(join(root, 'src', 'main'), ['.ts'])) {
    if (rel(f) === 'src/main/notify.ts') continue
    if (/\bNotification\b/.test(readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))) problems.push(`${rel(f)}: Notification poza notify.ts`)
  }
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('check-code: ok')
}

/** Each check catches what it is for (the test bar with one title must be caught). */
function selfTest() {
  const cases = [
    [checkStart('const x = require("./chunks/shared.js")').length === 1, 'start: chunk'],
    [checkStart('require("electron");require("node:fs");require(node_path.join(__dirname, "index.js"))').length === 0, 'start: ok'],
    [checkBarWindow('this.win.focus()').length === 1, 'pasek: focus'],
    [checkBarWindow('this.win.showInactive(); this.win.setBounds(b)').length === 0, 'pasek: ok'],
    [checkBarComponent('<button title="x">').length === 1, 'title'],
    [checkBarComponent('<svg><title>x</title></svg>').length === 1, '<title>'],
    [checkBarComponent('<select>').length === 1, 'select'],
    [checkBarComponent('<input type="color" />').length === 1, 'color'],
    [checkBarComponent('if (confirm("x"))').length === 1, 'confirm'],
    [checkRenderer('new Notification("x")').length === 1, 'Notification']
  ]
  const failed = cases.filter(([ok]) => !ok).map(([, name]) => name)
  if (failed.length) {
    console.error(`check-code --self-test: nie wykrywa: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('check-code --self-test: ok')
}

if (process.argv.includes('--self-test')) selfTest()
else run()
