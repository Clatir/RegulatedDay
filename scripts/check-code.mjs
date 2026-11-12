#!/usr/bin/env node
/**
 * Checks of the code that a type checker cannot do (spec „Widget”, „Powiadomienia i dźwięki”, T381):
 * - the built `out/main/start.js` requires nothing but electron, Node's modules and index.js (run after the build);
 * - the desktop bar's window is changed only by showInactive, hide, setBounds and setContentProtection – never focus,
 *   blur, setFocusable, moveTop, moveAbove, show, restore, setAlwaysOnTop or setParentWindow;
 * - the bar's components have no title attribute (also no <title> in SVG), no <select>, no date or colour field and no
 *   alert / confirm / prompt – each would be a separate window of Chromium on top of every other;
 * - no window uses Notification (only the main process does, through notify.ts);
 * - the helper's commands that answer only a request (with an id) are never sent without one – their answer would be
 *   lost (`helper.send('toastSetting')` read Windows' setting and said nothing);
 * - the window „Do skrzynki” (D385) comes over the other windows only on your shortcut: show, focus and „on top” only in
 *   its private `raise`, and `raise` only from the callback of the global shortcut it registers.
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
  for (const m of text.matchAll(/this\.win\.(\w+)/g)) {
    if (BAR_ALLOWED.has(m[1])) continue
    // D291: „Zawsze na wierzchu” only as your choice, once, from apply's `change.onTop`.
    if (m[1] === 'setAlwaysOnTop') continue
    problems.push(`pasek pulpitu: this.win.${m[1]} – dozwolone tylko showInactive, hide, setBounds, setContentProtection (i setAlwaysOnTop z wyboru, D291)`)
  }
  const top = [...text.matchAll(/this\.win\.setAlwaysOnTop\(([^)]*)\)/g)]
  if (top.length > 1 || top.some((m) => !/^change\.onTop\b/.test(m[1].trim()))) problems.push('pasek pulpitu: setAlwaysOnTop tylko raz, z wyborem „Zawsze na wierzchu” (change.onTop)')
  return problems
}

/** The body of a method (`private raise(): void {` … its closing brace), or null. */
function methodBody(text, head) {
  const at = text.indexOf(head)
  if (at < 0) return null
  const open = text.indexOf('{', at + head.length - 1)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return { from: open, to: i + 1 }
  }
  return null
}

