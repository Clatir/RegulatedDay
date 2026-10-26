/**
 * The screens as the app lays its windows out on them. RD_WORK_AREA=<width>x<height> (tests) puts the primary screen's
 * work area to that size – the CI runner's screen is 1024 px wide (ICTTJ), and the laptop 14" at 150 % has 1280×672.
 */
import { screen } from 'electron'
import type { DisplayInfo, Rect } from '@shared/bounds'

function override(): { width: number; height: number } | null {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(process.env.RD_WORK_AREA ?? '')
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

const info = (d: Electron.Display, primaryId: number, size: { width: number; height: number } | null): DisplayInfo => {
  const fake = size && d.id === primaryId
  const workArea: Rect = fake ? { x: d.workArea.x, y: d.workArea.y, width: size.width, height: size.height } : { ...d.workArea }
  return { id: d.id, label: d.label ?? '', bounds: fake ? { ...workArea, height: workArea.height + 48 } : { ...d.bounds }, workArea, scaleFactor: d.scaleFactor }
}

export function displays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  const size = override()
  return screen.getAllDisplays().map((d) => info(d, primary, size))
}

export function primaryDisplay(): DisplayInfo {
  const all = displays()
  const id = screen.getPrimaryDisplay().id
  return all.find((d) => d.id === id) ?? all[0]!
}
