/**
 * Sprawy (OPS2: D383, D384, D402; the page that was „Prośby”, the same place in the menu and the same key): a sprawa is a
 * task of your own (title, estimate 30 min, category „Inne”, a note) or a request (a person, an estimate, a note – its
 * modes and the cost of contact as before). Five lists – Skrzynka · Dziś (with the sum of its estimates) · W tym tygodniu ·
 * Kiedyś / Może · Zrobione (the last 7 days, „Pokaż starsze”). A sprawa moves between the lists, is edited in place, removed
 * with „Cofnij”, put on the axis of a day with „Zaplanuj” (it stays on its list as „zaplanowane <dzień> <godzina>”); the
 * ones that came back from „Dziś” at 04:00 say so. Ctrl+N adds a task. The counters and the people are the requests' as before.
 */
import { useEffect, useMemo, useState } from 'react'
import type { RequestCounters } from '@shared/api'
import { dueBadge } from '@shared/engine/caseDates'
import { estimateOf, type CaseItem } from '@shared/engine/cases'
import { durationLabel } from '@shared/format'
import { personName } from '@shared/model/rd'
import { CASE_LIST_NAMES, CASE_LISTS, ESTIMATE_RANGE, TITLE_MAX, CASE_NOTE_MAX, DEFAULT_ESTIMATE_MIN, DEFAULT_TASK_CATEGORY, type CaseList } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { parseQuickDates } from '@shared/quickDates'
import { logicalDayOf, logicalMinuteOf } from '@shared/time/day'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { Choice, DateField, DurationField, TextField, TimeField } from '../../components/fields'
import { EmptyState, Section, cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useNow } from '../../lib/clock'
import { useNewShortcut } from '../../lib/escape'
import { changeCase, createRequest, createTask, moveCase, removeCase, undoCase, useCases } from '../../store/cases'
import { addPerson, saveRd, useData } from '../../store/data'
import { useDay } from '../../store/day'
import { takeFoundPick, takePick, undoToast, useUi } from '../../store/ui'
import { categoryOptions } from '../plan/blockView'
import { caseTitle, DATE_PRESETS, filterOf, presetDate, sectionsOf, statusParts } from './casesLogic'
import { DueMark } from './DueMark'
import { nextFreeStart, submitTitle } from './casesUi'
import { planOnAxis } from './planOnAxis'

