/**
 * Every setting with a number (spec „Macierz ustawień”) described once: its label, unit, range and where it lives – the
 * shared settings with a date (rd.json „settings”), the shared ones that work at once (rd.json „general”). The settings
 * screen and the wizard draw their fields from here and check a value with the same limits as the schema (spec „Każdy
 * limit w schemacie ma taki sam limit w polu edycji”); the test of the settings goes through every one, with values in
 * and out of its range.
 */
import { durationLabel, logicalClock, parseDuration, parseInteger, parseLogicalTime, type Parsed } from '../format'
import { GENERAL_RANGES } from './rd'
import { DAY_TYPES, DAY_TYPE_NAMES, RANGES, type DayTypeId } from './settings'

/** How a value is written and read: a duration („90”, „1:30”, „1h30”), a time of the logical day, a whole number. */
export type FieldKind = 'duration' | 'time' | 'integer'

export interface NumberField {
  key: string
  /** Where it lives: dated settings (RulesSettings) or the shared settings that work at once (GeneralSettings). */
  scope: 'dated' | 'general'
  path: string[]
  label: string
  kind: FieldKind
  range: readonly [number, number]
  /** 0 switches it off (besides the range). */
  offAllowed?: boolean
  unit?: string
  hint?: string
  group: FieldGroup
}

export type FieldGroup = 'dayTypes' | 'sleep' | 'boundary' | 'energy' | 'reminders' | 'timer' | 'care'

export const FIELD_GROUP_NAMES: Record<FieldGroup, string> = {
  dayTypes: 'Typy dni',
  sleep: 'Sen',
  boundary: 'Granica i przejścia',
  energy: 'Energia',
  reminders: 'Przypomnienia',
  timer: 'Pytania w ciągu dnia',
  care: 'Przerwy, woda i samotność'
}

/** The fields of one day type (their label names the type in the settings' table). */
export const DAY_TYPE_FIELDS: ReadonlyArray<{ key: keyof typeof RANGES & string; label: string; kind: FieldKind }> = [
  { key: 'budgetMin', label: 'Budżet pracy', kind: 'duration' },
  { key: 'maxMin', label: 'Maksimum granicy', kind: 'time' },
  { key: 'wakeMin', label: 'Pobudka', kind: 'time' },
  { key: 'bedtimeMin', label: 'Pora snu', kind: 'time' },
  { key: 'minRegenMin', label: 'Minimum regeneracji', kind: 'duration' },
  { key: 'projectLimitMin', label: 'Limit projektów', kind: 'duration' }
]

const dayTypeFields: NumberField[] = DAY_TYPES.flatMap((t: DayTypeId) =>
  DAY_TYPE_FIELDS.map((f) => ({
    key: `dayTypes.${t}.${f.key}`,
    scope: 'dated' as const,
    path: ['dayTypes', t, f.key],
    label: `${DAY_TYPE_NAMES[t]}: ${f.label.toLowerCase()}`,
    kind: f.kind,
    range: RANGES[f.key as keyof typeof RANGES] as readonly [number, number],
    group: 'dayTypes' as const
  }))
)

