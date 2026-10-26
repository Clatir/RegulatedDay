/**
 * Historia (spec „Historia: każdy rekord ma historię zmian z przywracaniem”, „Historia zmian i Cofnij po usunięciu dla
 * każdego rekordu”): the records with earlier versions – settings, templates, the plan of lectures, days' plans,
 * requests, routines – also removed ones. A version shows what differs from the record now, in the interface's words
 * (never keys, ids, UTC or milliseconds), and „Przywróć” makes it the record again (an edit: the version replaced goes to
 * the history too).
 */
import { useEffect, useMemo, useState } from 'react'
import type { HistoryRecord, HistoryVersion } from '@shared/api'
import { diffRecords } from '@shared/data/merge'
import { plDate } from '@shared/format'
import { personName } from '@shared/model/rd'
import { EmptyState, cx } from '../../components/ui'
import { fieldText, keyOf, valueText } from '../../lib/recordText'
import { rawRecord, reloadData, useData } from '../../store/data'
import { toast } from '../../store/ui'

const KIND_NAMES: Record<string, string> = { settings: 'Ustawienia', template: 'Szablony', schedule: 'Plan wykładów', day: 'Plany dni', request: 'Prośby', routine: 'Rutyny' }
const REASONS: Record<string, string> = { edit: 'przed edycją', delete: 'przed usunięciem', merge: 'przed scaleniem', conflict: 'wersja z konfliktu', restore: 'przed przywróceniem' }

export function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[] | null>(null)
  const [selected, setSelected] = useState<HistoryRecord | null>(null)
  const stamp = useData((s) => s.stamp)
  useEffect(() => {
    void window.rd.historyList().then(setRecords).catch(() => setRecords([]))
  }, [stamp])
  if (!records) return <div className="p-6 text-muted">Czytam historię…</div>
  if (!records.length) return <EmptyState why="Historia jest pusta: wersje zapisują się, gdy zmieniasz albo usuwasz plan, szablon, prośbę, rutynę czy ustawienia." />
  const kinds = [...new Set(records.map((r) => r.kind))].filter((k) => KIND_NAMES[k])
  return (
    <div className="flex min-h-0 flex-1" data-testid="history">
      <div className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line p-3">
        {kinds.map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-[11.5px] text-muted">{KIND_NAMES[k]}</span>
            {records
              .filter((r) => r.kind === k)
              .map((r) => (
                <button
                  key={`${r.kind}/${r.id}`}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected?.id === r.id && selected.kind === r.kind ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover')}
                  data-testid="history-record"
                >
                  <RecordName r={r} />
                  <span className="text-[11.5px] text-muted">
                    {r.versions} {r.versions === 1 ? 'wersja' : r.versions < 5 ? 'wersje' : 'wersji'} · {new Date(r.last).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' })}
                    {r.exists ? '' : ' · usunięty'}
                  </span>
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">{selected ? <Versions key={`${selected.kind}/${selected.id}`} r={selected} /> : <EmptyState why="Wybierz rekord, żeby zobaczyć jego wcześniejsze wersje." />}</div>
    </div>
  )
}

function RecordName({ r }: { r: HistoryRecord }) {
  const { templates, requests, routines, lectures, rd } = useData()
  if (r.kind === 'settings') return <span>Ustawienia wspólne</span>
  if (r.kind === 'day') return <span>Plan dnia {plDate(r.id)}</span>
  if (r.kind === 'template') return <span>{templates.find((t) => t.id === r.id)?.name ?? 'Szablon'}</span>
  if (r.kind === 'routine') return <span>{routines.find((t) => t.id === r.id)?.name ?? 'Rutyna'}</span>
  if (r.kind === 'schedule') return <span>{lectures.find((t) => t.id === r.id)?.name || 'Wykład'}</span>
  if (r.kind === 'request') {
    const q = requests.find((t) => t.id === r.id)
    return <span>Prośba{q ? `: ${personName(rd, q.person)}${q.note ? ` – ${q.note}` : ''}` : ''}</span>
  }
  return <span>Rekord</span>
}

function Versions({ r }: { r: HistoryRecord }) {
  const view = useData((s) => s.view)
  const rd = useData((s) => s.rd)
  const [versions, setVersions] = useState<HistoryVersion[] | null>(null)
  useEffect(() => {
    void window.rd.historyVersions(r.kind, r.id).then(setVersions)
  }, [r.kind, r.id])
  const current = r.rel ? rawRecord(r.rel) : null
  const [currentDay, setCurrentDay] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    if (r.kind === 'day') void window.rd.dayFiles([r.id]).then((f) => setCurrentDay(f[r.id] ?? null))
  }, [r.kind, r.id])
  const now = r.kind === 'day' ? currentDay : current
  const names = useMemo(() => ({ rd }), [rd])
  const computer = (id: string) => view?.computers.find((c) => c.id === id)?.name ?? 'inny komputer'
  const restore = async (v: HistoryVersion) => {
    try {
      await window.rd.historyRestore(r.kind, r.id, v.file)
      await reloadData()
      toast('Wersja przywrócona.', 'success')
    } catch (e) {
      toast(`Nie przywrócono: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }
  if (!versions) return <div className="text-muted">Czytam wersje…</div>
  return (
    <div className="flex max-w-[820px] flex-col gap-3" data-testid="history-versions">
      {!r.exists && <p className="rounded border border-rose/40 bg-rose-soft px-3 py-2 text-[12.5px]">Ten rekord jest usunięty – przywrócenie wersji tworzy go od nowa.</p>}
      {versions.map((v) => {
        const changes = now && v.record && typeof v.record === 'object' ? diffRecords(now, v.record).slice(0, 30) : []
        return (
          <div key={v.file} className="flex flex-col gap-1.5 rounded border border-line bg-panel p-3 text-[12.5px]" data-testid="history-version">
            <div className="flex items-center gap-2">
              <span className="font-medium">{new Date(v.savedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="text-muted">
                {REASONS[v.reason] ?? 'wersja'} · {computer(v.savedBy)}
              </span>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={() => void restore(v)} data-testid="history-restore">
                Przywróć tę wersję
              </button>
            </div>
            {now ? (
              changes.length ? (
                <ul className="flex flex-col gap-0.5">
                  {changes.map((c) => (
                    <li key={c.path.join('.')} className="grid grid-cols-[minmax(0,1.2fr)_1fr_1fr] gap-2">
                      <span className="text-muted">{fieldText(r.rel ?? '', c.path, names)}</span>
                      <span>teraz: {valueText(keyOf(c.path), c.before, names)}</span>
                      <span>w tej wersji: {valueText(keyOf(c.path), c.after, names)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">Tak samo jak teraz.</span>
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
