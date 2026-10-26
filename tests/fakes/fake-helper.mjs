// A stand-in for the helper (rd-helper.exe) in tests and in CI on Linux (RD_HELPER_PATH): the same JSON lines, no Windows.
// RD_FAKE_HELPER_BAR=fail – the desktop bar is never confirmed; RD_FAKE_HELPER_CRASH_MS=<n> – exits after n ms.
import { createInterface } from 'node:readline'

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)
const barMode = process.env.RD_FAKE_HELPER_BAR ?? 'ok'
let watched = null

createInterface({ input: process.stdin }).on('line', (line) => {
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
    case 'bar.watch':
      watched = m.hwnd
      setTimeout(() => out({ type: 'bar', hwnd: watched, state: barMode === 'fail' ? 'failed' : 'confirmed', detail: 'fake' }), 50)
      break
    case 'bar.unwatch':
      watched = null
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
