/**
 * „Dane” in the settings (D321, spec „Eksport CSV”, „Kopie zapasowe”): the CSV export of a range of dates (three files,
 * D300 – by default the current month) into a folder you pick, and the folder's backups, newest first – each with
 * „Wybrane rekordy…” (taken back into this folder, each your edit: the history keeps what was) and „Cały folder do
 * nowego…” (into a new, empty folder this computer then works in; the old one gets a marker for the other computers).
 */
import { useEffect, useState } from 'react'
import type { BackupItem, BackupRecord, RestoreOutcome } from '@shared/api'
import { countLabel, formatNumber, plDate, plural } from '@shared/format'
import { personName, type RdFile } from '@shared/model/rd'
import { logicalDayOf } from '@shared/time/day'
import { DateField } from '../../components/fields'
import { Field, Section } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { toast } from '../../store/ui'

const KIND: Record<string, string> = { settings: 'Ustawienia', template: 'Szablon', schedule: 'Wykład', day: 'Plan dnia', request: 'Prośba', routine: 'Rutyna' }
/** The order of kinds in the list of a backup's records. */
const KIND_ORDER = ['settings', 'template', 'schedule', 'routine', 'request', 'day']

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)
const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${formatNumber(bytes / (1024 * 1024), 1)} MB` : `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} kB`)
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** What names a record of a backup in the interface (never an id): a request also by its person and the day it was added. */
export function backupRecordText(r: BackupRecord, rd: Pick<RdFile, 'people'>): string {
  if (r.kind === 'settings') return KIND.settings!
  if (r.kind === 'day' && r.date) return `${KIND.day} ${plDate(r.date)}`
  const base = `${KIND[r.kind] ?? 'Rekord'}${r.name ? `: ${r.name}` : ''}`
  if (r.kind !== 'request') return base
  const more = [r.person ? personName(rd, r.person) : null, r.at != null ? `dodana ${plDate(logicalDayOf(r.at))}` : null].filter((x): x is string => !!x)
  return more.length ? `${base} (${more.join(', ')})` : base
}

/** The records of a backup in the order of the list: by kind, days and requests newest first, the rest by name. */
export function backupRecordOrder(list: readonly BackupRecord[]): BackupRecord[] {
  const kindAt = (k: string) => (KIND_ORDER.includes(k) ? KIND_ORDER.indexOf(k) : KIND_ORDER.length)
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return kindAt(a.kind) - kindAt(b.kind) || (a.kind < b.kind ? -1 : 1)
    if (a.kind === 'day') return (b.date ?? '').localeCompare(a.date ?? '')
    if (a.kind === 'request' && a.at !== b.at) return (b.at ?? 0) - (a.at ?? 0)
    return (a.name ?? '').localeCompare(b.name ?? '', 'pl') || a.rel.localeCompare(b.rel)
  })
}

/** What „Przywróć zaznaczone” says: what came back, what already was so, and – never as a success – what did not. */
export function restoreText(out: readonly RestoreOutcome[]): { text: string; tone: 'success' | 'info' | 'error' } {
  const n = (...s: Array<RestoreOutcome['status']>) => out.filter((o) => s.includes(o.status)).length
  const applied = n('applied')
  const same = n('same')
  const asked = n('conflict', 'removedElsewhere')
  const behind = n('behindQuestion')
  const broken = n('broken')
  const waiting = n('waiting')
  const parts: string[] = []
  if (applied) parts.push(`Przywrócono z kopii: ${countLabel(applied, 'rekord', 'rekordy', 'rekordów')} – poprzednie wersje są w Historii.`)
  if (same) parts.push(`${countLabel(same, 'rekord był', 'rekordy były', 'rekordów było')} już ${plural(same, 'taki', 'takie', 'takich')} jak w kopii.`)
  if (asked) parts.push(`${countLabel(asked, 'rekord spotkał', 'rekordy spotkały', 'rekordów spotkało')} się ze zmianą – odpowiedz na pytanie u góry okna.`)
  if (behind) parts.push(`${countLabel(behind, 'rekord czeka', 'rekordy czekają', 'rekordów czeka')} na Twoją odpowiedź na wcześniejsze pytanie u góry okna.`)
  if (waiting) parts.push(`${countLabel(waiting, 'zmiana czeka', 'zmiany czekają', 'zmian czeka')} na zapis w folderze – ${plural(waiting, 'zapisze się sama', 'zapiszą się same', 'zapiszą się same')}.`)
  if (broken) parts.push(`Nie nadpisano ${countLabel(broken, 'uszkodzonego pliku', 'uszkodzonych plików', 'uszkodzonych plików')} – ${plural(broken, 'przywróć go', 'przywróć je', 'przywróć je')} z Historii.`)
  return { text: parts.join(' ') || 'Nic nie przywrócono.', tone: broken ? 'error' : asked || behind || waiting ? 'info' : 'success' }
}

export function DataSection() {
  const today = useData((s) => s.view?.today ?? '')
  const pending = useData((s) => s.view?.pendingMove ?? null)
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [backups, setBackups] = useState<BackupItem[] | null>(null)
  // The list of backups that cannot be read now is an error, never „no backups yet” (OneDrive, an antivirus).
  const [listError, setListError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const load = () => {
    setListError(null)
    void window.rd
      .backups()
      .then(setBackups)
      .catch((e: unknown) => setListError(messageOf(e)))
  }
  useEffect(load, [])
  const exportCsv = async () => {
    if (from > to) return void toast('Zakres dat: „od” musi być przed „do”.', 'error')
    try {
      const r = await window.rd.exportCsv(from, to)
      if (r) toast(`Zapisano ${countLabel(r.files, 'plik', 'pliki', 'plików')} CSV w ${r.dir}.`, 'success', 8000)
    } catch (e) {
      toast(`Eksport nie udał się: ${messageOf(e)}`, 'error', 8000)
    }
  }
  return (
    <Section title="Dane" data-testid="settings-data">
      <Field label="Eksport CSV" hint="Bloki, prośby i check-iny za zakres dat – trzy pliki (średnik, polskie daty).">
        <div className="flex flex-wrap items-center gap-2">
          <DateField today={today} past value={from} onCommit={setFrom} className="w-[120px]" aria-label="Od" data-testid="csv-from" />
          –
          <DateField today={today} past value={to} onCommit={setTo} className="w-[120px]" aria-label="Do" data-testid="csv-to" />
          <button type="button" className="btn" onClick={() => void exportCsv()} data-testid="csv-export">
            Eksportuj…
          </button>
        </div>
      </Field>
      <Field label="Kopie zapasowe" hint="Kopia dzienna powstaje po 12:00; zostaje 14 dziennych i 8 tygodniowych.">
        {pending && <PendingMove to={pending.to} error={pending.error} />}
        {listError ? (
          <span className="flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="backups-error">
            <span>Listy kopii nie da się teraz odczytać ({listError}).</span>
            <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={load}>
              Spróbuj ponownie
            </button>
          </span>
        ) : !backups ? (
          <span className="text-[12.5px] text-muted">Czytam listę kopii…</span>
        ) : backups.length ? (
          <ul className="flex flex-col gap-1.5" data-testid="backups">
            {backups.map((b) => (
              <li key={b.path} className="flex flex-col gap-1" data-testid={`backup-${b.name}`}>
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="min-w-[230px]">
                    {b.kind === 'daily' ? 'dzienna' : 'tygodniowa'} · {clockOf(b.mtimeMs)} · {sizeOf(b.bytes)}
                  </span>
                  <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => setOpen(open === b.path ? null : b.path)} data-testid={`backup-records-${b.name}`}>
                    Wybrane rekordy…
                  </button>
                  <WholeRestore backup={b} />
                </div>
                {open === b.path && <RecordsRestore backup={b} onDone={() => setOpen(null)} />}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[12.5px] text-muted">Kopii jeszcze nie ma – pierwsza powstanie dziś po 12:00.</span>
        )}
      </Field>
    </Section>
  )
}

/** „Wybrane rekordy…”: the backup's records with boxes; „Przywróć zaznaczone” takes them back into this folder. */
function RecordsRestore({ backup, onDone }: { backup: BackupItem; onDone: () => void }) {
  const rd = useData((s) => s.rd)
  const [records, setRecords] = useState<BackupRecord[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  // One restore at a time: a second click would make the same new records again.
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.rd
      .backupContents(backup.path)
      .then((list) => setRecords(backupRecordOrder(list)))
      .catch((e: unknown) => (toast(`Kopii nie da się odczytać: ${messageOf(e)}`, 'error'), setRecords([])))
  }, [backup.path])
  if (!records) return <span className="pl-2 text-[12px] text-muted">Czytam kopię…</span>
  const restore = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = restoreText(await window.rd.restoreRecords(backup.path, [...chosen]))
      toast(r.text, r.tone, 10_000)
      onDone()
    } catch (e) {
      toast(`Nie przywrócono: ${messageOf(e)}`, 'error', 8000)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1 rounded border border-line px-3 py-2" data-testid="backup-contents">
      {records.length ? (
        records.map((r) => (
          <label key={r.rel} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={chosen.has(r.rel)}
              onChange={(e) => {
                const next = new Set(chosen)
                if (e.currentTarget.checked) next.add(r.rel)
                else next.delete(r.rel)
                setChosen(next)
              }}
            />
            {backupRecordText(r, rd)}
          </label>
        ))
      ) : (
        <span className="text-[12px] text-muted">W tej kopii nie ma rekordów do przywrócenia.</span>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn btn-accent h-[26px]" disabled={!chosen.size || busy} onClick={() => void restore()} data-testid="backup-restore-chosen">
          Przywróć zaznaczone
        </button>
      </div>
    </div>
  )
}

const MOVED_TEXT = 'Kopia przywrócona – ten komputer pracuje teraz w nowym folderze. Inne komputery dostaną propozycję przejścia.'

/** „Cały folder do nowego…”: said first what it does, then a new empty folder picked in a window of Windows. */
function WholeRestore({ backup }: { backup: BackupItem }) {
  const [asking, setAsking] = useState(false)
  const restore = async () => {
    setAsking(false)
    const r = await window.rd.restoreWhole(backup.path).catch((e: unknown) => ({ ok: false, restored: false, to: null, error: messageOf(e) }))
    if (!r) return
    if (r.ok) toast(MOVED_TEXT, 'success', 10_000)
    // Restored, but the new folder did not open: this computer stayed in its folder – said beside the list (PendingMove).
    else if (!r.restored) toast(`Nie przywrócono: ${r.error ?? 'nieznany błąd'}`, 'error', 10_000)
  }
  return asking ? (
    <span className="flex flex-wrap items-center gap-2 text-[12px]">
      <span>Cała kopia trafi do nowego, pustego folderu, a ten komputer zacznie w nim pracować.</span>
      <button type="button" className="btn btn-accent h-[24px] px-2 text-[12px]" onClick={() => void restore()} data-testid={`backup-whole-go-${backup.name}`}>
        Wybierz folder i przywróć
      </button>
      <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => setAsking(false)}>
        Wróć
      </button>
    </span>
  ) : (
    <button type="button" className="btn h-[24px] px-2 text-[12px]" onClick={() => setAsking(true)} data-testid={`backup-whole-${backup.name}`}>
      Cały folder do nowego…
    </button>
  )
}

/** A whole backup restored into a folder that did not open: this computer stayed in its folder; „Spróbuj ponownie”. */
/** What „Spróbuj ponownie” of a move says – also when it fails again, never nothing (A7-20). */
export function retryMessage(r: { ok: boolean; error: string | null }): { text: string; kind: 'success' | 'error' } {
  return r.ok ? { text: MOVED_TEXT, kind: 'success' } : { text: `Folder dalej się nie otwiera: ${r.error ?? 'nieznany błąd'}`, kind: 'error' }
}

function PendingMove({ to, error }: { to: string; error: string }) {
  const [busy, run] = useBusy()
  const retry = () =>
    run(async () => {
      const r = await window.rd.moveTo(to).catch((e: unknown) => ({ ok: false, error: messageOf(e) }))
      const m = retryMessage(r)
      toast(m.text, m.kind, 10_000)
    })
  return (
    <span className="mb-1.5 flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="pending-move">
      <span>
        Kopia jest już w {to}, ale ten folder nie otworzył się ({error}) – pracuję dalej w obecnym folderze.
      </span>
      <button type="button" className="btn h-[24px] px-2 text-[12px]" disabled={busy} onClick={() => void retry()} data-testid="pending-move-retry">
        {busy ? 'Próbuję…' : 'Spróbuj ponownie'}
      </button>
    </span>
  )
}
