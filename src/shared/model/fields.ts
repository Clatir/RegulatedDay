/**
 * Every setting with a number (spec „Macierz ustawień”) described once: its label, unit, range and where it lives – the
 * shared settings with a date (rd.json „settings”), the shared ones that work at once (rd.json „general”). The settings
 * screen and the wizard draw their fields from here and check a value with the same limits as the schema (spec „Każdy
 * limit w schemacie ma taki sam limit w polu edycji”); the test of the settings goes through every one, with values in
 * and out of its range.
 */
import { countLabel, durationLabel, logicalClock, parseDuration, parseInteger, parseLogicalTime, type Parsed } from '../format'
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
  /** The unit by the number („1 dzień”, „2 dni”, „5 dni”) – where it is counted (`settingValueText`). */
  unitForms?: readonly [string, string, string]
  hint?: string
  group: FieldGroup
}

/**
 * A setting that is on or off, drawn in its group after the fields with a number: dated (rd.json „settings”) or – `scope: 'general'` –
 * one of the shared settings that work at once (rd.json „general”, its path one key).
 */
export interface ToggleField {
  key: string
  scope?: 'dated' | 'general'
  path: string[]
  label: string
  hint: string
  group: FieldGroup
}

/**
 * „Bloki poza komputerem jednym ciągiem” (D553–D556), „… przy komputerze …” (D570), „Bufory dekompresji” (D569) and the proposal
 * „Gorszy dzień” (D570): off by default; „Podpowiedzi długości z historii” (N6, D569, D625): on by default, at once.
 */
export const TOGGLE_FIELDS: readonly ToggleField[] = [
  {
    key: 'awayChain',
    path: ['awayChain'],
    label: 'Bloki poza komputerem jednym ciągiem',
    hint: 'Gdy nikogo nie ma przy komputerze, każdy blok poza komputerem (posiłek, rutyna, sprawy domowe, spacer…) kończy się o swoim planowanym końcu i od razu zaczyna się następny – bez pytania po powrocie; każdy start i koniec jest na liście „zrobione automatycznie” z „Cofnij”. Powrót w trakcie bloku kończy go jak dotąd.',
    group: 'timer'
  },
  // „Bloki przy komputerze jednym ciągiem” (D570, D620): off by default.
  {
    key: 'deskChain',
    path: ['deskChain'],
    label: 'Bloki przy komputerze jednym ciągiem',
    hint: 'Gdy blok przy komputerze dobiega końca, a Ty pracujesz (klawiatura albo mysz w ostatnich 2 min), kończy się o planowanym końcu jako zrobiony i od razu zaczyna się następny blok przy komputerze, jeśli zaczyna się najpóźniej 5 min później – zamiast pytania „Dalej?”. Pasek mówi „Dalej: <nazwa> · Cofnij” przez 10 s. Nie przed sesją, wykładem, zjazdem, dojazdem, blokiem stałym, buforem dekompresji, blokiem za granicą ani po ostatnim bloku pracy.',
    group: 'timer'
  },
  // „Bufory dekompresji” (D386, D403, D569): off by default, beside its thresholds.
  {
    key: 'decompress.on',
    path: ['decompress', 'on'],
    label: 'Bufory dekompresji',
    hint: 'Po długim bloku o wysokim koszcie głowy, emocji albo bodźców plan wstawia blok „Dekompresja” (regeneracja, 5–20 min) i przesuwa kolejne elastyczne; stałe zostają. Bufor zaczyna się sam po końcu bloku; usuniesz go jak każdy blok.',
    group: 'plan'
  },
  // „Gorszy dzień” (D570, D587): the proposal after the check-in off by default; the button of the morning plan is there always.
  {
    key: 'worseDay.propose',
    path: ['worseDay', 'propose'],
    label: 'Proponuj „Gorszy dzień” po check-inie',
    hint: 'Gdy check-in pokaże gorzej w co najmniej dwóch pulach (wynik puli 65 albo niżej – jedno „tak” albo dwa razy „trochę”), plan poranny zaproponuje „Gorszy dzień” – rutyny w wersji na gorsze dni i wcześniejszą granicę. Przycisk „Gorszy dzień” w planie porannym działa zawsze.',
    group: 'plan'
  },
  // „Podpowiedzi długości z historii” (N6, D569, D625): on by default, beside its thresholds; only a hint of the window – at once.
  {
    key: 'durationHints',
    scope: 'general',
    path: ['durationHints'],
    label: 'Podpowiedzi długości z historii',
    hint: 'Przy polu „Długość” bloku i „Szacunek” sprawy: „zwykle trwa 45 min · Przyjmij”, gdy mediana faktycznego czasu zakończonych bloków tej podkategorii z ostatnich 90 dni różni się od wpisanej. Nic nie zmienia się samo.',
    group: 'plan'
  }
]

