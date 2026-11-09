/**
 * The preview of „Wczytaj PDF zjazdów” and what you corrected in it (spec „Szkice”: a form not saved survives going to
 * another screen) – until „Zapisz” or „Anuluj”.
 */
import { create } from 'zustand'
import type { ZjazdPreview } from '@shared/api'
import { draftsOf, type DraftDay } from './zjazdyDraft'

interface ZjazdyState {
  preview: ZjazdPreview | null
  drafts: DraftDay[]
}

export const useZjazdy = create<ZjazdyState>(() => ({ preview: null, drafts: [] }))

export function openZjazdy(preview: ZjazdPreview): void {
  useZjazdy.setState({ preview, drafts: draftsOf(preview) })
}

/** A correction, made on the drafts as they are now. */
export function editZjazdy(fn: (all: readonly DraftDay[]) => DraftDay[]): void {
  useZjazdy.setState((s) => ({ drafts: fn(s.drafts) }))
}

export function closeZjazdy(): void {
  useZjazdy.setState({ preview: null, drafts: [] })
}

/**
 * After „Zapisz”: only the days whose file could not be read just now stay in the preview, with your corrections, for
 * „Zapisz” again; the days saved (and any other day left out) go. None left – the preview closes.
 */
export function keepZjazdy(dates: readonly string[]): void {
  const keep = new Set(dates)
  useZjazdy.setState((s) => {
    if (!s.preview) return s
    const days = s.preview.days.filter((d) => keep.has(d.date))
    if (!days.length) return { preview: null, drafts: [] }
    return { preview: { ...s.preview, days }, drafts: s.drafts.filter((d) => keep.has(d.day.date)) }
  })
}
