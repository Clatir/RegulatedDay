/**
 * „Pasek pulpitu” of this computer's settings (D564 P16, C3): the switch by your choice, as the panel's footer and the icon's menu
 * (`barChosen`) – the bar hidden by its „×” is „schowany”, not „włączony”, and under the switch stands the line „Pasek pulpitu
 * schowany · Pokaż pasek”. Both switch the bar on through `CH.setPrefs` (`by: 'settings'`): the main process shows one hidden by
 * its „×” at once, also when it was on already (`unclosesBar` – the wizard's prefs never do), so one click brings it back; the switch
 * is `Toggle once` – a double click acts once (shown, the switch ticks; the second click would switch it off). Its place chosen in
 * the mock-up shows it too (`placeBar`).
 */
import { BAR_CLOSED_TEXT, SHOW_BAR_TEXT, barChosen } from '@shared/widget'
import { Toggle } from '../../components/ui'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { useWidget } from '../../store/widget'

/** The switch's state and word: on and on the screen – „włączony”, hidden by its „×” – „schowany”, off – „wyłączony”. */
export function barSwitchOf(desktopBar: boolean, closed: boolean): { checked: boolean; label: string } {
  return { checked: barChosen(desktopBar, closed), label: !desktopBar ? 'wyłączony' : closed ? 'schowany' : 'włączony' }
}

export function BarSwitch() {
  const desktopBar = useMachine((s) => s.prefs.desktopBar)
  const closed = useWidget((s) => s.view?.barClosed ?? false)
  const sw = barSwitchOf(desktopBar, closed)
  return (
    <div className="flex flex-col items-start gap-1.5">
      {/* Once per double click: shown by the first click, the bar's view ticks the switch – the second would switch it off. */}
      <Toggle checked={sw.checked} onChange={(v) => void setMachinePrefs({ desktopBar: v })} label={sw.label} once data-testid="pref-desktop-bar" />
      {desktopBar && closed && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted" data-testid="settings-bar-closed">
          {BAR_CLOSED_TEXT}
          {/* The second click of a double click does nothing (C8). */}
          <button type="button" className="btn" onClick={(e) => e.detail <= 1 && void setMachinePrefs({ desktopBar: true })} data-testid="settings-bar-show">
            {SHOW_BAR_TEXT}
          </button>
        </div>
      )}
    </div>
  )
}
