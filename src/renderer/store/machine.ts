// adapted from FI src/renderer/store/machine.ts @ de81f2b
/**
 * This computer's settings in every window: the brightness (the theme's variables), the animations; the scale is set by
 * the main process on every window at once (setZoomFactor).
 */
import { create } from 'zustand'
import { DEFAULT_MACHINE_PREFS, type MachinePrefs } from '@shared/machine'
import { themeVars } from '@shared/theme'

export const useMachine = create<{ prefs: MachinePrefs; loaded: boolean }>(() => ({ prefs: DEFAULT_MACHINE_PREFS, loaded: false }))

function applyLook(prefs: MachinePrefs): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(themeVars(prefs.brightness))) root.style.setProperty(k, v)
  root.dataset.motion = prefs.animations ? 'on' : 'off'
}

export async function loadMachinePrefs(): Promise<void> {
  const prefs = await window.rd.prefs()
  useMachine.setState({ prefs, loaded: true })
  applyLook(prefs)
  window.rd.onPrefs((p) => {
    useMachine.setState({ prefs: p })
    applyLook(p)
  })
}

export async function setMachinePrefs(patch: Partial<MachinePrefs>): Promise<void> {
  const prefs = await window.rd.setPrefs(patch)
  useMachine.setState({ prefs })
}
