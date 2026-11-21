/**
 * Ustawienia (UX14, D565 P22): one page with a table of contents on the left (six groups, every section one click away) and
 * the box „Szukaj w ustawieniach” (the fields by their labels). The sections follow `settingsLayout`: the shared settings with a
 * date under one bar „od jutra / od dziś / od daty” (with the changes that wait for their date), those that work at once marked
 * „od razu”, the categories, calendars and the plan of lectures, the bar, the notifications and this computer's own, the data
 * with its backups, and the updates, the information and the shortcuts.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { AppInfo } from '@shared/api'
import type { UpdateView } from '@shared/updateView'
import { useData } from '../../store/data'
import { Field, Section, Toggle } from '../../components/ui'
import { SHORTCUTS } from '../../lib/shortcuts'
import { phaseText, updateAction } from '../../store/update'
import { takeFoundPick, takePick, toast, useUi } from '../../store/ui'
import { CalendarsSection } from './CalendarsSection'
import { CategoriesSection } from './CategoriesSection'
import { LecturesSection } from './LecturesSection'
import { DayTypesSection, FieldsSection, FromBar, ModulesSection } from './SharedSettings'
import { CalibrationSection } from '../calibration/CalibrationEntry'
import { ComputersSection } from './ComputersSection'
import { DataSection } from './DataSection'
import { BarSection, MachineSection, NoticesSection } from './MachineSections'
import { PlannedChanges, WithdrawAction } from './PlannedList'
import { SettingsSearch, SettingsToc } from './SettingsNav'
import { datedRange, settingsItems, type SettingsItem } from './settingsLayout'
import { scrollToSetting } from './settingsScroll'
import { resetSettingsFrom } from './settingsStore'

const IDENTITY_LABEL: Record<AppInfo['identity'], string> = {
  production: 'zainstalowana',
  development: 'deweloperska (Regulated Day Dev)',
  test: 'testowa (Regulated Day Test)'
}

/** „Wersja” in the information (D344, UX14): the number the updates show, and what the installation is. */
export const appVersionText = (info: Pick<AppInfo, 'version' | 'identity'> | null): string => (info ? `${info.version} · ${IDENTITY_LABEL[info.identity]}` : '')

const HELPER_LABEL: Record<AppInfo['helper']['state'], string> = {
  running: 'działa',
  starting: 'uruchamia się',
  unavailable: 'niedostępny – kilka razy przestał działać',
  missing: 'brak programu pomocnika',
  off: 'wyłączony'
}

/** The shortcuts at the bottom stay where they were (UX15 moves them). */
function ShortcutsSection() {
  return (
    <Section title="Skróty klawiszowe" data-testid="settings-shortcuts">
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
  )
}

/** „Aktualizacje”: the night install and the state of the updates (the version is in „Informacje”). */
function UpdatesSection({ info, setInfo }: { info: AppInfo | null; setInfo: (i: AppInfo) => void }) {
  const [update, setUpdate] = useState<UpdateView | null>(null)
  useEffect(() => {
    void window.rd.update().then(setUpdate)
    return window.rd.onUpdate(setUpdate)
  }, [])
  return (
    <Section title="Aktualizacje" data-testid="settings-updates">
      <Field label="Instalacja w nocy" data-testid="field-night-install" hint="W ciszy nocnej, przy zablokowanym ekranie albo bez używania komputera od 30 min, na zasilaniu z sieci i poza blokami. Przed pierwszym otwarciem danych nowa wersja robi ich kopię.">
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
  )
}

/** „Informacje”: one „Wersja” (the number with what the installation is, D344), the helper, the folder of the program, the logs. */
function InfoSection({ info }: { info: AppInfo | null }) {
  return (
    <Section title="Informacje" data-testid="settings-info">
      <Field label="Wersja" data-testid="field-version">
        <span className="num" data-testid="identity">
          {appVersionText(info)}
        </span>
      </Field>
      <Field label="Pomocnik" data-testid="field-helper">
        <span data-testid="helper-state">{info ? HELPER_LABEL[info.helper.state] : ''}</span>
      </Field>
      <Field label="Folder programu" data-testid="field-app-folder" hint="Konfiguracja i logi tego komputera – nie Twoje dane (ich folder jest w „Dane”).">
        <span className="break-all text-[12px] text-muted" data-testid="user-data">
          {info?.userData ?? ''}
        </span>
      </Field>
      <Field label="Logi" data-testid="field-logs">
        <button type="button" className="btn" onClick={() => void window.rd.openLogs()} data-testid="open-logs">
          Otwórz logi
        </button>
      </Field>
    </Section>
  )
}

