/**
 * The shared settings (spec „Macierz ustawień”, „Moduły”): the date changes apply from (by default tomorrow; „od dziś”
 * with a snapshot of today), the modules (at once), the day types and the week, sleep (sessions are entries of the
 * templates since D511 – „Szablony”), the boundary, energy, reminders, the questions of the day, the breaks, water and solitude
 * (the ways of regeneration are variants in „Kategorie”, D510). The
 * fields show the values in force from the chosen date; a minimum of regeneration that would not fit before the bedtime
 * (the same function as the hard end) is a warning – saving is still possible.
 */
import { useMemo } from 'react'
import { DAY_TYPE_FIELDS, FIELD_GROUP_NAMES, NUMBER_FIELDS, type FieldGroup } from '@shared/model/fields'
import { plDate } from '@shared/format'
import { newId } from '@shared/model/ids'
import { MODULES, MODULE_NAMES } from '@shared/model/rd'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, settingsOn, type DayTypeId, type RulesSettings } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { Choice, DateField, TextField } from '../../components/fields'
import { Field, Section, Segmented, Toggle } from '../../components/ui'
import { useData } from '../../store/data'
import { countDay } from '../../store/day'
import { toast } from '../../store/ui'
import { SettingNumber } from './SettingNumber'
import { saveGeneral, saveSettings, setFromDate, setModule, useSettingsFrom, type FromMode } from './settingsStore'

const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']

/**
 * The settings in force from the chosen date, and the function that saves a change of them (today's type is read only
 * when a change „od dziś” is saved – no section counts the day by itself, A7-08).
 */
export function useShared(): { s: RulesSettings; today: string; save: (patch: Record<string, unknown>) => Promise<boolean> } {
  const rd = useData((x) => x.rd)
  const today = useData((x) => x.view?.today ?? '')
  const mode = useSettingsFrom((x) => x.mode)
  const date = useSettingsFrom((x) => x.date)
  const s = useMemo(() => {
    const f = mode === 'today' ? { from: today, at: Date.now() } : mode === 'date' && date && date > today ? { from: date, at: null } : { from: addDays(today, 1), at: null }
    return settingsOn(rd.settings, f.from, f.at)
  }, [rd.settings, today, mode, date])
  return { s, today, save: saveSettings }
}

export function FromBar() {
  const mode = useSettingsFrom((x) => x.mode)
  const date = useSettingsFrom((x) => x.date)
  const rd = useData((x) => x.rd)
  const today = useData((x) => x.view?.today ?? '')
  const future = [...new Set(rd.settings.filter((c) => c.from > today).map((c) => c.from))].sort()
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5" data-testid="settings-from">
      <span className="text-[12.5px]">Zmiany ustawień działają</span>
      <Segmented<FromMode>
        value={mode}
        options={[
          { value: 'tomorrow', label: 'od jutra' },
          { value: 'today', label: 'od dziś' },
          { value: 'date', label: 'od daty' }
        ]}
        onChange={(m) => useSettingsFrom.setState({ mode: m, date: m === 'date' ? (date ?? addDays(today, 2)) : date })}
        aria-label="Od kiedy"
        data-testid="settings-from-mode"
      />
      {mode === 'date' && (
        <DateField
          today={today}
          value={date}
          onCommit={(d) => void (setFromDate(d, today) || toast('Data zmian musi być po dzisiejszej – na dziś wybierz „od dziś”.', 'error'))}
          shellClassName="w-[120px]"
          aria-label="Od daty"
          data-testid="settings-from-date"
        />
      )}
      <span className="text-[12px] text-muted">
        {mode === 'today' ? 'Reszta dzisiejszego dnia liczy się według nowych wartości; minuty już sklasyfikowane się nie zmieniają.' : 'Dni wcześniejsze się nie zmieniają. Moduły i przerwy działają zawsze od razu.'}
        {future.length ? ` Zaplanowane zmiany: od ${future.map(plDate).join(', od ')}.` : ''}
      </span>
    </div>
  )
}

export function ModulesSection() {
  const g = useData((x) => x.rd.general)
  return (
    <Section title="Moduły" data-testid="settings-modules">
      <p className="text-[12px] text-muted">Plan, timer, granica, czas wolny i rytuał działają zawsze. Włączenie albo wyłączenie modułu działa od razu, a jego nagrody z dnia zmiany nie liczą się w żadną stronę.</p>
      {MODULES.map((m) => (
        <Toggle key={m} checked={g.modules[m]} onChange={(v) => void setModule(m, v)} label={MODULE_NAMES[m]} data-testid={`module-${m}`} />
      ))}
    </Section>
  )
}

