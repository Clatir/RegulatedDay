/**
 * „Komputery” in the settings (spec „Kilka komputerów”, „Zapomnij komputer”; A3-13, A8-07): every computer of the folder,
 * how fresh its data are here („dane sprzed 40 s”), and „Zapomnij” – freezing and leading stop waiting for it until it is
 * used again; „Przywróć” takes it back. The list comes from the main process every 15 s while the section is open.
 */
import { useEffect, useState } from 'react'
import type { ComputerRow, RawRecord } from '@shared/api'
import { Section } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { isSaved, saveRd } from '../../store/data'
import { undoToast } from '../../store/ui'

const SILENT_MS = 10 * 60_000
const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** What a row says of a computer now (`now` – this computer's clock, as `seenAt`). */
export function computerStatus(c: ComputerRow, now: number): string {
  if (c.self) return 'ten komputer'
  if (c.forgotten) return 'zapomniany – nic na niego nie czeka'
  if (c.state === 'closed') return 'zamknięty'
  if (c.seenAt == null) return 'jeszcze nie widziany'
  const age = Math.max(0, now - c.seenAt)
  if (age >= SILENT_MS) return `uśpiony – brak zmian od ${clockOf(c.seenAt)}`
  return age < 60_000 ? `dane sprzed ${Math.round(age / 1000)} s` : `dane sprzed ${Math.round(age / 60_000)} min`
}

/**
 * „dane z PC B sprzed 40 s” (spec „Gdy dane z innego komputera nie są jeszcze zsynchronizowane, widok pokazuje znacznik”):
 * every other computer awake – not this one, not forgotten, not closed, its file changed within 10 min – with the age of
 * what this computer has from it.
 */
export function freshnessText(rows: readonly ComputerRow[], now: number): string | null {
  const parts = rows
    .filter((c) => !c.self && !c.forgotten && c.state !== 'closed' && c.seenAt != null && now - c.seenAt < SILENT_MS)
    .map((c) => {
      const age = Math.max(0, now - c.seenAt!)
      return `dane z ${c.name} sprzed ${age < 60_000 ? `${Math.round(age / 1000)} s` : `${Math.round(age / 60_000)} min`}`
    })
  return parts.length ? parts.join(' · ') : null
}

/** The freshness of the other computers' data in the day's view (the list every 15 s). */
export function PeersFreshness() {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    const load = () =>
      void window.rd
        .computerList()
        .then((r) => setText(freshnessText(r, Date.now())))
        .catch(() => undefined)
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])
  return text ? (
    <span className="text-[12px] text-muted" data-testid="peers-freshness">
      {text}
    </span>
  ) : null
}

/** rd.json with a computer forgotten (by its „last presence” now) or taken back (null). */
export function withForgotten(raw: RawRecord, id: string, forget: { lastPresence: number | null; at: number } | null): RawRecord {
  const map = { ...((raw.forgotten as Record<string, unknown> | undefined) ?? {}) }
  if (forget) map[id] = forget
  else delete map[id]
  return { ...raw, forgotten: map }
}

export function ComputersSection() {
  const [rows, setRows] = useState<ComputerRow[]>([])
  const [now, setNow] = useState(Date.now())
  const [busy, run] = useBusy()
  const load = () =>
    void window.rd
      .computerList()
      .then((r) => {
        setRows(r)
        setNow(Date.now())
      })
      .catch(() => undefined)
  useEffect(() => {
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])
  const set = (c: ComputerRow, forget: boolean) =>
    run(async () => {
      const out = await saveRd((raw) => withForgotten(raw, c.id, forget ? { lastPresence: c.lastPresence, at: Date.now() } : null))
      if (!isSaved(out)) return
      if (forget) undoToast(`Zapomniany komputer: ${c.name}`, () => void saveRd((raw) => withForgotten(raw, c.id, null)).then(load))
      load()
    })
  return (
    <Section title="Komputery" data-testid="settings-computers">
      <p className="text-[12px] text-muted">„Zapomnij” – zamrażanie dni i prowadzenie przestają czekać na ten komputer, dopóki znów go nie użyjesz.</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px]" data-testid={`computer-${c.id}`}>
            <span className="min-w-[160px] text-fg">{c.name}</span>
            <span className="flex-1 text-muted">{computerStatus(c, now)}</span>
            {!c.self && (
              <button type="button" className="btn" disabled={busy} onClick={() => void set(c, !c.forgotten)} data-testid={`computer-${c.forgotten ? 'restore' : 'forget'}-${c.id}`}>
                {c.forgotten ? 'Przywróć' : 'Zapomnij'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
