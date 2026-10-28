/**
 * Prośby (spec „Prośba”, „Prośby”): the queue – a person from the list (with „+ dodaj osobę”), an estimate of time and a
 * note; chosen in the morning plan they go into a block of the day. Filters by state and person, counters of number and
 * minutes (today, this week, per person – from the days' logs, T479). Ctrl+N makes a new request; removing one has
 * „Cofnij” for 10 s.
 */
import { useEffect, useState } from 'react'
import type { RequestCounters } from '@shared/api'
import { paths } from '@shared/data/paths'
import { durationLabel, plDate } from '@shared/format'
import { newId } from '@shared/model/ids'
import { personName } from '@shared/model/rd'
import { DEFAULT_ESTIMATE_MIN, ESTIMATE_RANGE, newRequest, type RequestRecord, type RequestState } from '@shared/model/requests'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { Choice, DurationField, TextField } from '../../components/fields'
import { EmptyState, Section } from '../../components/ui'
import { useNow } from '../../lib/clock'
import { addPerson, saveRd, saveRecord, tryRemoveRecord, updateRecord, useData } from '../../store/data'
import { modalOpen } from '../../lib/escape'
import { undoToast } from '../../store/ui'

const STATE_NAMES: Record<RequestState, string> = { queued: 'w kolejce', planned: 'w planie', done: 'zrobione', dropped: 'porzucone' }

export function RequestsPage() {
  const { requests, rd } = useData()
  const [filters] = useFilters('requests')
  const create = async () => {
    const id = newId()
    await saveRecord(paths.record('request', id), null, newRequest(id, Date.now(), { person: null, estimateMin: DEFAULT_ESTIMATE_MIN, note: '' }))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyN' && !modalOpen()) {
        e.preventDefault()
        void create()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!rd.general.modules.requests) return <EmptyState why="Moduł próśb jest wyłączony – włączysz go w ustawieniach." />

  const stateFilters = filters.filter((f) => f.startsWith('state:')).map((f) => f.slice(6))
  const personFilters = filters.filter((f) => f.startsWith('person:')).map((f) => f.slice(7))
  const shown = requests
    .filter((r) => !stateFilters.length || stateFilters.includes(r.state))
    .filter((r) => !personFilters.length || personFilters.includes(r.person ?? '?'))
    .sort((a, b) => order(a) - order(b) || b.createdAt - a.createdAt)
  const options = [
    ...(['queued', 'planned', 'done', 'dropped'] as RequestState[]).map((s) => ({ id: `state:${s}`, label: STATE_NAMES[s], count: requests.filter((r) => r.state === s).length })),
    ...rd.people.filter((p) => !p.archived).map((p) => ({ id: `person:${p.id}`, label: p.name, count: requests.filter((r) => r.person === p.id).length })),
    { id: 'person:?', label: 'osoba: ?', count: requests.filter((r) => !r.person).length }
  ].filter((o) => o.count > 0 || filters.includes(o.id))
  return (
    <div className="flex flex-col gap-4 p-4" data-testid="requests">
      <Counters />
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-accent" onClick={() => void create()} data-testid="request-new">
          + Prośba
        </button>
        <span className="text-[12px] text-muted">Ctrl N</span>
      </div>
      <FilterBar listKey="requests" options={options} shown={shown.length} total={requests.length} />
      {shown.length === 0 ? (
        <EmptyState why={requests.length ? 'Żadna prośba nie pasuje do filtrów.' : 'Kolejka jest pusta. Prośbę „na później” zapiszesz tutaj, a rano wybierzesz ją w planie.'} action={{ label: '+ Prośba', run: () => void create() }} />
      ) : (
        <div className="flex flex-col gap-1.5" data-testid="request-list">
          {shown.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </div>
      )}
      <Section title="Osoby">
        <People />
      </Section>
    </div>
  )
}

const order = (r: RequestRecord) => ({ queued: 0, planned: 1, done: 2, dropped: 3 })[r.state]

function Row({ r }: { r: RequestRecord }) {
  const rel = paths.record('request', r.id)
  const set = (patch: Partial<RequestRecord>) => void updateRecord(rel, (raw) => ({ ...raw, ...patch }))
  const remove = async () => {
    const { saved, before } = await tryRemoveRecord(rel)
    if (saved) undoToast('Prośba usunięta', () => void saveRecord(rel, null, before))
  }
  return (
    <div className="grid items-center gap-2 rounded border border-line bg-panel px-3 py-1.5" style={{ gridTemplateColumns: '180px 110px minmax(0,1fr) 120px auto' }} data-testid="request-row">
      <PersonChoice value={r.person} onChange={(person) => set({ person })} />
      <DurationField value={r.estimateMin} onCommit={(estimateMin) => set({ estimateMin: Math.min(ESTIMATE_RANGE[1], estimateMin) })} placeholder="szacunek" aria-label="Szacunek" data-testid="request-estimate" />
      <TextField value={r.note} onCommit={(note) => set({ note })} max={500} placeholder="czego dotyczy" aria-label="Notatka" data-testid="request-note" />
      <span className="text-[12px] text-muted">
        {STATE_NAMES[r.state]}
        {r.day ? ` ${plDate(r.day)}` : ''}
      </span>
      <span className="flex gap-1.5">
        {r.state !== 'done' && (
          <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => set({ state: 'done' })}>
            Zrobiona
          </button>
        )}
        {r.state !== 'queued' && (
          <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => set({ state: 'queued', day: null, block: null })}>
            Do kolejki
          </button>
        )}
        <button type="button" className="h-[24px] px-1.5 text-[12px] text-muted hover:text-rose" onClick={() => void remove()} data-testid="request-remove">
          Usuń
        </button>
      </span>
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
          <TextField value={p.name} onCommit={(n) => setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, name: n } : x)))} required max={60} className="w-[220px]" aria-label="Osoba" />
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
