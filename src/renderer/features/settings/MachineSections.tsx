/**
 * What is set on this computer alone (UX14, E1, E6) – three sections instead of one of seventeen fields: „Pasek pulpitu” (the
 * bar, where it stands, how it behaves), „Powiadomienia i dźwięk” and „Ten komputer” (the autostart, the quick shortcut, the
 * look). All work at once. The fields only the bar has stand always on their places – with the bar off they are switched off
 * together (one `fieldset`), never hidden one by one. The data folder and the extra place for backups are in „Dane”.
 */
import { useEffect, useState } from 'react'
import type { AutostartState } from '@shared/api'
import { BRIGHTNESS_STEPS, ZOOM_STEPS } from '@shared/machine'
import { Field, NowTag, Section, Segmented, Toggle, cx } from '../../components/ui'
import { setMachinePrefs, useMachine } from '../../store/machine'
import { useWidget } from '../../store/widget'
import { BarPlaceMap } from './BarPlaceMap'
import { QuickKeyField } from './QuickKeyField'
import { QUICK_KEY_HELP } from './quickKey'

export function BarSection() {
  const prefs = useMachine((s) => s.prefs)
  const barNote = useWidget((s) => s.view?.barNote ?? null)
  const off = !prefs.desktopBar
  return (
    <Section title="Pasek pulpitu" data-testid="settings-bar" tag={<NowTag />}>
      <Field label="Pasek pulpitu" data-testid="field-bar" hint={barNote ?? (prefs.onTop !== 'off' ? 'Leży nad oknami (Zawsze na wierzchu), bez zabierania fokusu; chowa się nad pełnym ekranem i przy oknie głównym na pierwszym planie.' : 'Leży pod oknami innych aplikacji – widać go tam, gdzie nic go nie zasłania.')}>
        <Toggle checked={prefs.desktopBar} onChange={(v) => void setMachinePrefs({ desktopBar: v })} label={prefs.desktopBar ? 'włączony' : 'wyłączony'} data-testid="pref-desktop-bar" />
      </Field>
      {off && (
        <p className="text-[12px] text-muted" data-testid="settings-bar-off">
          Pasek pulpitu jest wyłączony – jego ustawienia (powrót z oknem głównym, miejsce, pulsowanie) są wyłączone, dopóki go nie włączysz.
        </p>
      )}
      <fieldset disabled={off} className={cx('m-0 flex min-w-0 flex-col gap-3 border-0 p-0', off && 'opacity-50')}>
        <Field
          label="Pasek wraca z oknem głównym"
          data-testid="field-bar-back"
          hint={
            prefs.barBackWithMain
              ? 'Pasek schowany „×” pojawia się znowu, gdy minimalizujesz albo zamykasz okno główne.'
              : 'Pasek schowany „×” wraca tylko z „Pokaż pasek pulpitu” w menu ikony, z ustawień albo po ponownym uruchomieniu.'
          }
        >
          <Toggle checked={prefs.barBackWithMain} onChange={(v) => void setMachinePrefs({ barBackWithMain: v })} label={prefs.barBackWithMain ? 'włączone' : 'wyłączone'} data-testid="pref-bar-back-with-main" />
        </Field>
        <Field label="Miejsce paska" data-testid="field-bar-place" hint="Monitory tak, jak ustawia je Windows. Pasek zostaje w wybranym miejscu na tym komputerze.">
          <BarPlaceMap />
        </Field>
        <Field label="Pulsowanie paska" data-testid="field-bar-pulse" hint={prefs.animations ? 'Pasek pulpitu pulsuje trzy razy, gdy do końca zostaje 5 min i przy końcu (poza trybem sesji, zajęć i „mniej pytań”).' : 'Bez animacji pasek tylko zmienia kolor.'}>
          <Toggle checked={prefs.barPulse} onChange={(v) => void setMachinePrefs({ barPulse: v })} label={prefs.barPulse ? 'włączone' : 'wyłączone'} data-testid="pref-bar-pulse" />
        </Field>
      </fieldset>
      <Field
        label="Zawsze na wierzchu"
        data-testid="field-on-top"
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
      <Field label="Tryb sesji i tryb zajęć" data-testid="field-modes" hint="W czasie sesji i zajęć pasek jest zwarty i przygaszony, a pytania czekają cicho. Wyłączony tryb na tym komputerze: pasek zachowuje się wtedy zwyczajnie.">
        <div className="flex flex-wrap gap-3">
          <Toggle checked={prefs.sessionMode} onChange={(v) => void setMachinePrefs({ sessionMode: v })} label={prefs.sessionMode ? 'tryb sesji włączony' : 'tryb sesji wyłączony'} data-testid="pref-session-mode" />
          <Toggle checked={prefs.classMode} onChange={(v) => void setMachinePrefs({ classMode: v })} label={prefs.classMode ? 'tryb zajęć włączony' : 'tryb zajęć wyłączony'} data-testid="pref-class-mode" />
        </div>
      </Field>
    </Section>
  )
}

