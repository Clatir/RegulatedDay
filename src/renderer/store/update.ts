/** The updates' view in the windows (the settings, the quiet banner, „Co nowego”). */
import { create } from 'zustand'
import type { UpdateView } from '@shared/updateView'

export const useUpdate = create<{ view: UpdateView | null }>(() => ({ view: null }))

export async function loadUpdate(): Promise<void> {
  window.rd.onUpdate((view) => view && useUpdate.setState({ view }))
  const view = await window.rd.update()
  useUpdate.setState((s) => (s.view ? s : { view }))
}

export async function updateAction(a: Parameters<typeof window.rd.updateAction>[0]): Promise<void> {
  const view = await window.rd.updateAction(a)
  useUpdate.setState({ view })
}

const PHASE: Record<UpdateView['phase'], string> = {
  off: 'wyłączone',
  idle: 'czekam na pierwsze sprawdzenie',
  checking: 'sprawdzam…',
  'up-to-date': 'masz najnowszą wersję',
  available: 'jest nowsza wersja',
  downloading: 'pobieram…',
  ready: 'nowa wersja pobrana',
  installing: 'instaluję…',
  error: 'nie udało się'
}

export const phaseText = (v: UpdateView): string => PHASE[v.phase]
