/**
 * „Skrót szybkiego zapisu” in the settings of this computer (D385, D402): the global shortcut of the window „Do skrzynki”
 * – changed (a typed shortcut is validated before it is sent), switched off, and the note „Skrót zajęty przez inny program”
 * when Windows refused to register it. The main process registers it again at once on a change.
 */
import { CommitField } from '../../components/fields'
import { Toggle, cx } from '../../components/ui'
import { useQuickShortcut } from '../../store/cases'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { parseQuickKey, quickKeyNote, quickKeyShown } from './quickKey'

export function QuickKeyField() {
  const key = useMachine((s) => s.prefs.quickKey)
  const on = useMachine((s) => s.prefs.quickOn)
  const state = useQuickShortcut()
  const note = quickKeyNote(state, on ? key : null)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        {/* Off and on again: your own shortcut comes back (T759), never the default instead. */}
        <Toggle checked={on} onChange={(v) => void setMachinePrefs({ quickOn: v })} label={on ? 'włączony' : 'wyłączony'} data-testid="pref-quick-on" />
        {on && <CommitField value={key} onCommit={(next) => void setMachinePrefs({ quickKey: next })} parse={parseQuickKey} format={quickKeyShown} shellClassName="w-[170px]" aria-label="Skrót szybkiego zapisu" data-testid="pref-quick-key" />}
      </div>
      <span className={cx('text-[12px]', note.warn ? 'text-rose' : 'text-muted')} data-testid="pref-quick-note" role={note.warn ? 'alert' : undefined}>
        {note.text}
      </span>
    </div>
  )
}