export type FieldGroup = 'dayTypes' | 'sleep' | 'boundary' | 'plan' | 'energy' | 'accuracy' | 'reminders' | 'timer' | 'care' | 'cases'

export const FIELD_GROUP_NAMES: Record<FieldGroup, string> = {
  dayTypes: 'Typy dni',
  sleep: 'Sen',
  boundary: 'Granica i przejścia',
  // Parallel blocks (D476): how many at once.
  plan: 'Plan dnia',
  energy: 'Energia',
  // The tolerance of the accuracy (UX14, E6): its own section, read by the game and by the reviews, not a question of the day.
  accuracy: 'Trafność planu',
  reminders: 'Przypomnienia',
  timer: 'Pytania w ciągu dnia',
  care: 'Przerwy, woda i samotność',
  // The section „Sprawy” of the shared settings (D452); the quick capture's shortcut stays in „Ten komputer”.
  cases: 'Sprawy'
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
  { key: 'signalEffects.rockingAll', scope: 'dated', path: ['signalEffects', 'rockingAll'], label: 'Więcej bujania: głowa, emocje, bodźce −', kind: 'integer', range: RANGES.signalEffect, group: 'energy' },
  { key: 'signalEffects.questionsEmotions', scope: 'dated', path: ['signalEffects', 'questionsEmotions'], label: 'Drażnią pytania: emocje −', kind: 'integer', range: RANGES.signalEffect, group: 'energy' },
  { key: 'reminders.morningAfterWakeMin', scope: 'dated', path: ['reminders', 'morningAfterWakeMin'], label: 'Plan poranny po pobudce', kind: 'duration', range: RANGES.reminder, group: 'reminders', hint: '0 wyłącza przypomnienie.' },
  { key: 'reminders.morningBeforeFixedMin', scope: 'dated', path: ['reminders', 'morningBeforeFixedMin'], label: 'Plan poranny najpóźniej przed blokiem stałym', kind: 'duration', range: RANGES.reminder, group: 'reminders' },
  { key: 'reminders.ritualBeforeBedMin', scope: 'dated', path: ['reminders', 'ritualBeforeBedMin'], label: 'Rytuał przed porą snu', kind: 'duration', range: RANGES.reminder, group: 'reminders', hint: '0 wyłącza przypomnienie.' },
  { key: 'idleThresholdMin', scope: 'dated', path: ['idleThresholdMin'], label: 'Próg bezczynności', kind: 'duration', range: RANGES.idleThresholdMin, group: 'timer' },
  { key: 'absenceQuestionMin', scope: 'dated', path: ['absenceQuestionMin'], label: 'Pytanie o nieobecność po', kind: 'duration', range: RANGES.absenceQuestionMin, group: 'timer' },
  { key: 'accuracyTolerancePct', scope: 'dated', path: ['accuracyTolerancePct'], label: 'Tolerancja trafności', kind: 'integer', range: RANGES.accuracyTolerancePct, unit: '%', group: 'accuracy', hint: 'Nie mniej niż 5 min.' },
  { key: 'waterEveryMin', scope: 'general', path: ['waterEveryMin'], label: 'Woda co', kind: 'duration', range: GENERAL_RANGES.waterEveryMin, group: 'care', hint: 'Przy przejściu między blokami po 2/3 odstępu.' },
  { key: 'breakAfterMin', scope: 'general', path: ['breakAfterMin'], label: 'Przerwa po ciągłej pracy', kind: 'duration', range: GENERAL_RANGES.breakAfterMin, offAllowed: true, group: 'care', hint: '0 wyłącza propozycję.' },
  { key: 'breakMin', scope: 'general', path: ['breakMin'], label: 'Długość przerwy', kind: 'duration', range: GENERAL_RANGES.breakMin, group: 'care' },
  { key: 'solitudeAfterMin', scope: 'general', path: ['solitudeAfterMin'], label: 'Samotność po kontakcie dłuższym niż', kind: 'duration', range: GENERAL_RANGES.solitudeAfterMin, offAllowed: true, group: 'care', hint: 'Po tak długim kontakcie z ludźmi aplikacja sugeruje chwilę samotności; 0 wyłącza sugestię.' },
  { key: 'decompress.minLengthMin', scope: 'dated', path: ['decompress', 'minLengthMin'], label: 'Bufor dekompresji po bloku od', kind: 'duration', range: RANGES.decompressLengthMin, group: 'plan', hint: 'Długość bloku (z „Przedłuż”), po którym stoi bufor dekompresji.' },
  { key: 'decompress.minCost', scope: 'dated', path: ['decompress', 'minCost'], label: 'Bufor dekompresji przy koszcie od', kind: 'integer', range: RANGES.decompressCost, unit: '/h', group: 'plan', hint: 'Koszt głowy, emocji albo bodźców na godzinę (1 = 3 punkty energii na godzinę).' },
  { key: 'worseDay.earlierMin', scope: 'dated', path: ['worseDay', 'earlierMin'], label: 'O ile wcześniej kończyć pracę w gorszy dzień', kind: 'duration', range: RANGES.worseDayEarlierMin, group: 'plan', hint: 'Tyle wcześniej staje granica po przyjęciu „Gorszego dnia” – nie przed chwilą przyjęcia; 0 zostawia granicę.' },
  { key: 'parallelMax', scope: 'general', path: ['parallelMax'], label: 'Najwięcej bloków naraz', kind: 'integer', range: GENERAL_RANGES.parallelMax, group: 'plan', hint: 'Blok przeciągnięty na inny biegnie razem z nim; ponad tę liczbę staje zaraz po grupie.' },
  // The thresholds of „Podpowiedzi długości z historii” (N6, D569: thresholds in the settings; D625).
  { key: 'durationHintBlocks', scope: 'general', path: ['durationHintBlocks'], label: 'Podpowiedź długości od bloków', kind: 'integer', range: GENERAL_RANGES.durationHintBlocks, group: 'plan', hint: 'Tyle zakończonych bloków podkategorii w ostatnich 90 dniach potrzeba do podpowiedzi.' },
  { key: 'durationHintPct', scope: 'general', path: ['durationHintPct'], label: 'Podpowiedź przy różnicy od', kind: 'integer', range: GENERAL_RANGES.durationHintPct, unit: '%', group: 'plan', hint: 'O tyle procent wpisanej długości musi różnić się mediana.' },
  { key: 'durationHintMin', scope: 'general', path: ['durationHintMin'], label: 'Podpowiedź przy różnicy co najmniej', kind: 'duration', range: GENERAL_RANGES.durationHintMin, group: 'plan', hint: 'I o tyle minut – oba progi naraz.' },
  { key: 'deadlineDays', scope: 'general', path: ['deadlineDays'], label: 'Ostrzegaj o terminie na', kind: 'integer', range: GENERAL_RANGES.deadlineDays, unit: 'dni', unitForms: ['dzień', 'dni', 'dni'], group: 'cases', hint: 'Plan poranny pokazuje sprawy po terminie i z terminem do tylu dni naprzód (2 – dziś, jutro i pojutrze).' }
]

