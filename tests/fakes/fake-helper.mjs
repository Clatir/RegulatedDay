// A stand-in for the helper (rd-helper.exe) in tests and in CI on Linux (RD_HELPER_PATH): the same JSON lines, no Windows.
// RD_FAKE_HELPER_BAR=fail – the desktop bar is never confirmed; RD_FAKE_HELPER_CRASH_MS=<n> – exits after n ms; the file
// `fake-mouse-up` in its working folder – the left button of a watched drag let go (`mouse.watch`, T1500). The
// volatile key of the logon session is a file in its working folder (the app's data): it lasts as long as the folder.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)
const barMode = process.env.RD_FAKE_HELPER_BAR ?? 'ok'
let watched = null
const MOUSE_UP = 'fake-mouse-up'
let mouseWatch = null

const sessionKey = 'fake-session-key.json'

const input = createInterface({ input: process.stdin })
input.on('close', () => process.exit(0))
input.on('line', (line) => {
  let m
  try {
    m = JSON.parse(line)
  } catch {
    return
  }
  const reply = (extra = {}) => m.id != null && out({ re: m.id, ok: true, ...extra })
  switch (m.cmd) {
    case 'init':
      out({ type: 'hello', version: 'fake', pid: process.pid })
      break
    case 'session.start': {
      const existed = existsSync(sessionKey)
      const prevRunId = existed ? JSON.parse(readFileSync(sessionKey, 'utf8')).runId : null
      writeFileSync(sessionKey, JSON.stringify({ runId: m.runId }))
      reply({ existed, prevRunId })
      break
    }
    case 'bar.watch':
      watched = m.hwnd
      setTimeout(() => out({ type: 'bar', hwnd: watched, state: barMode === 'fail' ? 'failed' : 'confirmed', detail: 'fake' }), 50)
      break
    case 'bar.unwatch':
      watched = null
      break
    case 'mouse.watch': {
      // The left button is let go when the test puts the file `fake-mouse-up` into the working folder (the app's data).
      clearInterval(mouseWatch)
      const drag = m.drag
      mouseWatch = setInterval(() => {
        if (!existsSync(MOUSE_UP)) return
        clearInterval(mouseWatch)
        rmSync(MOUSE_UP, { force: true })
        out({ type: 'mouse', event: 'up', drag })
      }, 15)
      break
    }
    case 'mouse.unwatch':
      clearInterval(mouseWatch)
      break
    case 'notificationState':
      reply({ state: 'accepts' })
      break
    case 'toastSetting':
      reply({ setting: 'enabled' })
      break
    case 'quit':
      // As the real helper: the app's windows are gone by now, and the change of the foreground and the bar's end still
      // come.
      out({ type: 'foreground', hwnd: '1', cls: 'Progman', process: 'explorer.exe', shell: false })
      out({ type: 'bar', hwnd: watched, state: 'gone', detail: 'fake' })
      setTimeout(() => process.exit(0), 200)
      break
    default:
      reply()
  }
})

setInterval(() => out({ type: 'alive' }), 2000)
const crashMs = Number(process.env.RD_FAKE_HELPER_CRASH_MS)
if (crashMs > 0) setTimeout(() => process.exit(3), crashMs)