export const NUMBER_FIELDS: readonly NumberField[] = [
  ...dayTypeFields,
  { key: 'targetSleepMin', scope: 'dated', path: ['targetSleepMin'], label: 'Docelowy sen', kind: 'duration', range: RANGES.targetSleepMin, group: 'sleep', hint: 'Pora snu wypada najpóźniej tyle przed jutrzejszą pobudką.' },
  { key: 'bedtimeShiftMaxMin', scope: 'dated', path: ['bedtimeShiftMaxMin'], label: 'Przesunięcie pory snu', kind: 'duration', range: RANGES.bedtimeShiftMaxMin, group: 'sleep', hint: 'Najwięcej na noc, przy pustej puli projektów.' },
  { key: 'boundaryBufferMin', scope: 'dated', path: ['boundaryBufferMin'], label: 'Bufor propozycji granicy', kind: 'duration', range: RANGES.boundaryBufferMin, group: 'boundary' },
  { key: 'transitionBufferMin', scope: 'dated', path: ['transitionBufferMin'], label: 'Bufor przejścia', kind: 'duration', range: RANGES.transitionBufferMin, group: 'boundary', hint: 'Między blokami różnych kategorii; 0 wyłącza bufor.' },
  { key: 'exceptionMaxMin', scope: 'dated', path: ['exceptionMaxMin'], label: 'Wyjątek granicy – najwięcej', kind: 'duration', range: RANGES.exceptionMaxMin, group: 'boundary' },
  { key: 'exceptionWarnFrom', scope: 'dated', path: ['exceptionWarnFrom'], label: 'Ostrzeżenie od wyjątku nr', kind: 'integer', range: RANGES.exceptionWarnFrom, group: 'boundary', hint: 'Który wyjątek w miesiącu daje ostrzeżenie (jest dalej możliwy).' },
  { key: 'reserve', scope: 'dated', path: ['reserve'], label: 'Rezerwa energii', kind: 'integer', range: RANGES.reserve, group: 'energy' },
  { key: 'backgroundCostPct', scope: 'dated', path: ['backgroundCostPct'], label: 'Koszt bloku w tle', kind: 'integer', range: RANGES.backgroundCostPct, unit: '%', group: 'energy' },
  { key: 'signalEffects.glassesSenses', scope: 'dated', path: ['signalEffects', 'glassesSenses'], label: 'Okulary i zatyczki: bodźce −', kind: 'integer', range: RANGES.signalEffect, group: 'energy' },
  { key: 'signalEffects.rockingAll', scope: 'dated', path: ['signalEffects', 'rockingAll'], label: 'Więcej bujania: każda pula −', kind: 'integer', range: RANGES.signalEffect, group: 'energy' },
  { key: 'signalEffects.questionsEmotions', scope: 'dated', path: ['signalEffects', 'questionsEmotions'], label: 'Drażnią pytania: emocje −', kind: 'integer', range: RANGES.signalEffect, group: 'energy' },
  { key: 'reminders.morningAfterWakeMin', scope: 'dated', path: ['reminders', 'morningAfterWakeMin'], label: 'Plan poranny po pobudce', kind: 'duration', range: RANGES.reminder, group: 'reminders', hint: '0 wyłącza przypomnienie.' },
  { key: 'reminders.morningBeforeFixedMin', scope: 'dated', path: ['reminders', 'morningBeforeFixedMin'], label: 'Plan poranny najpóźniej przed blokiem stałym', kind: 'duration', range: RANGES.reminder, group: 'reminders' },
  { key: 'reminders.ritualBeforeBedMin', scope: 'dated', path: ['reminders', 'ritualBeforeBedMin'], label: 'Rytuał przed porą snu', kind: 'duration', range: RANGES.reminder, group: 'reminders', hint: '0 wyłącza przypomnienie.' },
  { key: 'idleThresholdMin', scope: 'dated', path: ['idleThresholdMin'], label: 'Próg bezczynności', kind: 'duration', range: RANGES.idleThresholdMin, group: 'timer' },
  { key: 'absenceQuestionMin', scope: 'dated', path: ['absenceQuestionMin'], label: 'Pytanie o nieobecność po', kind: 'duration', range: RANGES.absenceQuestionMin, group: 'timer' },
  { key: 'accuracyTolerancePct', scope: 'dated', path: ['accuracyTolerancePct'], label: 'Tolerancja trafności', kind: 'integer', range: RANGES.accuracyTolerancePct, unit: '%', group: 'timer', hint: 'Nie mniej niż 5 min.' },
  { key: 'waterEveryMin', scope: 'general', path: ['waterEveryMin'], label: 'Woda co', kind: 'duration', range: GENERAL_RANGES.waterEveryMin, group: 'care', hint: 'Przy przejściu między blokami po 2/3 odstępu.' },
  { key: 'breakAfterMin', scope: 'general', path: ['breakAfterMin'], label: 'Przerwa po ciągłej pracy', kind: 'duration', range: GENERAL_RANGES.breakAfterMin, offAllowed: true, group: 'care', hint: '0 wyłącza propozycję.' },
  { key: 'breakMin', scope: 'general', path: ['breakMin'], label: 'Długość przerwy', kind: 'duration', range: GENERAL_RANGES.breakMin, group: 'care' },
  { key: 'solitudeAfterMin', scope: 'general', path: ['solitudeAfterMin'], label: 'Samotność po kontakcie dłuższym niż', kind: 'duration', range: GENERAL_RANGES.solitudeAfterMin, offAllowed: true, group: 'care', hint: '0 wyłącza sugestię.' }
]

export function fieldByKey(key: string): NumberField | undefined {
  return NUMBER_FIELDS.find((f) => f.key === key)
}

/** How a value of the field is shown. */
export function formatField(f: Pick<NumberField, 'kind'>, v: number): string {
  if (f.kind === 'time') return logicalClock(v)
  if (f.kind === 'duration') return durationLabel(v)
  return String(v)
}

const rangeText = (f: Pick<NumberField, 'kind' | 'range' | 'offAllowed'>) =>
  `${f.offAllowed ? '0 albo ' : ''}${formatField(f, f.range[0])}–${formatField(f, f.range[1])}`

/** A typed value of the field, checked against its range (the same as the schema's); a refused one says why. */
export function parseField(f: Pick<NumberField, 'kind' | 'range' | 'offAllowed'>, text: string): Parsed<number> {
  const [min, max] = f.range
  let r: Parsed<number>
  if (f.kind === 'time') r = parseLogicalTime(text)
  // A duration field whose range starts at 0 (a budget, a buffer, a reminder switched off) takes „0”.
  else if (f.kind === 'duration') r = /^\s*0+\s*(m|min)?\s*$/i.test(text) ? { ok: true, value: 0 } : parseDuration(text, Math.max(max, 1))
  else r = parseInteger(text, f.offAllowed ? 0 : min, max)
  if (!r.ok) return r
  return checkField(f, r.value)
}

/** A value of the field (from a field or a file) within its range. */
export function checkField(f: Pick<NumberField, 'kind' | 'range' | 'offAllowed'>, v: number): Parsed<number> {
  const [min, max] = f.range
  if (!Number.isInteger(v)) return { ok: false, message: 'Wpisz liczbę całkowitą.' }
  if (f.offAllowed && v === 0) return { ok: true, value: 0 }
  if (v < min || v > max) return { ok: false, message: `Dozwolone: ${rangeText(f)}.` }
  return { ok: true, value: v }
}