export function CasesPage() {
  const rd = useData((s) => s.rd)
  const { today, items } = useCases()
  const requestsOn = rd.general.modules.requests
  // Requests belong to their module (spec „Moduły”): switched off, the page is the tasks' alone.
  const all = useMemo(() => items.filter((x) => requestsOn || x.record.kind === 'task'), [items, requestsOn])
  const [filters, setFilters] = useFilters('cases')
  const keep = filterOf(filters)
  const [showOlder, setShowOlder] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [bring, setBring] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const addRequest = async () => {
    const r = await createRequest({ person: null, estimateMin: DEFAULT_ESTIMATE_MIN, note: '' })
    if (r.id) setBring(r.id)
  }
  useNewShortcut(() => setAdding(true))
  // What the search (Ctrl K) left here: the command „Nowa prośba”, or a sprawa – its filters cleared when they hide it, „Zrobione”
  // opened to it when it is older, its row marked and its first field focused (the row is edited in place).
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    if (pick?.kind === 'command' && pick.id === 'newRequest') {
      takePick((p) => p.kind === 'command' && p.id === 'newRequest')
      if (requestsOn) void addRequest()
      return
    }
    const p = takeFoundPick((x) => x.kind === 'request', (x) => all.some((r) => r.record.id === x.id), 'Tej sprawy nie ma już.')
    const x = p ? all.find((r) => r.record.id === p.id) : undefined
    if (!x) return
    if (!keep(x)) setFilters([])
    if (x.list === 'done' && !x.recent) setShowOlder(true)
    setChosen(x.record.id)
    setBring(x.record.id)
  }, [pick, all])
  useEffect(() => {
    if (!bring) return
    const row = document.querySelector(`[data-case="${bring}"]`)
    if (!row) return
    setBring(null)
    row.scrollIntoView({ block: 'center' })
    row.querySelector<HTMLElement>('[data-testid="case-title"], [data-testid="request-note"]')?.focus()
  }, [bring, filters, showOlder, all])

  const sections = sectionsOf(all, { showOlder, keep })
  const shown = sections.reduce((n, s) => n + s.items.length, 0)
  const options = [
    { id: 'kind:task', label: 'zadania', count: all.filter((x) => x.record.kind === 'task').length },
    ...(requestsOn
      ? [
          { id: 'kind:request', label: 'prośby', count: all.filter((x) => x.record.kind === 'request').length },
          ...rd.people.filter((p) => !p.archived).map((p) => ({ id: `person:${p.id}`, label: p.name, count: all.filter((x) => x.record.person === p.id).length })),
          { id: 'person:?', label: 'osoba: ?', count: all.filter((x) => x.record.kind === 'request' && !x.record.person).length }
        ]
      : [])
  ].filter((o) => o.count > 0 || filters.includes(o.id))
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="requests">
      {requestsOn && <Counters />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-accent" onClick={() => setAdding(true)} data-testid="case-new">
          + Zadanie
        </button>
        {requestsOn && (
          <button type="button" className="btn" onClick={() => void addRequest()} data-testid="request-new">
            + Prośba
          </button>
        )}
        <span className="text-[12px] text-muted">Ctrl N – nowe zadanie · „!jutro” na końcu tytułu ustawia termin, „@pt” – datę wykonania</span>
      </div>
      {adding && <NewTask onClose={() => setAdding(false)} />}
      <FilterBar listKey="cases" options={options} shown={shown} total={all.length} />
      {all.length === 0 && !adding && <EmptyState why="Nic tu jeszcze nie ma. Zadanie „na kiedyś” wpiszesz tutaj albo skrótem Win+Alt+N z dowolnego miejsca – ląduje w Skrzynce, a rano wybierzesz je w planie." action={{ label: '+ Zadanie', run: () => setAdding(true) }} />}
      {all.length > 0 &&
        sections.map((s) => (
          <section key={s.list} className="flex flex-col gap-1.5" data-testid={`cases-${s.list}`}>
            <h3 className="flex items-baseline gap-2 text-[13px] font-medium">
              <span data-testid={`cases-${s.list}-title`}>{s.title}</span>
              <span className="num text-[11.5px] font-normal text-muted">{s.items.length}</span>
            </h3>
            {s.items.length ? (
              <div className="flex flex-col gap-1.5" data-testid={`cases-${s.list}-list`}>
                {s.items.map((x) => (
                  <CaseRow key={x.record.id} x={x} today={today} marked={x.record.id === chosen} />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted">{filters.length && all.some((x) => x.list === s.list) ? 'Nic nie pasuje do filtrów.' : 'Pusto.'}</p>
            )}
            {s.list === 'done' && (s.older > 0 || showOlder) && (
              <button type="button" className="self-start text-[12px] text-lamp hover:underline" onClick={() => setShowOlder(!showOlder)} data-testid="cases-older">
                {showOlder ? 'Ukryj starsze' : `Pokaż starsze (${s.older})`}
              </button>
            )}
          </section>
        ))}
      {requestsOn && (
        <Section title="Osoby">
          <People />
        </Section>
      )}
    </div>
  )
}

/** A new task (D384): its title – Enter adds it to „Skrzynka” (30 min, „Inne”; the rest is edited in its row), Esc closes. */
function NewTask({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, run] = useBusy()
  // D409: the words of dates at the end of the title – what they set, said under the field before Enter.
  const today = logicalDayOf(useNow(60_000))
  const preview = parseQuickDates(title, today).preview
  // Once: the field is cleared at once and a second Enter (or „Dodaj”) while it saves does nothing; a save that did not happen gives the title back.
  const add = () => submitTitle(run, title, { set: setTitle, save: async (t) => (await createTask({ title: t })).saved, done: onClose })
  return (
    <div className="flex flex-col gap-1" data-testid="case-add">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="input min-w-0 flex-1"
          value={title}
          readOnly={busy}
          maxLength={TITLE_MAX}
          placeholder="Tytuł zadania – Enter dodaje do Skrzynki"
          aria-label="Tytuł zadania"
          onChange={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          data-testid="case-add-title"
        />
        <button type="button" className="btn btn-accent" disabled={busy || !title.trim()} onClick={() => void add()} data-testid="case-add-save">
          Dodaj
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Anuluj
        </button>
      </div>
      {preview && (
        <span className="text-[12px] text-muted" data-testid="case-add-preview">
          {preview}
        </span>
      )}
    </div>
  )
}

function CaseRow({ x, today, marked }: { x: CaseItem; today: string; marked: boolean }) {
  const rd = useData((s) => s.rd)
  const r = x.record
  const isTask = r.kind === 'task'
  const names = useMemo(() => ({ rd, settings: settingsOn(rd.settings, today) }), [rd, today])
  const [planning, setPlanning] = useState(false)
  const [dating, setDating] = useState(false)
  const set = (patch: Parameters<typeof changeCase>[1]) => void changeCase(r.id, patch)
  const remove = async () => {
    const res = await removeCase(r.id)
    if (res.saved) undoToast(isTask ? 'Zadanie usunięte' : 'Prośba usunięta', () => void undoCase(res.undo))
  }
  const parts = statusParts(x, today)
  const badge = dueBadge(r, today)
  const done = x.list === 'done'
  return (
    <div className={cx('flex flex-col gap-1 rounded border px-3 py-1.5', marked ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel')} data-testid="case-row" data-case={r.id} data-kind={r.kind} data-list={x.list}>
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: '220px 110px minmax(0,1fr) 150px' }}>
        {isTask ? (
          <TextField value={r.title} onCommit={(title) => set({ title })} required max={TITLE_MAX} placeholder="tytuł" aria-label="Tytuł" errorPlacement="float" data-testid="case-title" />
        ) : (
          <PersonChoice value={r.person} onChange={(person) => set({ person })} />
        )}
        <DurationField value={isTask ? x.estimateMin : r.estimateMin} range={ESTIMATE_RANGE} onCommit={(estimateMin) => set({ estimateMin })} placeholder="szacunek" aria-label="Szacunek" errorPlacement="float" data-testid="request-estimate" />
        <TextField value={r.note} onCommit={(note) => set({ note })} max={CASE_NOTE_MAX} placeholder={isTask ? 'notatka' : 'czego dotyczy'} aria-label="Notatka" errorPlacement="float" data-testid="request-note" />
        {isTask ? <Choice value={r.categoryId ?? DEFAULT_TASK_CATEGORY} options={categoryOptions(names, r.categoryId ?? DEFAULT_TASK_CATEGORY)} onChange={(categoryId) => set({ categoryId })} aria-label="Kategoria" data-testid="case-category" /> : <span className="text-[12px] text-muted">prośba</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {badge && <DueMark badge={badge} />}
        <span className="min-w-0 flex-1 text-muted" data-testid="case-status">
          {parts.join(' · ')}
        </span>
        <Choice value={x.list} options={CASE_LISTS.map((l) => ({ value: l, label: CASE_LIST_NAMES[l] }))} onChange={(list: CaseList) => void moveCase(r.id, list)} className="h-[24px] text-[12px]" aria-label="Lista" data-testid="case-list" />
        {!done && (
          <>
            <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => void moveCase(r.id, 'done')} data-testid="case-done">
              Zrobione
            </button>
            <button type="button" className="btn h-[24px] px-2 text-[12px]" aria-pressed={planning} onClick={() => setPlanning(!planning)} data-testid="case-plan-open">
              Zaplanuj
            </button>
            <button type="button" className="btn h-[24px] px-2 text-[12px]" aria-pressed={dating} onClick={() => setDating(!dating)} data-testid="case-dates-open">
              Terminy
            </button>
          </>
        )}
        <button type="button" className="h-[24px] px-1.5 text-[12px] text-muted hover:text-rose" onClick={() => void remove()} data-testid="request-remove">
          Usuń
        </button>
      </div>
      {dating && !done && <DatesForm x={x} today={today} set={set} />}
      {planning && <PlanForm x={x} today={today} title={caseTitle(r, rd)} onDone={() => setPlanning(false)} />}
    </div>
  )
}

/**
 * „Termin” and „Wykonać” of a sprawa (D409, D451): the date typed (`DateField`: „20.11”, „20.11.2026”), or by a button – „Dziś”,
 * „Jutro”, „Koniec tygodnia”, „Wyczyść”; saved at once by `changeCase`. Under the row's fields, so the grid of the row stays as it is.
 */
function DatesForm({ x, today, set }: { x: CaseItem; today: string; set: (patch: { dueDate?: string | null; doDate?: string | null }) => void }) {
  const r = x.record
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-line pt-1.5 text-[12px]" data-testid="case-dates-form">
      <DateRow label="Termin" id="due" value={r.dueDate} today={today} onSet={(dueDate) => set({ dueDate })} />
      <DateRow label="Wykonać" id="do" value={r.doDate} today={today} onSet={(doDate) => set({ doDate })} />
    </div>
  )
}

function DateRow({ label, id, value, today, onSet }: { label: string; id: 'due' | 'do'; value: string | null; today: string; onSet: (date: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted">{label}</span>
      <DateField value={value} today={today} onCommit={onSet} placeholder="brak" shellClassName="w-[110px]" aria-label={label} errorPlacement="float" data-testid={`case-${id}-date`} />
      {DATE_PRESETS.map((p) => (
        <button key={p.id} type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => onSet(presetDate(p.id, today))} data-testid={`case-${id}-${p.id}`}>
          {p.label}
        </button>
      ))}
      <button type="button" className="h-[24px] px-1.5 text-muted hover:text-fg" disabled={value == null} onClick={() => onSet(null)} data-testid={`case-${id}-clear`}>
        Wyczyść
      </button>
    </div>
  )
}

/**
 * „Zaplanuj” on the page (D384): a day and a start – the block of the sprawa stands there (a day gone by or a start taken:
 * as on the axis); proposed – the nearest free place of the day from now.
 */
function PlanForm({ x, today, title, onDone }: { x: CaseItem; today: string; title: string; onDone: () => void }) {
  const now = useNow(60_000)
  const [date, setDate] = useState(x.scheduled?.day && x.scheduled.day >= today ? x.scheduled.day : today)
  const [start, setStart] = useState<number | null>(null)
  const model = useDay(date)
  const proposed = model ? nextFreeStart(model.state, { isToday: date === today, nowMin: logicalMinuteOf(date, now), wakeMin: model.ctx.wakeMin }, estimateOf(x.record)) : null
  const at = start ?? proposed
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!model || at == null) return
    setBusy(true)
    try {
      const res = await planOnAxis(model, today, x.record, title, at)
      if (res.saved) onDone()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-1.5 text-[12px]" data-testid="case-plan-form">
      <span className="text-muted">Dzień</span>
      <DateField value={date} today={today} onCommit={(d) => (setDate(d), setStart(null))} shellClassName="w-[130px]" aria-label="Dzień" data-testid="case-plan-date" />
      <span className="text-muted">od</span>
      <TimeField value={at} onCommit={setStart} shellClassName="w-[76px]" aria-label="Początek" data-testid="case-plan-start" />
      <span className="text-muted">{durationLabel(estimateOf(x.record))}</span>
      <button type="button" className="btn btn-accent h-[24px] px-2 text-[12px]" disabled={!model || at == null || busy} onClick={() => void save()} data-testid="case-plan-save">
        Postaw na osi
      </button>
      <button type="button" className="text-muted hover:text-fg" onClick={onDone}>
        anuluj
      </button>
    </div>
  )
}

/** A person from the list, or „+ dodaj osobę” (spec „Słowniki”). */
export function PersonChoice({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const rd = useData((s) => s.rd)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (adding)
    return (
      <input
        autoFocus
        className="input"
        value={name}
        maxLength={60}
        placeholder="imię – Enter dodaje"
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => setAdding(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setAdding(false)
          }
          if (e.key === 'Enter')
            void addPerson(name).then((id) => {
              if (id) onChange(id)
              setAdding(false)
              setName('')
            })
        }}
        data-testid="person-new"
      />
    )
  return (
    <Choice
      value={value ?? '?'}
      options={[{ value: '?', label: 'osoba: ?' }, ...rd.people.filter((p) => !p.archived || p.id === value).map((p) => ({ value: p.id, label: p.name })), { value: '+', label: '+ dodaj osobę…' }]}
      onChange={(v) => (v === '+' ? setAdding(true) : onChange(v === '?' ? null : v))}
      aria-label="Osoba"
      data-testid="request-person"
    />
  )
}

