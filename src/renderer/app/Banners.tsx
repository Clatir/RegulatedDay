/**
 * The quiet banners of the main window (spec „Instalacja”): a downloaded version waits („Zainstaluj teraz”, outside the
 * quiet modes), an installation that failed or did not finish („Spróbuj ponownie · Pobierz”), and „Co nowego” after an
 * update, shown at the first opening of the window (D229).
 */
import { useState } from 'react'
import type { MovedTo } from '@shared/api'
import { formatNumber, plDate } from '@shared/format'
import { unsyncedText } from '@shared/sync/syncLines'
import { useData } from '../store/data'
import { navigate, setMovedLater, toast, useUi } from '../store/ui'
import { updateAction, useUpdate } from '../store/update'
import { useWidget } from '../store/widget'

const stampOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/**
 * The data moved to another folder (D321): another computer restored a whole backup into a new folder and left the
 * marker „przeniesiono do …” here. „Przejdź” opens that folder on this computer; „Nie teraz” hides it until the app
 * starts again. Never a dot in the bar, never a move by itself (D72).
 */
function MovedBanner() {
  const moved = useData((s) => (s.view?.status === 'open' ? s.view.moved : null))
  const computers = useData((s) => s.view?.computers)
  const later = useUi((s) => s.movedLater)
  if (!moved || later === movedKey(moved)) return null
  const by = computers?.find((c) => c.id === moved.by)?.name ?? 'inny komputer'
  const go = async () => {
    const r = await window.rd.moveTo(moved.to).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    if (!r.ok) toast(`Folder ${moved.to} nie otworzył się: ${r.error ?? 'nieznany błąd'} – zostaję przy obecnym.`, 'error', 10_000)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 text-[12.5px]" data-testid="banner-moved">
      <span>
        Dane przeniesiono do {moved.to} ({by}, {stampOf(moved.at)}).
      </span>
      <button type="button" className="btn btn-accent" onClick={() => void go()} data-testid="banner-moved-go">
        Przejdź
      </button>
      <button type="button" className="btn" onClick={() => setMovedLater(movedKey(moved))} data-testid="banner-moved-later">
        Nie teraz
      </button>
    </div>
  )
}

/** One marker of a move: „Nie teraz” hides this one, a later move shows again. */
const movedKey = (m: MovedTo) => `${m.to}|${m.at}`

/**
 * The data folder not there now (spec „nic nie udaje sukcesu”, A3-07): what was changed meanwhile waits in the journal
 * and the queue – „N zmian zapisze się po powrocie folderu”.
 */
function AwayBanner() {
  const away = useData((s) => s.view?.away ?? false)
  const n = useData((s) => s.view?.unsynced ?? 0)
  if (!away) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-rose/40 bg-rose-soft px-4 py-2 text-[12.5px]" data-testid="banner-away">
      Folder danych jest teraz niedostępny{n ? ` – ${unsyncedText(n, true)}` : ''}.
    </div>
  )
}

/** No daily backup for 3 days (spec „po 3 dniach bez kopii także w oknie głównym”, A3-06): since when, and where to look. */
function BackupBanner() {
  const b = useData((s) => (s.view?.status === 'open' ? s.view.backup : null))
  if (!b?.stale) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-rose/40 bg-rose-soft px-4 py-2 text-[12.5px]" data-testid="banner-backup">
      <span>
        {b.lastOk ? `Brak kopii zapasowej od ${plDate(b.lastOk)}` : 'Brak kopii zapasowej'}
        {b.failed ? ` – ostatnia próba: ${b.failed}` : ''}.
      </span>
      <button type="button" className="btn" onClick={() => navigate('settings')}>
        Ustawienia
      </button>
    </div>
  )
}

export function Banners() {
  return (
    <div className="flex shrink-0 flex-col">
      <AwayBanner />
      <BackupBanner />
      <MovedBanner />
      <UpdateBanners />
    </div>
  )
}

function UpdateBanners() {
  const view = useUpdate((s) => s.view)
  const quiet = useWidget((s) => s.view?.quiet ?? false)
  const [notesOpen, setNotesOpen] = useState(true)
  if (!view) return null
  return (
    <>
      {view.banner && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rose/40 bg-rose-soft px-4 py-2 text-[12.5px]" data-testid="banner-update-failed">
          <span>
            Aktualizacja do {view.banner.version} {view.banner.kind === 'failed' ? 'nie udała się' : 'nie dokończyła się'}.
          </span>
          <button type="button" className="btn" onClick={() => void updateAction('retry')}>
            Spróbuj ponownie
          </button>
          <button type="button" className="btn" onClick={() => void updateAction('download')}>
            Pobierz
          </button>
        </div>
      )}
      {!view.banner && view.phase === 'ready' && view.available && !quiet && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 text-[12.5px]" data-testid="banner-update-ready">
          <span>Wersja {view.available.version} jest pobrana – zainstaluje się przy wyjściu.</span>
          <button type="button" className="btn btn-accent" onClick={() => void updateAction('installNow')} data-testid="banner-install-now">
            Zainstaluj teraz
          </button>
        </div>
      )}
      {view.phase === 'downloading' && view.progress && (
        <div className="border-b border-line bg-panel px-4 py-1.5 text-[12px] text-muted" data-testid="banner-update-downloading">
          Pobieram wersję {view.available?.version}: {formatNumber(Math.round((view.progress.received / Math.max(1, view.progress.total)) * 100))} %
        </div>
      )}
      {view.whatsNew && notesOpen && (
        <div className="flex flex-col gap-1.5 border-b border-line bg-panel px-4 py-2.5" data-testid="whats-new">
          <div className="flex items-center gap-2">
            <span className="font-medium text-lamp">Co nowego w wersji {view.whatsNew.version}</span>
            <span className="flex-1" />
            <button
              type="button"
              className="text-[12px] text-muted hover:text-fg"
              onClick={() => {
                setNotesOpen(false)
                void updateAction('dismissNotes')
              }}
            >
              Zamknij
            </button>
          </div>
          <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg">{view.whatsNew.notes || 'Poprawki i drobne zmiany.'}</div>
        </div>
      )}
    </>
  )
}