export function NoticesSection() {
  const prefs = useMachine((s) => s.prefs)
  return (
    <Section title="Powiadomienia i dźwięk" data-testid="settings-notices" tag={<NowTag />}>
      <Field
        label="Powiadomienia Windows"
        data-testid="field-notices"
        hint="Pokazuje je tylko komputer prowadzący, każde raz. Wszystko widać też w pasku. Przez „Nie przeszkadzać” i nad pełnym ekranem przejdą tylko wtedy, gdy dodasz Regulated Day do powiadomień priorytetowych Windows."
      >
        <div className="flex flex-col gap-1.5">
          <Toggle checked={prefs.notices.start5} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, start5: v } })} label="5 min przed sesją, zajęciami i dojazdem" data-testid="pref-notice-start5" />
          <Toggle checked={prefs.notices.hardEnd} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, hardEnd: v } })} label="twardy koniec projektów" data-testid="pref-notice-hardend" />
          <Toggle checked={prefs.notices.reserve} onChange={(v) => void setMachinePrefs({ notices: { ...prefs.notices, reserve: v } })} label="energia na poziomie rezerwy" data-testid="pref-notice-reserve" />
        </div>
      </Field>
      <Field label="Dźwięk" data-testid="field-sound" hint="Cichy dźwięk 5 i 0 min przed końcem bloku i startem bloku stałego (gra także przy „Nie przeszkadzać”). Nigdy w trybie „mniej pytań”, w dniu zjazdu stacjonarnego ani na komputerze nagrywającym w czasie wykładu.">
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={prefs.sound} onChange={(v) => void setMachinePrefs({ sound: v })} label={prefs.sound ? 'włączony' : 'wyłączony'} data-testid="pref-sound" />
          {prefs.sound && (
            <Segmented
              value={prefs.soundVolume}
              options={[0.2, 0.4, 0.5, 0.7, 1].map((v) => ({ value: v, label: `${Math.round(v * 100)} %` }))}
              onChange={(v) => void setMachinePrefs({ soundVolume: v })}
              aria-label="Głośność"
              data-testid="pref-sound-volume"
            />
          )}
        </div>
      </Field>
    </Section>
  )
}

export function MachineSection() {
  const prefs = useMachine((s) => s.prefs)
  const [auto, setAuto] = useState<AutostartState | null>(null)
  useEffect(() => {
    void window.rd.autostart().then(setAuto)
  }, [])
  return (
    <Section title="Ten komputer" data-testid="settings-machine" tag={<NowTag />}>
      <Field
        label="Uruchamiaj z Windows"
        data-testid="field-autostart"
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
        <Toggle checked={!!auto?.willStart} disabled={!auto?.supported} onChange={(v) => void window.rd.setAutostart(v).then(setAuto)} label={auto?.willStart ? 'włączone' : 'wyłączone'} data-testid="autostart" />
      </Field>
      <Field label="Skrót szybkiego zapisu" data-testid="field-quick-key" hint={`${QUICK_KEY_HELP}`}>
        <QuickKeyField />
      </Field>
      <Field label="Na nagraniach ekranu" data-testid="field-hide-capture" hint="Panel ikony i pasek pulpitu nie pojawiają się na nagraniach i udostępnianiu ekranu (przed Windows 10 2004 są tam czarnym prostokątem). Wyłącz np. do zrzutu ekranu z błędem.">
        <Toggle checked={prefs.hideFromCapture} onChange={(v) => void setMachinePrefs({ hideFromCapture: v })} label={prefs.hideFromCapture ? 'ukryte' : 'widoczne'} data-testid="pref-hide-capture" />
      </Field>
      <Field label="Skala interfejsu" data-testid="field-zoom">
        <Segmented value={prefs.zoom} options={ZOOM_STEPS.map((z) => ({ value: z, label: `${Math.round(z * 100)} %` }))} onChange={(z) => void setMachinePrefs({ zoom: z })} aria-label="Skala interfejsu" data-testid="pref-zoom" />
      </Field>
      <Field label="Jasność" data-testid="field-brightness" hint="Przyciemnia tło, grafikę i akcenty; tekst zostaje tak samo czytelny.">
        <Segmented value={prefs.brightness} options={BRIGHTNESS_STEPS.map((b) => ({ value: b, label: `${Math.round(b * 100)} %` }))} onChange={(b) => void setMachinePrefs({ brightness: b })} aria-label="Jasność" data-testid="pref-brightness" />
      </Field>
      <Field label="Animacje" data-testid="field-animations" hint="Bez animacji zostaje sam kolor ostrzeżeń.">
        <Toggle checked={prefs.animations} onChange={(v) => void setMachinePrefs({ animations: v })} label={prefs.animations ? 'włączone' : 'wyłączone'} data-testid="pref-animations" />
      </Field>
      <Field label="Zajęcia stacjonarne" data-testid="field-stationary" hint="Używasz tego komputera na zajęciach stacjonarnych: koniec zajęć i dojazdu jest wtedy z planu, bez pytania, czy skończyły się wcześniej.">
        <Toggle checked={prefs.stationaryClasses} onChange={(v) => void setMachinePrefs({ stationaryClasses: v })} label={prefs.stationaryClasses ? 'używam go' : 'nie używam'} data-testid="pref-stationary" />
      </Field>
    </Section>
  )
}
