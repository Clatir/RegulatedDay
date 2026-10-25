/**
 * The quiet banners of the main window (spec „Instalacja”): a downloaded version waits („Zainstaluj teraz”, outside the
 * quiet modes), an installation that failed or did not finish („Spróbuj ponownie · Pobierz”), and „Co nowego” after an
 * update, shown at the first opening of the window (D229).
 */
import { useState } from 'react'
import { formatNumber } from '@shared/format'
import { updateAction, useUpdate } from '../store/update'
import { useWidget } from '../store/widget'

export function Banners() {
  const view = useUpdate((s) => s.view)
  const quiet = useWidget((s) => s.view?.quiet ?? false)
  const [notesOpen, setNotesOpen] = useState(true)
  if (!view) return null
  return (
    <div className="flex shrink-0 flex-col">
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
    </div>
  )
}
