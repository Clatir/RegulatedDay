/**
 * The room as a lo-fi illustration (D322): a window with rain, a desk with a lamp, the plant growing in four stages,
 * records, posters, string lights and a shelf with the week's cassettes – each item drawn once unlocked. The rain and
 * the lamp's light move only with „Animacje” on (the global rule of the window stops every animation otherwise).
 */
import type { Cassette } from '@shared/engine/progress'
import { artFill, BLOCK_COLORS, PALETTE, SEASON_COLORS } from '@shared/theme'
import { useMachine } from '../../store/machine'

const W = 640
const H = 360

/** The rain's lines: fixed places, so the picture is the same at every render. */
const RAIN = Array.from({ length: 18 }, (_, i) => ({ x: 48 + ((i * 37) % 150), y: 40 + ((i * 53) % 120), d: (i % 6) * 0.25 }))

export function RoomArt({ unlocked, cassettes, label }: { unlocked: ReadonlySet<string>; cassettes: readonly Cassette[]; label: string }) {
  const b = useMachine((s) => s.prefs.brightness)
  const c = (hex: string) => artFill(hex, b)
  const has = (id: string) => unlocked.has(id)
  const plant = ['roslina-4', 'roslina-3', 'roslina-2', 'roslina-1'].find(has)
  const records = ['plyta-1', 'plyta-2', 'plyta-3', 'plyta-4'].filter(has).length
  const posters = ['plakat-1', 'plakat-2', 'plakat-3'].filter(has)
  const shelf = cassettes.slice(-14)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[720px] rounded-md border border-line" role="img" aria-label={label} data-testid="room-art">
      <defs>
        <radialGradient id="rd-lamp-light" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor={PALETTE.lamp} stopOpacity="0.55" />
          <stop offset="1" stopColor={PALETTE.lamp} stopOpacity="0" />
        </radialGradient>
        <clipPath id="rd-window">
          <rect x="40" y="36" width="170" height="140" rx="4" />
        </clipPath>
      </defs>
      {/* The wall and the floor. */}
      <rect width={W} height={H} fill="var(--color-panel)" />
      <rect y="292" width={W} height="68" fill="var(--color-bg)" />
      <line x1="0" y1="292" x2={W} y2="292" stroke="var(--color-line-strong)" />
      {/* The window with the rain. */}
      <rect x="40" y="36" width="170" height="140" rx="4" fill="var(--color-bg)" />
      <g clipPath="url(#rd-window)">
        {RAIN.map((r, i) => (
          <line key={i} className="rd-rain" style={{ animationDelay: `${r.d}s` }} x1={r.x} y1={r.y} x2={r.x - 4} y2={r.y + 14} stroke={c(PALETTE.sea)} strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </g>
      <rect x="40" y="36" width="170" height="140" rx="4" fill="none" stroke="var(--color-line-strong)" strokeWidth="5" />
      <line x1="125" y1="36" x2="125" y2="176" stroke="var(--color-line-strong)" strokeWidth="4" />
      <line x1="40" y1="106" x2="210" y2="106" stroke="var(--color-line-strong)" strokeWidth="4" />
      {/* String lights along the top of the wall. */}
      {has('lampki') && (
        <g data-testid="room-lampki">
          <path d="M 230 22 Q 330 46 430 22 Q 520 46 610 22" fill="none" stroke="var(--color-line-strong)" strokeWidth="1.5" />
          {[250, 290, 330, 370, 410, 450, 490, 530, 570, 600].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 34 : 30} r="4" fill={c(BLOCK_COLORS[i % 4]!)} />
          ))}
        </g>
      )}
      {/* Posters. */}
      {posters.map((id, i) => (
        <g key={id} data-testid={`room-${id}`}>
          <rect x={250 + i * 70} y={56} width="54" height="72" rx="2" fill={c(BLOCK_COLORS[[4, 1, 6][i]!]!)} />
          <circle cx={277 + i * 70} cy={84} r="12" fill="var(--color-panel)" opacity="0.6" />
          <rect x={258 + i * 70} y={108} width="38" height="5" rx="2" fill="var(--color-panel)" opacity="0.6" />
        </g>
      ))}
      {/* Records on the wall. */}
      {Array.from({ length: records }, (_, i) => (
        <g key={i} data-testid={`room-plyta-${i + 1}`}>
          <circle cx={470 + (i % 2) * 56} cy={74 + Math.floor(i / 2) * 56} r="22" fill="var(--color-bg)" stroke="var(--color-line-strong)" />
          <circle cx={470 + (i % 2) * 56} cy={74 + Math.floor(i / 2) * 56} r="7" fill={c(BLOCK_COLORS[[0, 3, 5, 2][i]!]!)} />
        </g>
      ))}
      {/* The shelf with the cassettes of closed weeks. */}
      <rect x="440" y="196" width="170" height="6" fill="var(--color-line-strong)" />
      {shelf.map((k, i) => (
        <g key={k.week} data-testid="room-cassette">
          <rect x={446 + i * 11.5} y={170} width="9" height="26" rx="1.5" fill={c(SEASON_COLORS[k.season])} />
          {k.sticker && <circle cx={450.5 + i * 11.5} cy={178} r="2.5" fill="var(--color-lamp-fill)" />}
        </g>
      ))}
      {/* The desk and the lamp. */}
      <rect x="180" y="226" width="250" height="12" rx="2" fill="var(--color-line-strong)" />
      <rect x="196" y="238" width="10" height="54" fill="var(--color-line-strong)" />
      <rect x="404" y="238" width="10" height="54" fill="var(--color-line-strong)" />
      <circle className="rd-lamp-glow" cx="250" cy="200" r="80" fill="url(#rd-lamp-light)" />
      <rect x="236" y="220" width="28" height="6" rx="2" fill="var(--color-line-strong)" />
      <line x1="250" y1="220" x2="262" y2="186" stroke="var(--color-line-strong)" strokeWidth="4" strokeLinecap="round" />
      <path d="M 244 186 L 280 186 L 270 168 L 254 168 Z" fill="var(--color-lamp-fill)" />
      {/* A crate of records on the floor. */}
      {has('plyta-5') && (
        <g data-testid="room-plyta-5">
          <rect x="470" y="256" width="90" height="40" rx="3" fill="var(--color-line-strong)" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={478 + i * 13} y={240} width="9" height="20" fill={c(BLOCK_COLORS[i % 8]!)} />
          ))}
        </g>
      )}
      {/* The plant on the desk: from a seedling to blooming. */}
      {plant && (
        <g data-testid={`room-${plant}`}>
          <path d="M 352 226 L 384 226 L 380 204 L 356 204 Z" fill={c(PALETTE.rose)} />
          <Plant stage={Number(plant.slice(-1))} leaf={c('#A3C49A')} bloom={c(PALETTE.rose)} />
        </g>
      )}
    </svg>
  )
}

/** The plant's stage 1–4 above its pot (top of the pot at y 204, its middle at x 368). */
function Plant({ stage, leaf, bloom }: { stage: number; leaf: string; bloom: string }) {
  const height = [0, 16, 32, 52, 64][stage]!
  const top = 204 - height
  const leaves = Array.from({ length: stage * 2 }, (_, i) => ({ y: 200 - (i + 1) * (height / (stage * 2 + 1)), left: i % 2 === 0 }))
  return (
    <g>
      <line x1="368" y1="204" x2="368" y2={top} stroke={leaf} strokeWidth="3" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.left ? 360 : 376} cy={l.y} rx="9" ry="4" transform={`rotate(${l.left ? -30 : 30} ${l.left ? 360 : 376} ${l.y})`} fill={leaf} />
      ))}
      {stage >= 4 && [-10, 0, 10].map((dx) => <circle key={dx} cx={368 + dx} cy={top + (dx === 0 ? -4 : 4)} r="5" fill={bloom} />)}
    </g>
  )
}