/** What raises a window over the others (or activates it): only `setAlwaysOnTop(false)` is no raise. */
const RAISES = /this\.win\.(?:show|showInactive|focus|moveTop|moveAbove|restore|maximize|setFullScreen|setParentWindow)\(|this\.win\.setAlwaysOnTop\((?!\s*false\s*\))/g

/** The window „Do skrzynki” (D385): on top only by the shortcut – `raise` private, alone raising, called only by the shortcut. */
export function checkQuickWindow(text) {
  const code = text.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
  const problems = []
  const body = methodBody(code, 'private raise(): void {')
  if (!body) return ['okienko „Do skrzynki”: brak prywatnej metody raise() – jedynej drogi na wierzch']
  for (const m of code.matchAll(RAISES)) if (m.index < body.from || m.index >= body.to) problems.push(`okienko „Do skrzynki”: ${m[0]} poza raise() – na wierzch wychodzi tylko na skrót (D385)`)
  const calls = [...code.matchAll(/this\.raise\(/g)].length
  const byShortcut = [...code.matchAll(/\.register\([^,()]+,\s*\(\)\s*=>\s*this\.raise\(\)\s*\)/g)].length
  if (calls !== byShortcut || byShortcut !== 1) problems.push('okienko „Do skrzynki”: raise() wołane gdzie indziej niż w wywołaniu skrótu globalnego (register)')
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

/** The helper's commands whose only result is their answer (helper/src/Helper/HelperMain.cs). */
const ANSWER_ONLY = ['notificationState', 'toastSetting', 'session.start', 'oneDrive', 'attributes', 'powerState', 'installLocation', 'selftest']

/** The main process's code: an answer-only command goes by request(), never by send(). */
export function checkHelperCalls(text) {
  const problems = []
  for (const m of text.matchAll(/\.send\(\s*['"]([\w.]+)['"]/g)) if (ANSWER_ONLY.includes(m[1])) problems.push(`pomocnik: send('${m[1]}') – ta komenda odpowiada tylko na request() (z id), odpowiedź by przepadła`)
  return problems
}

function run() {
  const problems = []
  const startJs = join(root, 'out', 'main', 'start.js')
  if (existsSync(startJs)) problems.push(...checkStart(readFileSync(startJs, 'utf8')).map((p) => `out/main/start.js: ${p}`))
  else console.log('out/main/start.js nie istnieje (przed buildem) – sprawdzenie startu pominięte')
  const barFile = join(root, 'src', 'main', 'windows', 'desktopBar.ts')
  problems.push(...checkBarWindow(readFileSync(barFile, 'utf8')).map((p) => `${rel(barFile)}: ${p}`))
  const quickFile = join(root, 'src', 'main', 'windows', 'quickWindow.ts')
  problems.push(...checkQuickWindow(readFileSync(quickFile, 'utf8')).map((p) => `${rel(quickFile)}: ${p}`))
  for (const f of files(join(root, 'src', 'renderer', 'widget'), ['.tsx', '.ts'])) problems.push(...checkBarComponent(readFileSync(f, 'utf8')).map((p) => `${rel(f)}: ${p}`))
  for (const f of files(join(root, 'src', 'renderer'), ['.tsx', '.ts'])) problems.push(...checkRenderer(readFileSync(f, 'utf8')).map((p) => `${rel(f)}: ${p}`))
  for (const f of files(join(root, 'src', 'main'), ['.ts'])) {
    const code = readFileSync(f, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')
    problems.push(...checkHelperCalls(code).map((p) => `${rel(f)}: ${p}`))
    if (rel(f) === 'src/main/notify.ts') continue
    if (/\bNotification\b/.test(code)) problems.push(`${rel(f)}: Notification poza notify.ts`)
  }
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('check-code: ok')
}

/** A window „Do skrzynki” as it must be (the self-test changes it one way at a time). */
const QUICK_OK = `class Q {
  setShortcut(key) { ok = this.shortcuts.register(key, () => this.raise()) }
  private raise(): void { if (x) { y() } this.win.setAlwaysOnTop(true, 'floating'); this.win.show(); this.win.focus() }
  close(): void { this.win.setAlwaysOnTop(false); this.win.hide() }
}`

/** Each check catches what it is for (the test bar with one title must be caught). */
function selfTest() {
  const cases = [
    [checkStart('const x = require("./chunks/shared.js")').length === 1, 'start: chunk'],
    [checkStart('require("electron");require("node:fs");require(node_path.join(__dirname, "index.js"))').length === 0, 'start: ok'],
    [checkBarWindow('this.win.focus()').length === 1, 'pasek: focus'],
    [checkBarWindow('this.win.showInactive(); this.win.setBounds(b)').length === 0, 'pasek: ok'],
    [checkBarWindow('this.win.setAlwaysOnTop(true)').length === 1, 'pasek: setAlwaysOnTop bez wyboru'],
    [checkBarWindow("this.win.setAlwaysOnTop(change.onTop, 'floating')").length === 0, 'pasek: setAlwaysOnTop z wyboru'],
    [checkBarComponent('<button title="x">').length === 1, 'title'],
    [checkBarComponent('<svg><title>x</title></svg>').length === 1, '<title>'],
    [checkBarComponent('<select>').length === 1, 'select'],
    [checkBarComponent('<input type="color" />').length === 1, 'color'],
    [checkBarComponent('if (confirm("x"))').length === 1, 'confirm'],
    [checkRenderer('new Notification("x")').length === 1, 'Notification'],
    [checkHelperCalls("helper?.send('toastSetting')").length === 1, 'pomocnik: send bez id'],
    [checkHelperCalls("helper?.send('bar.watch', { hwnd }); void helper.request('toastSetting')").length === 0, 'pomocnik: ok'],
    [checkQuickWindow(QUICK_OK).length === 0, 'okienko: ok'],
    [checkQuickWindow(QUICK_OK.replace('close(): void {', 'close(): void { this.win.show()')).length === 1, 'okienko: show poza raise'],
    [checkQuickWindow(QUICK_OK.replace('close(): void {', 'close(): void { this.win.setAlwaysOnTop(true)')).length === 1, 'okienko: na wierzchu poza raise'],
    [checkQuickWindow(QUICK_OK.replace('close(): void {', 'close(): void { this.raise()')).length === 1, 'okienko: raise bez skrótu'],
    [checkQuickWindow(QUICK_OK.replace('private raise(', 'raise(')).length === 1, 'okienko: raise nie prywatne']
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