export function DayTypesSection() {
  const { s, today, save } = useShared()
  const { templates, lectures, rd } = useData()
  // Each type's day from tomorrow: does the minimum fit before the bedtime (the same function as the hard end)?
  const warnings = useMemo(() => {
    const d = addDays(today, 1)
    return DAY_TYPES.filter((t) => {
      if (t === 'wolne') return false
      const m = countDay(d, { date: d, dayFile: { schema: 1, date: d, dayType: t }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rd.settings, templates, lectures, series: [], routines: [] }, placeLogical(d, 4 * 60), false)
      return m.state.hardEnd.unreachable || (m.state.forecastWorkEnd != null && m.state.hardEnd.at < m.state.forecastWorkEnd)
    })
  }, [today, rd.settings, templates, lectures])
  return (
    <Section title="Typy dni" data-testid="settings-daytypes">
      <div className="grid items-center gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: `150px repeat(${DAY_TYPE_FIELDS.length}, minmax(0, 1fr))` }}>
        <span />
        {DAY_TYPE_FIELDS.map((f) => (
          <span key={f.key} className="text-[11.5px] text-muted">
            {f.label}
          </span>
        ))}
        {DAY_TYPES.map((t) => (
          <div key={t} className="contents">
            <span className="text-[12.5px]">{DAY_TYPE_NAMES[t]}</span>
            {DAY_TYPE_FIELDS.map((f) => (
              <SettingNumber
                key={f.key}
                field={{ kind: f.kind, range: RANGES[f.key as keyof typeof RANGES] as readonly [number, number], label: `${DAY_TYPE_NAMES[t]}: ${f.label}` }}
                value={s.dayTypes[t][f.key as 'budgetMin']}
                onCommit={(v) => save({ dayTypes: { [t]: { [f.key]: v } } })}
                className="w-full"
                errorPlacement="below"
                data-testid={`setting-${t}-${f.key}`}
              />
            ))}
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <p className="rounded border border-rose/40 bg-rose-soft px-3 py-2 text-[12.5px]" data-testid="settings-min-warning">
          Minimum regeneracji nie zmieści się przed porą snu w typie: {warnings.map((t) => DAY_TYPE_NAMES[t].toLowerCase()).join(', ')} (przy obecnym planie). Możesz to zapisać – plan pokaże ostrzeżenie.
        </p>
      )}
      <Field label="Tydzień" hint="Typ, który dzień tygodnia ma, gdy w kalendarzu nie ustawisz innego.">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">
          {WEEKDAY_NAMES.map((n, i) => (
            <label key={n} className="flex flex-col gap-0.5 text-[11.5px] text-muted">
              {n}
              <Choice value={s.weekTypes[i]!} options={DAY_TYPES.map((t) => ({ value: t, label: DAY_TYPE_NAMES[t] }))} onChange={(t) => save({ weekTypes: s.weekTypes.map((x, j) => (j === i ? t : x)) })} aria-label={`Typ: ${n}`} data-testid={`setting-week-${i}`} />
            </label>
          ))}
        </div>
      </Field>
    </Section>
  )
}

/** A group of number fields (dated or working at once). */
export function FieldsSection({ group }: { group: FieldGroup }) {
  const { s, save } = useShared()
  const general = useData((x) => x.rd.general)
  const fields = NUMBER_FIELDS.filter((f) => f.group === group)
  return (
    <Section title={FIELD_GROUP_NAMES[group]} data-testid={`settings-${group}`}>
      {fields.map((f) => {
        const value = (f.scope === 'dated' ? f.path.reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], s) : general[f.path[0] as keyof typeof general]) as number
        return (
          <Field key={f.key} label={f.label} hint={f.hint} labelWidth={260}>
            <SettingNumber
              field={f}
              value={value}
              onCommit={(v) => (f.scope === 'dated' ? save(f.path.reduceRight<unknown>((inner, k) => ({ [k]: inner }), v) as Record<string, unknown>) : void saveGeneral({ [f.path[0]!]: v }))}
              data-testid={`setting-${f.key}`}
            />
          </Field>
        )
      })}
    </Section>
  )
}
