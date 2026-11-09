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