/**
 * The counters of number and minutes (spec „Licznik liczby i minut: dziś, w tygodniu i dla każdej osoby”): the requests
 * of the days' logs with their real minutes (T479, A6-03) – read again when the data change and every 30 s.
 */
function Counters() {
  const rd = useData((s) => s.rd)
  const stamp = useData((s) => s.stamp)
  const tick = useNow(30_000)
  const [c, setC] = useState<RequestCounters | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    window.rd
      .requestCounters()
      .then((x) => alive && (setC(x), setFailed(false)))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [stamp, tick])
  const sum = (x: { count: number; minutes: number }) => `${x.count} · ${durationLabel(x.minutes)}`
  const people = c ? Object.entries(c.byPerson).sort(([a], [b]) => (a === '?' ? 1 : b === '?' ? -1 : personName(rd, a).localeCompare(personName(rd, b), 'pl'))) : []
  return (
    <div className="flex flex-wrap gap-4 rounded border border-line bg-panel px-3 py-2 text-[12.5px]" data-testid="request-counters">
      {!c ? (
        <span className="text-muted">{failed ? 'Nie da się teraz policzyć próśb z logów dni.' : 'Liczę prośby…'}</span>
      ) : (
        <>
          <span>
            Dziś: <span className="num" data-testid="request-count-today">{sum(c.today)}</span>
          </span>
          <span>
            W tym tygodniu: <span className="num">{sum(c.week)}</span>
          </span>
          {people.map(([id, x]) => (
            <span key={id} className="text-muted">
              {id === '?' ? 'osoba: ?' : personName(rd, id)}: <span className="num">{sum(x)}</span>
            </span>
          ))}
          {!c.complete && <span className="text-[11.5px] text-rose">Nie wszystkie logi tygodnia dało się teraz odczytać – liczby mogą być niepełne.</span>}
          {failed && <span className="text-[11.5px] text-rose">Nie da się teraz odświeżyć liczników – widać stan sprzed chwili.</span>}
        </>
      )}
    </div>
  )
}

/** The people of the list: rename, archive (spec „Usunięcie to archiwizacja”), add. */
function People() {
  const rd = useData((s) => s.rd)
  const [name, setName] = useState('')
  const setPeople = (fn: (list: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) =>
    void saveRd((raw) => ({ ...raw, people: fn(Array.isArray(raw.people) ? (raw.people as Array<Record<string, unknown>>) : []) }))
  return (
    <div className="flex flex-col gap-1.5" data-testid="people">
      {rd.people.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <TextField value={p.name} onCommit={(n) => setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, name: n } : x)))} required max={60} shellClassName="w-[220px]" aria-label="Osoba" />
          <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, archived: !p.archived } : x)))}>
            {p.archived ? 'Przywróć' : 'Archiwizuj'}
          </button>
          {p.archived && <span className="text-[12px] text-muted">w archiwum – nie ma jej na liście wyboru</span>}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={60} placeholder="+ dodaj osobę" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void addPerson(name).then(() => setName(''))} data-testid="people-new" />
        <button type="button" className="btn" disabled={!name.trim()} onClick={() => void addPerson(name).then(() => setName(''))}>
          Dodaj
        </button>
      </div>
    </div>
  )
}
