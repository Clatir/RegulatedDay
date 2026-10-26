/**
 * The icon by the clock (D289, spec „Widget”): a full disc in the bar's colour, a dot in the top right corner (with a
 * dark ring) when something stands without your click, a drop in the bottom right one when the water icon waits. Drawn
 * as RGBA pixels for every size of the .ico (16, 20, 24, 28, 32 px – scales 100–200 %), anti-aliased by 4×4 samples.
 */
import { PALETTE, hexToRgb } from './theme'

export const TRAY_SIZES = [16, 20, 24, 28, 32] as const

export interface TrayIconState {
  color: string
  dot: boolean
  drop: boolean
}

const DOT_FILL = PALETTE.text
const RING = PALETTE.bg
const DROP_FILL = '#9BD3F2'

type Inside = (x: number, y: number) => boolean

const disc =
  (cx: number, cy: number, r: number): Inside =>
  (x, y) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r

/** A drop: a disc with a point upwards (tangent lines from the tip). */
function dropShape(cx: number, cy: number, r: number, tipY: number): Inside {
  const d = cy - tipY
  const sin = r / d
  const cos = Math.sqrt(Math.max(0, 1 - sin * sin))
  // Points where the tangents touch the circle: below the tip, at the height cy - r*sin.
  const touchY = cy - r * sin
  const halfAt = (y: number) => ((y - tipY) / (touchY - tipY)) * r * cos
  return (x, y) => {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true
    if (y < tipY || y > touchY) return false
    return Math.abs(x - cx) <= halfAt(y)
  }
}

/** The pixels (RGBA, row by row) of the icon at `size` px. */
export function renderTrayIcon(size: number, state: TrayIconState): Uint8Array {
  const s = size
  const layers: Array<{ inside: Inside; rgb: { r: number; g: number; b: number } }> = []
  const main = hexToRgb(state.color)
  layers.push({ inside: disc(s * 0.46, s * 0.54, s * 0.42), rgb: main })
  if (state.dot) {
    const cx = s * 0.79
    const cy = s * 0.21
    layers.push({ inside: disc(cx, cy, s * 0.21), rgb: hexToRgb(RING) })
    layers.push({ inside: disc(cx, cy, s * 0.14), rgb: hexToRgb(DOT_FILL) })
  }
  if (state.drop) {
    const cx = s * 0.8
    const cy = s * 0.8
    layers.push({ inside: dropShape(cx, cy, s * 0.19, cy - s * 0.42), rgb: hexToRgb(RING) })
    layers.push({ inside: dropShape(cx, cy, s * 0.12, cy - s * 0.31), rgb: hexToRgb(DROP_FILL) })
  }
  const out = new Uint8Array(s * s * 4)
  const N = 4
  for (let py = 0; py < s; py++)
    for (let px = 0; px < s; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++) {
          const x = px + (sx + 0.5) / N
          const y = py + (sy + 0.5) / N
          // The topmost layer that covers the sample.
          for (let i = layers.length - 1; i >= 0; i--) {
            const l = layers[i]!
            if (!l.inside(x, y)) continue
            r += l.rgb.r
            g += l.rgb.g
            b += l.rgb.b
            a++
            break
          }
        }
      const o = (py * s + px) * 4
      if (a) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round((a / (N * N)) * 255)
      }
    }
  return out
}

/** The name of an icon's state (the .ico files are cached by it). */
export const trayIconKey = (s: TrayIconState): string => `${s.color.replace('#', '').toLowerCase()}-${s.dot ? 'd' : ''}${s.drop ? 'w' : ''}`