/** The section of the layout's id (`settingsItems` already leaves out the ones that need the folder when it is not open). */
function sectionElement(id: string, info: AppInfo | null, setInfo: (i: AppInfo) => void): ReactNode {
  switch (id) {
    case 'settings-modules':
      return <ModulesSection />
    case 'settings-daytypes':
      return <DayTypesSection />
    case 'settings-sleep':
      return <FieldsSection group="sleep" />
    case 'settings-boundary':
      return <FieldsSection group="boundary" />
    case 'settings-plan':
      return <FieldsSection group="plan" />
    case 'settings-energy':
      return <FieldsSection group="energy" />
    case 'settings-accuracy':
      return <FieldsSection group="accuracy" />
    case 'settings-timer':
      return <FieldsSection group="timer" />
    case 'settings-reminders':
      return <FieldsSection group="reminders" />
    case 'settings-care':
      return <FieldsSection group="care" />
    case 'settings-calibration':
      return <CalibrationSection />
    case 'settings-categories':
      return <CategoriesSection />
    case 'settings-calendars':
      return <CalendarsSection />
    case 'settings-lectures':
      return <LecturesSection />
    case 'settings-cases':
      return <FieldsSection group="cases" />
    case 'settings-bar':
      return <BarSection />
    case 'settings-notices':
      return <NoticesSection />
    case 'settings-machine':
      return <MachineSection />
    case 'settings-data':
      return <DataSection />
    case 'settings-computers':
      return <ComputersSection />
    case 'settings-updates':
      return <UpdatesSection info={info} setInfo={setInfo} />
    case 'settings-info':
      return <InfoSection info={info} />
    case 'settings-shortcuts':
      return <ShortcutsSection />
    default:
      return null
  }
}

export function SettingsPage() {
  const dataOpen = useData((s) => s.view?.status === 'open')
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.rd.appInfo().then(setInfo)
  }, [])
  // „Od dziś” / „od daty” lasts only for this visit and this day: then „od jutra” again (T513, A7-13).
  const today = useData((s) => s.view?.today ?? '')
  const [visitDay] = useState(today)
  // A section or a field picked in the search (Ctrl K) or in the box of the page: brought into view once (a section to the top, a field
  // to the middle and marked). Those that need the folder are not there without it.
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    if (pick?.kind !== 'setting') return
    const found = () => document.querySelector(`[data-testid="${pick.id}"]`) !== null
    if (!dataOpen && !found()) {
      if (takePick((p) => p.kind === 'setting')) toast('Ta część ustawień jest dostępna po otwarciu folderu danych.', 'info')
    } else if (takeFoundPick((p) => p.kind === 'setting', found, pick.id.startsWith('field-') ? 'Tego pola ustawień nie ma.' : 'Tej sekcji ustawień nie ma.')) scrollToSetting(pick.id)
  }, [pick, dataOpen])
  useEffect(() => resetSettingsFrom, [])
  useEffect(() => {
    if (today && visitDay && today !== visitDay) resetSettingsFrom()
  }, [today, visitDay])
  const items = settingsItems(dataOpen)
  const range = datedRange(items)
  const draw = (list: SettingsItem[]) =>
    list.map((i) =>
      i.type === 'group' ? (
        <h2 key={`g-${i.group.id}`} className="scroll-mt-[4.5rem] px-1 pt-2 text-[15px] font-semibold text-fg" data-testid={`settings-group-${i.group.id}`}>
          {i.group.title}
        </h2>
      ) : (
        <div key={i.section.id} className="contents">
          {sectionElement(i.section.id, info, setInfo)}
        </div>
      )
    )
  return (
    <div className="mx-auto flex max-w-[1160px] flex-col items-start gap-4 p-4 md:flex-row md:gap-5" data-testid="settings">
      <aside className="flex w-full shrink-0 flex-col gap-3 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:w-[210px] md:overflow-y-auto" data-testid="settings-toc">
        <SettingsSearch dataOpen={dataOpen} />
        <SettingsToc items={items} />
      </aside>
      <div className="flex w-full min-w-0 max-w-[900px] flex-1 flex-col gap-4">
        {/* Three slots that stay when the folder opens or closes, so the sections that stay are not mounted again (UX14). */}
        {draw(range ? items.slice(0, range[0]) : [])}
        {/* One bar „od jutra” over the run of sections with a date, from the first to the last (UX14, E2); the ones at once inside it are marked. */}
        {range && (
          <div className="flex flex-col gap-4" data-testid="settings-dated">
            <FromBar />
            <PlannedChanges action={(c) => <WithdrawAction change={c} />} />
            {draw(items.slice(range[0], range[1] + 1))}
          </div>
        )}
        {draw(range ? items.slice(range[1] + 1) : items)}
      </div>
    </div>
  )
}
