/**
 * „Pokój” (D322, spec „Progresja”, „Statusy dni i passa”): the room drawn with what the notes of frozen days unlocked,
 * the streak and the notes (those still open to corrections „w toku”), the next item, the statuses of the last two
 * weeks and the shelf of cassettes – each closed week's season, its favourite regeneration and the sticker.
 */
import { plDate } from '@shared/format'
import { REGEN_CATEGORY } from '@shared/model/categories'
import { settingsOn } from '@shared/model/settings'
import { blockFill, SEASON_COLORS } from '@shared/theme'
import { weekday } from '@shared/time/zone'
import { EmptyState, Section } from '../../components/ui'
import { useData } from '../../store/data'
import { useGame } from '../../store/game'
import { useMachine } from '../../store/machine'
import { RoomArt } from './RoomArt'
import { gameLine, nextText, SEASON_NAMES, stepText, wayName, weekLabel } from './gameText'

const WEEKDAY_SHORT = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']
/** The statuses of this many last days. */
const STATUS_DAYS = 14

export function RoomPage() {
  const game = useGame((s) => s.game)
  const loaded = useGame((s) => s.loaded)
  const failed = useGame((s) => s.failed)
  const on = useData((s) => s.rd.general.modules.game)
  const rd = useData((s) => s.rd)
  const today = useData((s) => s.view?.today ?? '')
  const b = useMachine((s) => s.prefs.brightness)
  if (!on) return <EmptyState why="Gra jest wyłączona – włączysz ją w Ustawieniach → Moduły." data-testid="room-off" />
  if (!game) {
    // Not counted yet, or the count failed before any came: never „no game” for someone with months of it.
    if (failed) return <EmptyState why="Nie mogę teraz policzyć gry – spróbuję za chwilę sam." data-testid="room-failed" />
    if (!loaded) return <EmptyState why="Liczę grę…" data-testid="room-loading" />
    return <EmptyState why={rd.gameFrom ? `Gra liczy dni od ${plDate(rd.gameFrom)} – pokój ruszy po pierwszym zamkniętym dniu.` : 'Gra zacznie liczyć dni od jutra.'} data-testid="room-waiting" />
  }
  // The day of installation (and before): outside the game – said once at the top.
  const before = rd.gameFrom && today < rd.gameFrom ? `Gra liczy dni od ${plDate(rd.gameFrom)} – dzień instalacji jest poza grą.` : null
  const unlocked = new Set(game.room.unlocked.map((x) => x.id))
  const variants = settingsOn(rd.settings, today).categories[REGEN_CATEGORY]?.variants ?? []
  const next = nextText(game.room)
  const steps = game.steps.filter((s) => s.date <= today).slice(-STATUS_DAYS)
  const label = `Pokój: ${game.room.unlocked.map((x) => x.name.toLowerCase()).join(', ')}; ${game.cassettes.length} kaset na półce.`
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="room">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[14px] font-medium" data-testid="room-line">
          {gameLine(game)}
        </span>
        {game.notes.pending > game.notesToday && <span className="text-[12.5px] text-muted">dni przed dziś w toku: +{game.notes.pending - game.notesToday}</span>}
      </div>
      {before && (
        <p className="text-[12.5px] text-muted" data-testid="room-before">
          {before}
        </p>
      )}
      <RoomArt unlocked={unlocked} cassettes={game.cassettes} label={label} />
      <p className="text-[12.5px] text-muted" data-testid="room-next">
        {next ? `${next}.` : 'Pokój jest pełny.'} Nuty dni jeszcze otwartych na poprawki niczego nie odblokowują – po zamrożeniu nic ich nie odbiera.
      </p>
      <Section title="Ostatnie dni" data-testid="room-days">
        {steps.length ? (
          <div className="grid grid-cols-7 gap-1.5 text-[12px]">
            {steps.map((s) => (
              <div key={s.date} className="flex flex-col rounded border border-line px-2 py-1" data-testid={`room-day-${s.date}`}>
                <span className="text-muted">
                  {WEEKDAY_SHORT[weekday(s.date) - 1]} {plDate(s.date).slice(0, 5)}
                </span>
                <span>{stepText(s)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[12.5px] text-muted">Jeszcze żaden dzień gry.</span>
        )}
      </Section>
      <Section title="Kasety" data-testid="room-cassettes">
        {game.cassettes.length ? (
          <div className="flex flex-wrap gap-2">
            {[...game.cassettes].reverse().map((k) => (
              <div
                key={k.week}
                className="flex min-w-[180px] items-center gap-2 rounded border-l-4 px-2.5 py-1.5 text-[12.5px]"
                style={{ background: blockFill(SEASON_COLORS[k.season], b), borderLeftColor: SEASON_COLORS[k.season] }}
                data-testid={`cassette-${k.week}`}
              >
                <div className="flex flex-1 flex-col">
                  <span>{weekLabel(k.week)}</span>
                  <span className="text-muted">
                    {SEASON_NAMES[k.season]}
                    {wayName(k.favourite, variants) ? ` · ${wayName(k.favourite, variants)}` : ''}
                  </span>
                </div>
                {k.sticker && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-lamp-soft text-lamp" aria-label="naklejka" data-testid="cassette-sticker">
                    ♪
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[12.5px] text-muted">Pierwsza kaseta stanie na półce, gdy zamrozi się niedziela pierwszego tygodnia gry.</span>
        )}
      </Section>
    </div>
  )
}
