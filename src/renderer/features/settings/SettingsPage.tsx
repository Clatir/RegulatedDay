/**
 * Ustawienia (E0): this computer's settings that exist already – the autostart with its real state, the desktop bar,
 * hiding from recordings, the scale, the brightness, the animations – and the version, the helper and the logs.
 */
import { useEffect, useState } from 'react'
import type { AppInfo, AutostartState } from '@shared/api'
import { BRIGHTNESS_STEPS, ZOOM_STEPS } from '@shared/machine'
import type { UpdateView } from '@shared/updateView'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { useWidget } from '../../store/widget'
import { Field, Section, Segmented, Toggle } from '../../components/ui'
import { SHORTCUTS } from '../../lib/shortcuts'
import { phaseText, updateAction } from '../../store/update'

const IDENTITY_LABEL: Record<AppInfo['identity'], string> = {
  production: 'zainstalowana',
  development: 'deweloperska (Regulated Day Dev)',
  test: 'testowa (Regulated Day Test)'
}

const HELPER_LABEL: Record<AppInfo['helper']['state'], string> = {
  running: 'działa',
  starting: 'uruchamia się',
  unavailable: 'niedostępny – kilka razy przestał działać',
  missing: 'brak programu pomocnika',
  off: 'wyłączony'
}

export function SettingsPage() {
  const prefs = useMachine((s) => s.prefs)
  const barNote = useWidget((s) => s.view?.barNote ?? null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [auto, setAuto] = useState<AutostartState | null>(null)
  const [update, setUpdate] = useState<UpdateView | null>(null)
  useEffect(() => {
    void window.rd.appInfo().then(setInfo)
    void window.rd.autostart().then(setAuto)
    void window.rd.update().then(setUpdate)
    return window.rd.onUpdate(setUpdate)
  }, [])
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4 p-4" data-testid="settings">
      <Section title="Ten komputer">
        <Field
          label="Uruchamiaj z Windows"
          hint={
            !auto?.supported
              ? 'Ta wersja (deweloperska albo testowa) nie dopisuje się do autostartu.'
              : auto.disabledInTaskManager
                ? 'Wyłączone w Menedżerze zadań – aplikacja sama tego nie zmienia; włączenie tutaj włączy je też tam.'
                : auto.willStart
                  ? 'Windows uruchomi aplikację po zalogowaniu, ukrytą w zasobniku.'
                  : 'Aplikacja nie uruchomi się z Windows.'
          }
        >
          <Toggle
            checked={!!auto?.willStart}
            disabled={!auto?.supported}
            onChange={(v) => void window.rd.setAutostart(v).then(setAuto)}
            label={auto?.willStart ? 'włączone' : 'wyłączone'}
            data-testid="autostart"
          />
        </Field>
        <Field label="Pasek pulpitu" hint={barNote ?? 'Leży pod oknami innych aplikacji – widać go tam, gdzie nic go nie zasłania.'}>
          <Toggle checked={prefs.desktopBar} onChange={(v) => void setMachinePrefs({ desktopBar: v })} label={prefs.desktopBar ? 'włączony' : 'wyłączony'} data-testid="pref-desktop-bar" />
        </Field>
        <Field label="Na nagraniach ekranu" hint="Panel ikony i pasek pulpitu nie pojawiają się na nagraniach i udostępnianiu ekranu (przed Windows 10 2004 są tam czarnym prostokątem). Wyłącz np. do zrzutu ekranu z błędem.">
          <Toggle checked={prefs.hideFromCapture} onChange={(v) => void setMachinePrefs({ hideFromCapture: v })} label={prefs.hideFromCapture ? 'ukryte' : 'widoczne'} data-testid="pref-hide-capture" />
        </Field>
        <Field label="Skala interfejsu">
          <Segmented value={prefs.zoom} options={ZOOM_STEPS.map((z) => ({ value: z, label: `${Math.round(z * 100)} %` }))} onChange={(z) => void setMachinePrefs({ zoom: z })} aria-label="Skala interfejsu" data-testid="pref-zoom" />
        </Field>
        <Field label="Jasność" hint="Przyciemnia tło, grafikę i akcenty; tekst zostaje tak samo czytelny.">
          <Segmented
            value={prefs.brightness}
            options={BRIGHTNESS_STEPS.map((b) => ({ value: b, label: `${Math.round(b * 100)} %` }))}
            onChange={(b) => void setMachinePrefs({ brightness: b })}
            aria-label="Jasność"
            data-testid="pref-brightness"
          />
        </Field>
        <Field label="Animacje" hint="Bez animacji zostaje sam kolor ostrzeżeń.">
          <Toggle checked={prefs.animations} onChange={(v) => void setMachinePrefs({ animations: v })} label={prefs.animations ? 'włączone' : 'wyłączone'} data-testid="pref-animations" />
        </Field>
      </Section>
      <Section title="Aktualizacje" data-testid="settings-updates">
        <Field label="Wersja">
          <span className="num" data-testid="current-version">
            {info?.version ?? ''}
          </span>
        </Field>
        {update && (
          <Field label="Stan" hint={update.note ?? undefined}>
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="update-phase">
                {phaseText(update)}
                {update.available ? ` (${update.available.version})` : ''}
                {update.error ? ` – ${update.error}` : ''}
              </span>
              {update.phase !== 'off' && (
                <button type="button" className="btn" onClick={() => void updateAction('check').then(() => window.rd.update().then(setUpdate))} data-testid="update-check">
                  Sprawdź teraz
                </button>
              )}
              {update.phase === 'ready' && (
                <button type="button" className="btn btn-accent" onClick={() => void updateAction('installNow')} data-testid="update-install">
                  Zainstaluj teraz
                </button>
              )}
            </div>
          </Field>
        )}
      </Section>
      <Section title="Informacje">
        <Field label="Wersja aplikacji">
          <span data-testid="identity">{info ? IDENTITY_LABEL[info.identity] : ''}</span>
        </Field>
        <Field label="Pomocnik">
          <span data-testid="helper-state">{info ? HELPER_LABEL[info.helper.state] : ''}</span>
        </Field>
        <Field label="Folder danych aplikacji">
          <span className="break-all text-[12px] text-muted" data-testid="user-data">
            {info?.userData ?? ''}
          </span>
        </Field>
        <Field label="Logi">
          <button type="button" className="btn" onClick={() => void window.rd.openLogs()} data-testid="open-logs">
            Otwórz logi
          </button>
        </Field>
      </Section>
      <Section title="Skróty klawiszowe">
        <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5" data-testid="shortcuts">
          {SHORTCUTS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <span className="kbd">{k}</span>
              </dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  )
}
