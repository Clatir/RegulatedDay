/**
 * „Skrót szybkiego zapisu” in the settings of this computer (D385, D402): the global shortcut of the window „Do skrzynki”
 * – changed (a typed shortcut is validated before it is sent), switched off, and the note „Skrót zajęty przez inny program”
 * when Windows refused to register it. The main process registers it again at once on a change.
 */
import { DEFAULT_QUICK_KEY } from '@shared/machine'
import { CommitField } from '../../components/fields'
import { Toggle, cx } from '../../components/ui'
import { useQuickShortcut } from '../../store/cases'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { parseQuickKey, quickKeyNote, quickKeyShown } from './quickKey'

export function QuickKeyField() {
  const saved = useMachine((s) => s.prefs.quickKey)
  const state = useQuickShortcut()
  const note = quickKeyNote(state, saved)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle checked={saved != null} onChange={(v) => void setMachinePrefs({ quickKey: v ? DEFAULT_QUICK_KEY : null })} label={saved != null ? 'włączony' : 'wyłączony'} data-testid="pref-quick-on" />
        {saved != null && <CommitField value={saved} onCommit={(key) => void setMachinePrefs({ quickKey: key })} parse={parseQuickKey} format={quickKeyShown} shellClassName="w-[170px]" aria-label="Skrót szybkiego zapisu" data-testid="pref-quick-key" />}
      </div>
      <span className={cx('text-[12px]', note.warn ? 'text-rose' : 'text-muted')} data-testid="pref-quick-note" role={note.warn ? 'alert' : undefined}>
        {note.text}
      </span>
    </div>
  )
}
