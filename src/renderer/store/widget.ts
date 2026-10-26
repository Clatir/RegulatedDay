/** The widget's view as the main process sends it (the same in the main window, the panel and the desktop bar). */
import { create } from 'zustand'
import type { WidgetView } from '@shared/widget'

export const useWidget = create<{ view: WidgetView | null }>(() => ({ view: null }))

export async function loadWidget(): Promise<void> {
  window.rd.onWidget((view) => useWidget.setState({ view }))
  const view = await window.rd.widget()
  useWidget.setState((s) => (s.view ? s : { view }))
}
