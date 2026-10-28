/**
 * Ustawienia: the shared settings (from the date chosen at the top – by default tomorrow), the modules, categories,
 * the plan of lectures, then this computer's own – the autostart with its real state, the desktop bar, hiding from
 * recordings, the scale, the brightness, the animations, the stationary classes (D224), the data folder and an extra
 * place for backups – and the version, the helper and the logs.
 */
import { useEffect, useState } from 'react'
import type { AppInfo, AutostartState } from '@shared/api'
import { BRIGHTNESS_STEPS, ZOOM_STEPS } from '@shared/machine'
import type { UpdateView } from '@shared/updateView'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { useWidget } from '../../store/widget'
import { useData } from '../../store/data'
import { Field, Section, Segmented, Toggle } from '../../components/ui'
import { SHORTCUTS } from '../../lib/shortcuts'
import { phaseText, updateAction } from '../../store/update'
import { toast } from '../../store/ui'
import { BarPlaceMap } from './BarPlaceMap'
import { CategoriesSection } from './CategoriesSection'
import { LecturesSection } from './LecturesSection'
import { DayTypesSection, FieldsSection, FromBar, ModulesSection, RegenWaysSection, SessionsSection } from './SharedSettings'
import { CalibrationSection } from '../calibration/CalibrationEntry'
import { DataSection } from './DataSection'

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
  const dataOpen = useData((s) => s.view?.status === 'open')
  const folder = useData((s) => s.view?.folder ?? null)
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
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-4" data-testid="settings">
      {dataOpen && (
        <>
          <FromBar />
          <ModulesSection />
          <DayTypesSection />
          <FieldsSection group="sleep" />
          <SessionsSection />
          <FieldsSection group="boundary" />
          <FieldsSection group="energy" />
          <CategoriesSection />
          <RegenWaysSection />
          <LecturesSection />
          <FieldsSection group="reminders" />
          <FieldsSection group="timer" />
          <FieldsSection group="care" />
          <CalibrationSection />
          <DataSection />
        </>
      )}
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
        <Field label="Miejsce paska" hint="Monitory tak, jak ustawia je Windows. Pasek zostaje w wybranym miejscu na tym komputerze.">
          <BarPlaceMap />
        </Field>
        <Field
          label="Zawsze na wierzchu"
          hint="Domyślnie nic z Regulated Day nie wychodzi nad okna innych aplikacji. Możesz to zmienić na tym komputerze: pasek pulpitu nad oknami (bez zabierania fokusu, chowa się nad oknem na pełnym ekranie), albo pasek i panel ikony – panel zostaje wtedy na wierzchu, dopóki go nie zamkniesz."
        >
          <Segmented
            value={prefs.onTop}
            options={[
              { value: 'off' as const, label: 'wyłączone' },
              { value: 'bar' as const, label: 'pasek pulpitu' },
              { value: 'barPanel' as const, label: 'pasek i panel' }
            ]}
            onChange={(v) => void setMachinePrefs({ onTop: v })}
            aria-label="Zawsze na wierzchu"
            data-testid="pref-on-top"
          />
        </Field>
        <Field label="Tryb sesji i tryb zajęć" hint="W czasie sesji i zajęć pasek jest zwarty i przygaszony, a pytania czekają cicho. Wyłączony tryb na tym komputerze: pasek zachowuje się wtedy zwyczajnie.">
          <div className="flex flex-wrap gap-3">
            <Toggle checked={prefs.sessionMode} onChange={(v) => void setMachinePrefs({ sessionMode: v })} label={prefs.sessionMode ? 'tryb sesji włączony' : 'tryb sesji wyłączony'} data-testid="pref-session-mode" />
            <Toggle checked={prefs.classMode} onChange={(v) => void setMachinePrefs({ classMode: v })} label={prefs.classMode ? 'tryb zajęć włączony' : 'tryb zajęć wyłączony'} data-testid="pref-class-mode" />
          </div>
        </Field>
        <Field
          label="Powiadomienia Windows"
          hint="Pokazuje je tylko komputer prowadzący, każde raz. Wszystko widać też w pasku. Przez „Nie przeszkadzać” i nad pełnym ekranem przejdą tylko wtedy, gdy dodasz Regulated Day do powiadomień priorytetowych Windows."
        >
          <div className="flex flex-col gap-1.5">
            <Toggle checked={prefs.notices.start5} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, start5: v } })} label="5 min przed sesją, drugą zmianą, analizą, zajęciami i dojazdem" data-testid="pref-notice-start5" />
            <Toggle checked={prefs.notices.hardEnd} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, hardEnd: v } })} label="twardy koniec projektów" data-testid="pref-notice-hardend" />
            <Toggle checked={prefs.notices.reserve} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, reserve: v } })} label="energia na poziomie rezerwy" data-testid="pref-notice-reserve" />
          </div>
        </Field>
        <Field label="Dźwięk" hint="Cichy dźwięk 5 i 0 min przed końcem bloku i startem bloku stałego (gra także przy „Nie przeszkadzać”). Nigdy w trybie „mniej pytań”, w dniu zjazdu stacjonarnego ani na komputerze nagrywającym w czasie wykładu.">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle checked={prefs.sound} onChange={(v) => void setMachinePrefs({ sound: v })} label={prefs.sound ? 'włączony' : 'wyłączony'} data-testid="pref-sound" />
            {prefs.sound && (
              <Segmented
                value={prefs.soundVolume}
                options={[0.2, 0.4, 0.7, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)} %` }))}
                onChange={(v) => void setMachinePrefs({ soundVolume: v })}
                aria-label="Głośność"
                data-testid="pref-sound-volume"
              />
            )}
          </div>
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
        <Field label="Zajęcia stacjonarne" hint="Używasz tego komputera na zajęciach stacjonarnych: koniec zajęć i dojazdu jest wtedy z planu, bez pytania, czy skończyły się wcześniej.">
          <Toggle checked={prefs.stationaryClasses} onChange={(v) => void setMachinePrefs({ stationaryClasses: v })} label={prefs.stationaryClasses ? 'używam go' : 'nie używam'} data-testid="pref-stationary" />
        </Field>
        <Field label="Folder danych" hint={folder ? undefined : 'Nie wybrano – zrobi to kreator.'}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-[12px] text-muted" data-testid="data-folder">
              {folder ?? '—'}
            </span>
            {folder && (
              <>
                <button type="button" className="btn" onClick={() => void window.rd.openDataFolder()}>
                  Otwórz
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void window.rd.pinFolder().then((r) => (r.ok ? toast('Folder przypięty: OneDrive trzyma go na tym komputerze.', 'success') : toast(r.error ?? 'Nie udało się.', 'error', 8000)))}
                  title="Zawsze przechowuj na tym urządzeniu"
                >
                  Przypnij w OneDrive
                </button>
              </>
            )}
          </div>
        </Field>
        <Field label="Dodatkowe miejsce kopii" hint="Poza OneDrive: ten komputer kopiuje tam najnowszą kopię zapasową (14 ostatnich).">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-[12px] text-muted">{prefs.backupDir ?? 'brak'}</span>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void window.rd.folderPick(prefs.backupDir).then((d) => {
                  if (d) void setMachinePrefs({ backupDir: d })
                })
              }
            >
              Wybierz…
            </button>
            {prefs.backupDir && (
              <button type="button" className="btn" onClick={() => void setMachinePrefs({ backupDir: null })}>
                Bez dodatkowego
              </button>
            )}
          </div>
        </Field>
      </Section>
      <Section title="Aktualizacje" data-testid="settings-updates">
        <Field label="Wersja">
          <span className="num" data-testid="current-version">
            {info?.version ?? ''}
          </span>
        </Field>
        <Field label="Instalacja w nocy" hint="W ciszy nocnej, przy zablokowanym ekranie albo bez używania komputera od 30 min, na zasilaniu z sieci i poza blokami. Przed pierwszym otwarciem danych nowa wersja robi ich kopię.">
          <Toggle checked={info?.nightInstall ?? true} onChange={(v) => void window.rd.setNightInstall(v).then(setInfo)} label={(info?.nightInstall ?? true) ? 'włączona' : 'wyłączona'} data-testid="pref-night-install" />
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
