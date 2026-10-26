/**
 * Próba (D286, E0): every state of the icon and the bar, the desktop bar's placing, a notification in 10 s, the power
 * requests, the trial's log (what the helper saw), and the interface conventions to try by hand. Removed before 1.0.
 */
import { useEffect, useMemo, useState } from 'react'
import type { TrialState } from '@shared/widget'
import { durationLabel, logicalClock, plDate } from '@shared/format'
import { TONE_SETS, type Tone, type ToneSetId, type WarnStep } from '@shared/theme'

const TONE_SET_IDS = Object.keys(TONE_SETS) as ToneSetId[]
import { Counter, EmptyState, Field, ReadOnlyMark, Section, Segmented, Toggle } from '../../components/ui'
import { DateField, DurationField, IntegerField, TimeField } from '../../components/fields'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { undoToast } from '../../store/ui'

const TONES: Array<{ value: Tone; label: string }> = [
  { value: 'praca', label: 'praca' },
  { value: 'zycie', label: 'życie i opieka' },
  { value: 'wolne', label: 'wolne' },
  { value: 'rezerwa', label: 'rezerwa' },
  { value: 'brak', label: 'bez bloku' }
]
const WARNS: Array<{ value: WarnStep; label: string }> = [
  { value: 'none', label: 'brak' },
  { value: 'warm', label: '15 min' },
  { value: 'five', label: '5 min' },
  { value: 'zero', label: '0 min' }
]
const FLAGS: Array<[keyof TrialState, string]> = [
  ['dot', 'kropka (coś czeka na kliknięcie)'],
  ['drop', 'kropla (woda)'],
  ['question', 'pytanie „Dalej?”'],
  ['quiet', 'tryb ciszy (zwarty, przygaszony pasek)'],
  ['session', 'sesja („Skończyłem”)'],
  ['long', 'najdłuższe teksty'],
  ['hidden', 'widget ukryty („Odcinam się”)']
]

function TrialSwitches() {
  const [t, setT] = useState<TrialState | null>(null)
  useEffect(() => {
    void window.rd.trial().then(setT)
  }, [])
  if (!t) return null
  const set = (patch: Partial<TrialState>) => void window.rd.setTrial(patch).then(setT)
  return (
    <Section title="Ikona i pasek" data-testid="trial-switches">
      <Field label="Kolor (klasa bloku)" hint="Pasek i ikona działają na kolorach roboczych; zestawy do porównania wybierasz niżej (D298).">
        <Segmented value={t.tone} options={TONES} onChange={(tone) => set({ tone })} aria-label="Kolor" data-testid="trial-tone" />
      </Field>
      <Field label="Zestaw kolorów" hint="Porównanie kolorów klas, rezerwy i kroków 15 · 5 · 0 min – wybrany zestaw zostanie w pasku po Twojej decyzji.">
        <Segmented value={t.toneSet} options={TONE_SET_IDS.map((id) => ({ value: id, label: TONE_SETS[id].name }))} onChange={(toneSet) => set({ toneSet })} aria-label="Zestaw kolorów" data-testid="trial-tone-set" />
      </Field>
      <Field label="Ostrzeżenie przed końcem">
        <Segmented value={t.warn} options={WARNS} onChange={(warn) => set({ warn })} aria-label="Ostrzeżenie" data-testid="trial-warn" />
      </Field>
      <Field label="Do końca bloku (min)">
        <IntegerField value={t.minutesLeft} min={0} max={600} onCommit={(minutesLeft) => set({ minutesLeft })} aria-label="Minuty do końca" data-testid="trial-minutes" className="w-[90px]" />
      </Field>
      <div className="grid grid-cols-1 gap-1.5 pl-[192px]">
        {FLAGS.map(([key, label]) => (
          <Toggle key={key} checked={!!t[key]} onChange={(v) => set({ [key]: v })} label={label} data-testid={`trial-${key}`} />
        ))}
      </div>
    </Section>
  )
}

function TrialActions() {
  const act = (a: Parameters<typeof window.rd.trialAction>[0], arg?: string) => void window.rd.trialAction(a, arg)
  return (
    <Section title="Pasek pulpitu, powiadomienia, usypianie">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn" onClick={() => act('showBar')} data-testid="trial-show-bar">
          Pokaż pasek pulpitu
        </button>
        <button type="button" className="btn" onClick={() => act('hideBar')}>
          Ukryj pasek pulpitu
        </button>
        <button type="button" className="btn" onClick={() => act('placeBar')}>
          Połóż ponownie
        </button>
        <button type="button" className="btn" onClick={() => act('nextDisplay')}>
          Następny ekran
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const).map((c) => (
          <button key={c} type="button" className="btn" onClick={() => act('corner', c)}>
            {{ 'bottom-left': 'lewy dolny', 'bottom-right': 'prawy dolny', 'top-left': 'lewy górny', 'top-right': 'prawy górny' }[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-accent" onClick={() => act('notifyIn10s')} data-testid="trial-notify">
          Powiadomienie za 10 s
        </button>
        <button type="button" className="btn" onClick={() => act('openPanel')}>
          Otwórz panel ikony
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn" onClick={() => act('powerDisplay')}>
          Ekran świeci (nagrywanie wykładu)
        </button>
        <button type="button" className="btn" onClick={() => act('powerSystem')}>
          Bez usypiania systemu
        </button>
        <button type="button" className="btn" onClick={() => act('powerOff')}>
          Zwolnij blokady
        </button>
      </div>
      <p className="text-[12px] leading-relaxed text-muted">
        Te same akcje są w menu ikony przy zegarze → Próba, więc możesz je wywołać przy zmaksymalizowanym TradingView bez otwierania tego okna.
      </p>
    </Section>
  )
}

function TrialLog() {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    void window.rd.trialLog().then(setLines)
    return window.rd.onTrialLog((line) => setLines((l) => [...l.slice(-499), line]))
  }, [])
  return (
    <Section title="Dziennik próby" data-testid="trial-log">
      <div className="flex gap-1.5">
        <button type="button" className="btn" onClick={() => void window.rd.copyText(lines.join('\n'))}>
          Skopiuj dziennik
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void window.rd.trialAction('clearLog')
            setLines([])
          }}
        >
          Wyczyść
        </button>
      </div>
      <pre className="num max-h-[260px] overflow-y-auto rounded border border-line bg-bg p-2 text-[11.5px] leading-snug whitespace-pre-wrap text-muted select-text" data-testid="trial-log-lines">
        {lines.length ? lines.join('\n') : 'Na razie pusto – akcje próby i to, co widzi pomocnik, pojawią się tutaj.'}
      </pre>
    </Section>
  )
}

