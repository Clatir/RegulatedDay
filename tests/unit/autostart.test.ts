/**
 * „Uruchamiaj z Windows” shows the real state and can be switched off (H3): Electron on Windows cuts the `path` of
 * `getLoginItemSettings` at the first space unless it is in quotes, and the Run entry holds `"…\Regulated Day.exe" --hidden`
 * – with the bare path `launchItems` was empty, the switch always read „off” and could not be turned off.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const EXE = 'C:\\Users\\Ala\\AppData\\Local\\Programs\\Regulated Day\\Regulated Day.exe'

/** The part of Electron that matters here: the Run key as Electron reads and writes it (path told as a command line). */
const reg = vi.hoisted(() => {
  const state = { run: new Map<string, string>(), approved: new Map<string, boolean>(), sets: 0 }
  /** The program of a command line as Windows parses it: in quotes up to the closing one, else up to the first space. */
  const program = (cmd: string): string => (cmd.startsWith('"') ? cmd.slice(1, cmd.indexOf('"', 1)) : (cmd.split(' ')[0] ?? ''))
  const argsOf = (cmd: string): string[] => (cmd.startsWith('"') ? cmd.slice(cmd.indexOf('"', 1) + 1) : cmd.split(' ').slice(1).join(' ')).split(' ').filter(Boolean)
  return {
    state,
    getLoginItemSettings: (o: { path: string; args?: string[] }) => {
      const wanted = program(o.path).toLowerCase()
      const launchItems = [...state.run].flatMap(([name, cmd]) =>
        program(cmd).toLowerCase() === wanted ? [{ name, path: program(cmd), args: argsOf(cmd), scope: 'user', enabled: state.approved.get(name) ?? true }] : []
      )
      return { openAtLogin: launchItems.some((i) => i.args.join(' ') === (o.args ?? []).join(' ')), launchItems }
    },
    setLoginItemSettings: (o: { openAtLogin: boolean; enabled?: boolean; name: string; path: string; args?: string[] }) => {
      state.sets++
      if (!o.openAtLogin) return void state.run.delete(o.name)
      state.run.set(o.name, [`"${o.path}"`, ...(o.args ?? [])].join(' '))
      state.approved.set(o.name, o.enabled ?? true)
    }
  }
})

vi.mock('electron', () => ({ app: { getLoginItemSettings: reg.getLoginItemSettings, setLoginItemSettings: reg.setLoginItemSettings } }))

const { Autostart, AUTOSTART_NAME } = await import('../../src/main/autostart')

const realPlatform = process.platform
const realExec = process.execPath
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  Object.defineProperty(process, 'execPath', { value: EXE })
})
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform })
  Object.defineProperty(process, 'execPath', { value: realExec })
})
beforeEach(() => {
  reg.state.run.clear()
  reg.state.approved.clear()
  reg.state.sets = 0
})

function make(on = true) {
  const flag = { on }
  const logs: string[] = []
  return { a: new Autostart({ supported: true, switchedOn: () => flag.on, log: (_l, m) => void logs.push(m) }), flag, logs }
}

describe('Uruchamiaj z Windows – ścieżka ze spacją (H3)', () => {
  it('po włączeniu wpis Run jest odczytany: willStart, bez „wyłączone w Menedżerze zadań”', () => {
    const { a } = make()
    a.set(true)
    expect(reg.state.run.get(AUTOSTART_NAME)).toBe(`"${EXE}" --hidden`)
    expect(a.read()).toEqual({ supported: true, switchedOn: true, willStart: true, disabledInTaskManager: false })
  })

  it('wyłączenie usuwa wpis Run i odczyt pokazuje „nie uruchomi się”', () => {
    const { a, flag } = make()
    a.set(true)
    flag.on = false
    a.set(false)
    expect(reg.state.run.has(AUTOSTART_NAME)).toBe(false)
    expect(a.read()).toEqual({ supported: true, switchedOn: false, willStart: false, disabledInTaskManager: false })
  })

  it('wyłączony w Menedżerze zadań jest rozpoznany, a start go nie włącza z powrotem', () => {
    const { a } = make()
    a.set(true)
    reg.state.approved.set(AUTOSTART_NAME, false)
    expect(a.read()).toMatchObject({ willStart: false, disabledInTaskManager: true })
    reg.state.sets = 0
    a.checkPath()
    expect(reg.state.sets).toBe(0)
    expect(reg.state.approved.get(AUTOSTART_NAME)).toBe(false)
  })

  it('start z tą samą ścieżką (także inna wielkość liter) niczego nie zapisuje', () => {
    const { a } = make()
    reg.state.run.set(AUTOSTART_NAME, `"${EXE.toLowerCase()}" --hidden`)
    a.checkPath()
    expect(reg.state.sets).toBe(0)
    expect(a.read().willStart).toBe(true)
  })
})