export function fieldByKey(key: string): NumberField | undefined {
  return NUMBER_FIELDS.find((f) => f.key === key)
}

/** A setting's value with its unit as the settings show it („20 %”, „3 /h”, „1 dzień”, „2 dni”; a duration and a time as `formatField`). */
export function settingValueText(f: Pick<NumberField, 'kind' | 'unit' | 'unitForms'>, v: number): string {
  if (f.kind !== 'integer' || !f.unit) return formatField(f, v)
  return f.unitForms ? countLabel(v, ...f.unitForms) : `${v} ${f.unit}`
}

/**
 * The field with a unit whose value stands at `path` (a record's path – the field's own path at its end, e.g. `decompress.minCost`
 * under a change of the settings, `deadlineDays` under `general`; T2938). Another record's field of the same last name is not it.
 */
export function unitFieldAt(path: readonly string[]): NumberField | undefined {
  return NUMBER_FIELDS.find((f) => f.unit && f.kind === 'integer' && f.path.length <= path.length && f.path.every((k, i) => path[path.length - f.path.length + i] === k))
}

/** The name of a setting by its key – a field with a number or a switch (T2915: the questions and the history name a shared switch too). */
export function settingLabelOf(key: string): string | undefined {
  return (fieldByKey(key) ?? TOGGLE_FIELDS.find((f) => f.key === key))?.label
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