interface DemoItem {
  id: string
  name: string
  kind: 'praca' | 'wolne'
  minutes: number
}

const DEMO: DemoItem[] = [
  { id: 'a', name: 'Analiza tygodnia', kind: 'praca', minutes: 90 },
  { id: 'b', name: 'Spacer', kind: 'wolne', minutes: 40 },
  { id: 'c', name: 'Studia', kind: 'praca', minutes: 120 }
]

/** The conventions to try by hand: the fields, the filters with counts, a deletion with „Cofnij”, the empty state. */
function Conventions() {
  const [duration, setDuration] = useState<number | null>(90)
  const [time, setTime] = useState<number | null>(25 * 60 + 30)
  const [date, setDate] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(3)
  const [items, setItems] = useState(DEMO)
  const [chosen] = useFilters('trial-demo')
  const today = useMemo(() => new Date().toLocaleDateString('sv-SE'), [])
  const shown = chosen.length ? items.filter((i) => chosen.includes(i.kind)) : items
  const remove = (item: DemoItem) => {
    setItems((l) => l.filter((x) => x.id !== item.id))
    undoToast(`Usunięto „${item.name}”.`, () => setItems((l) => (l.some((x) => x.id === item.id) ? l : [...l, item])))
  }
  return (
    <Section title="Konwencje interfejsu" data-testid="trial-conventions">
      <Field label="Długość" hint={duration != null ? `zapisane: ${durationLabel(duration)}` : undefined}>
        <DurationField value={duration} onCommit={setDuration} aria-label="Długość" data-testid="demo-duration" className="w-[160px]" />
      </Field>
      <Field label="Godzina dnia logicznego" hint={time != null ? `zapisane: ${logicalClock(time)}` : undefined}>
        <TimeField value={time} onCommit={setTime} aria-label="Godzina" data-testid="demo-time" className="w-[160px]" />
      </Field>
      <Field label="Data" hint={date ? `zapisane: ${plDate(date)}` : 'Data bez roku to najbliższa taka data od dziś.'}>
        <DateField value={date} today={today} onCommit={setDate} aria-label="Data" data-testid="demo-date" className="w-[200px]" />
      </Field>
      <Field label="Liczba całkowita">
        <IntegerField value={count} min={0} max={99} onCommit={setCount} aria-label="Liczba" data-testid="demo-integer" className="w-[90px]" />
      </Field>
      <FilterBar
        listKey="trial-demo"
        options={[
          { id: 'praca', label: 'praca', count: items.filter((i) => i.kind === 'praca').length },
          { id: 'wolne', label: 'wolne', count: items.filter((i) => i.kind === 'wolne').length }
        ]}
        shown={shown.length}
        total={items.length}
      />
      {shown.length ? (
        <ul className="flex flex-col divide-y divide-line rounded border border-line" data-testid="demo-list">
          {shown.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="flex-1">{i.name}</span>
              <span className="num text-[12px] text-muted">{durationLabel(i.minutes)}</span>
              <button type="button" className="text-[12px] text-rose hover:underline" onClick={() => remove(i)} data-testid={`demo-delete-${i.id}`}>
                Usuń
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState why={items.length ? 'Filtry ukrywają wszystkie bloki.' : 'Lista jest pusta – wszystkie bloki usunięto.'} action={items.length ? undefined : { label: 'Przywróć przykładowe', run: () => setItems(DEMO) }} />
      )}
      <div className="flex items-center gap-3">
        <ReadOnlyMark why="dzień zamrożony" />
        <Counter x={2} y={5} />
      </div>
    </Section>
  )
}

export function TrialPage() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4 p-4" data-testid="trial">
      <p className="leading-relaxed text-muted">
        Próba ikony, panelu i paska pulpitu z etapu E0. Ustaw stan, sprawdź go przy zegarze, w panelu i na pasku pulpitu; dziennik niżej mówi, co widzi pomocnik. Ten ekran zniknie przed wersją
        1.0.
      </p>
      <TrialSwitches />
      <TrialActions />
      <TrialLog />
      <Conventions />
    </div>
  )
}
