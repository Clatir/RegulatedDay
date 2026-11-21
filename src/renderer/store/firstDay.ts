/** Whether the list of the first day (UX15, E8) is shown: set by the wizard of the first computer, closed by „Zamknij”; in memory only. */
import { create } from 'zustand'

export const useFirstDay = create<{ show: boolean }>(() => ({ show: false }))
