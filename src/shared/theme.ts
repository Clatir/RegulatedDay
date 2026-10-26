/**
 * The look „Pokój lo-fi” (spec „Wygląd i nazwy”): the palette, the colours of the bar and the icon, and the brightness
 * slider. Brightness (50–100 %) darkens only the backgrounds, graphics and accent fills – never a text colour – so every
 * text keeps a contrast of at least 4.5:1 at every step (tests/unit/theme.test.ts checks each pair at each step).
 */

export const PALETTE = {
  bg: '#211B23',
  surface: '#2B232E',
  line: '#3B3140',
  active: '#3A3042',
  text: '#EEE3D6',
  muted: '#B8AAB0',
  lamp: '#F2B66D',
  rose: '#D49A97',
  sea: '#79AFAB'
} as const

/** What the bar and the icon are coloured by: the class of the block in the foreground, or the energy reserve. */
export type Tone = 'praca' | 'zycie' | 'wolne' | 'rezerwa' | 'brak'
/** The warnings 15 · 5 · 0 min (D225): warmer at 15 min, a step at 5 and at 0 min, no motion. */
export type WarnStep = 'none' | 'warm' | 'five' | 'zero'

/**
 * The tones of the E0 trial – working colours only: the final ones are asked before E4b (docs/postep.md). The life class
 * is lavender, not grey: a grey icon means the widget is hidden.
 */
export const TONES: Record<Tone, string> = {
  praca: PALETTE.lamp,
  zycie: '#B49FCC',
  wolne: PALETTE.sea,
  rezerwa: PALETTE.rose,
  brak: '#8C7F87'
}

/** The icon while a rule hides the widget: grey, without steps or a dot (spec „Widget”). */
export const HIDDEN_ICON = '#6E6870'

const WARM = '#F0A060'
const STEP = '#E07A6A'
const STEP_ZERO = '#D0555A'

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** `a` with `t` (0–1) of `b` mixed in, in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

/** `hex` darkened to `factor` (0–1) of its light. */
export const darken = (hex: string, factor: number): string => mix('#000000', hex, factor)

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** WCAG contrast ratio of two colours (1–21). */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}

/** The colour of the bar and the icon for a tone and a warning step. */
export function toneColor(tone: Tone, warn: WarnStep): string {
  const base = TONES[tone]
  if (warn === 'warm') return mix(base, WARM, 0.45)
  if (warn === 'five') return mix(base, STEP, 0.6)
  if (warn === 'zero') return mix(base, STEP_ZERO, 0.8)
  return base
}

/** The icon's colour: grey while hidden; darker but the same hue in the quiet modes (spec „Cisza”). */
export function iconColor(tone: Tone, warn: WarnStep, quiet: boolean, hidden: boolean): string {
  if (hidden) return HIDDEN_ICON
  const c = toneColor(tone, warn)
  return quiet ? darken(c, 0.72) : c
}

/** The bar's background: the tone laid thinly over the surface (dimmed further in the quiet modes). */
export function barBackground(tone: Tone, warn: WarnStep, quiet: boolean, brightness = 1): string {
  return darken(mix(PALETTE.surface, toneColor(tone, warn), quiet ? 0.08 : 0.15), brightness)
}

/** The fill of a block on the plan's axis: its category's colour laid thinly over the surface, dimmed with brightness. */
export function blockFill(color: string, brightness = 1): string {
  return darken(mix(PALETTE.surface, color, 0.15), Math.min(1, Math.max(0.5, brightness)))
}

/** The palette of category colours (rd.ts keeps the same list): the classes' own colours first. */
export const BLOCK_COLORS = ['#F2B66D', '#B49FCC', '#79AFAB', '#D49A97', '#C9B27A', '#8FB3D9', '#A3C49A', '#D6A2C4'] as const

/** The CSS variables of the windows for a brightness (50–100 %): backgrounds, lines and accent fills only. */
export function themeVars(brightness: number): Record<string, string> {
  const b = Math.min(1, Math.max(0.5, brightness))
  return {
    '--color-bg': darken(PALETTE.bg, b),
    '--color-panel': darken(PALETTE.surface, b),
    '--color-line': darken(PALETTE.line, b),
    '--color-raised': darken(PALETTE.active, b),
    '--color-hover': darken(mix(PALETTE.surface, PALETTE.active, 0.6), b),
    '--color-line-strong': darken(mix(PALETTE.line, PALETTE.muted, 0.12), b),
    '--color-lamp-fill': darken(PALETTE.lamp, b),
    '--color-sea-fill': darken(PALETTE.sea, b),
    '--color-rose-fill': darken(PALETTE.rose, b),
    '--color-lamp-soft': darken(mix(PALETTE.bg, PALETTE.lamp, 0.14), b),
    '--color-sea-soft': darken(mix(PALETTE.bg, PALETTE.sea, 0.14), b),
    '--color-rose-soft': darken(mix(PALETTE.bg, PALETTE.rose, 0.14), b)
  }
}

/**
 * Every pair of a text colour and a background the interface uses (the contrast test goes through each at each
 * brightness step). Text colours are never dimmed. Accent colours as text appear only on the window's backgrounds; on
 * the bar (tinted by its tone) the text is the text colour or the muted one.
 */
export function contrastPairs(brightness: number): Array<{ name: string; text: string; bg: string }> {
  const v = themeVars(brightness)
  const windowBgs: Array<[string, string]> = [
    ['tło', v['--color-bg']!],
    ['karta', v['--color-panel']!],
    ['aktywny blok', v['--color-raised']!],
    ['wskazany element', v['--color-hover']!]
  ]
  const barBgs: Array<[string, string]> = []
  for (const tone of Object.keys(TONES) as Tone[])
    for (const warn of ['none', 'warm', 'five', 'zero'] as WarnStep[])
      for (const quiet of [false, true]) barBgs.push([`pasek ${tone}/${warn}${quiet ? '/cisza' : ''}`, barBackground(tone, warn, quiet, brightness)])
  const plainTexts: Array<[string, string]> = [
    ['tekst', PALETTE.text],
    ['tekst przygaszony', PALETTE.muted]
  ]
  const accentTexts: Array<[string, string]> = [
    ['lampka', PALETTE.lamp],
    ['róż', PALETTE.rose],
    ['morski', PALETTE.sea]
  ]
  const out: Array<{ name: string; text: string; bg: string }> = []
  for (const [bn, bg] of windowBgs) for (const [tn, text] of [...plainTexts, ...accentTexts]) out.push({ name: `${tn} na ${bn}`, text, bg })
  for (const [bn, bg] of barBgs) for (const [tn, text] of plainTexts) out.push({ name: `${tn} na ${bn}`, text, bg })
  // Blocks on the plan's axis: the text and the muted text on every category colour's fill.
  for (const color of BLOCK_COLORS) for (const [tn, text] of plainTexts) out.push({ name: `${tn} na bloku ${color}`, text, bg: blockFill(color, brightness) })
  // A primary button: its accent as text on a soft fill of the accent (never dark text on a full fill – that fill dims
  // with brightness and the dark text would lose its contrast).
  for (const [name, accent] of accentTexts) {
    const soft = v[`--color-${name === 'lampka' ? 'lamp' : name === 'róż' ? 'rose' : 'sea'}-soft`]!
    out.push({ name: `${name} na miękkim tle ${name}`, text: accent, bg: soft })
    out.push({ name: `tekst na miękkim tle ${name}`, text: PALETTE.text, bg: soft })
  }
  return out
}
