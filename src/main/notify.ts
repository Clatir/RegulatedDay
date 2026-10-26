/**
 * Windows notifications (spec „Powiadomienia i dźwięki”) – every call of the app goes through this one function:
 * already checking whether notifications work makes Electron write the Start menu shortcut and the activator's key, so
 * the development identity never touches the module at all, and the test one only with RD_TEST_SYSTEM=1 (CI). A
 * notification is silent in its XML (otherwise Windows plays its own sound), its tag is a 32-character hash of its stable
 * id (Windows refuses a tag over 64 characters), its group a fixed short ASCII name, and its click opens the icon's panel
 * on its line through the app's address – the only path of a click, also after a restart.
 */
import { createHash } from 'node:crypto'
import { Notification } from 'electron'
import { appUrl } from '@shared/protocol'
import { identity } from './identity'

export const NOTIFY_GROUP = 'rdday'

export const notifyTag = (id: string): string => createHash('sha256').update(id).digest('hex').slice(0, 32)

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function toastXml(title: string, body: string, launch: string): string {
  return [
    `<toast activationType="protocol" launch="${xml(launch)}">`,
    '<visual><binding template="ToastGeneric">',
    `<text>${xml(title.slice(0, 120))}</text>`,
    `<text>${xml(body.slice(0, 500))}</text>`,
    '</binding></visual>',
    '<audio silent="true"/>',
    '</toast>'
  ].join('')
}

export interface NotifyInput {
  /** The stable id (day, rule, block, threshold): the same notification shows once, also after a restart. */
  id: string
  title: string
  body: string
  line: string | null
  day: string | null
}

/** Shown notifications, kept until they close (a dropped reference loses its events). */
const shown = new Map<string, Notification>()

/** Shows the notification; false = this identity has none, or Windows refused it (the failure is logged). */
export function notify(n: NotifyInput, log: (level: 'info' | 'warn' | 'error', msg: string, e?: unknown) => void, onFailed?: () => void): boolean {
  if (!identity.systemIntegration || !identity.protocol || process.platform !== 'win32') return false
  const tag = notifyTag(n.id)
  try {
    const note = new Notification({ toastXml: toastXml(n.title, n.body, appUrl(identity.protocol, { line: n.line, day: n.day })), id: tag, groupId: NOTIFY_GROUP })
    note.on('failed', (_e, error) => {
      log('error', `powiadomienie nie udało się: ${error}`)
      shown.delete(tag)
      onFailed?.()
    })
    note.on('close', () => shown.delete(tag))
    shown.set(tag, note)
    note.show()
    return true
  } catch (e) {
    log('error', 'powiadomienie nie udało się', e)
    onFailed?.()
    return false
  }
}
