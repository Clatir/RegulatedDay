/**
 * The timer as the main window shows it (spec „Widget”: the bar's content at the top of the main window): the same
 * engine functions the main process judges clicks with – the block in the foreground, the background ones, what „Dalej”
 * starts, the blocks waiting for „Zacznij”, the questions, what the app did by itself – from the day the window counted.
 */
import { activityOf } from '@shared/engine/activity'
import { questionsOf, type Question } from '@shared/engine/auto'
import { atOf } from '@shared/engine/grid'
import { timerNow, type TimerBlock, type TimerNow } from '@shared/engine/timer'
import type { AutoAction } from '@shared/engine/facts'
import { categoryName } from '@shared/model/rd'
import type { DayModel } from '../../store/day'
import { blockColor, blockName, type Names } from '../plan/blockView'

export interface TimerModel {
  date: string
  t: TimerNow
  questions: Question[]
  autos: AutoAction[]
  /** ms of an index of the day. */
  at: (idx: number) => number
}

/** `after`: the next day's events when the day is over (a block running through 04:00 – its input after 04:00 is there). */
export function timerModel(model: DayModel, computer: string | null, now: number, after: readonly DayModel['events'][number][] = []): TimerModel {
  const state = model.state
  const activity = activityOf([...model.events, ...after], state.grid.start, now, computer)
  return {
    date: model.date,
    t: timerNow(state),
    questions: questionsOf({ ctx: model.ctx, state, activity, now }),
    autos: state.facts.autos,
    at: (idx) => atOf(state.grid, idx)
  }
}

/** A block's name for the bar (a block begun outside the plan: its category). */
export function timerName(model: DayModel, id: string, names: Names): string {
  const p = model.ctx.plan.find((b) => b.id === id)
  if (p) return blockName(p, names)
  const f = model.state.facts.blocks.get(id)
  return categoryName(names.rd, f?.planned?.categoryId ?? 'inne')
}

export function timerColor(tb: TimerBlock | null, names: Names): string | null {
  return tb ? blockColor(tb.info.categoryId, names) : null
}

/** What an automatic action did, in words („Zajęcia zdalne zaczęte o 09:00 (według planu)”). */
export function autoText(a: AutoAction, name: string, clock: string): string {
  switch (a.rule) {
    case 'fixedStart':
      return a.k === 'block.pause' ? `${name} – pauza o ${clock} (blok stały według planu)` : `${name} zaczęty o ${clock} (blok stały według planu)`
    case 'plan':
      return `${name} skończony o ${clock} (według planu)`
    case 'fixedNoReaction':
      return `${name} skończony o ${clock} (10 min po końcu bez reakcji)`
    case 'lastInput':
      return `${name} skończona o ${clock} (ostatnie wejście, 30 min bez obecności)`
    case 'twoQuestions':
      return `${name} skończony o ${clock} (dwa pytania bez odpowiedzi)`
    case 'idle':
      return `${name} skończony o ${clock} (próg bezczynności)`
    case 'firstUse':
      return `${name} do ${clock} (pierwsze użycie komputera)`
    case 'limit':
      return `${name} do ${clock} (najdłuższy czas bez odpowiedzi)`
    case 'bedtime':
      return `${name} do ${clock} (pora snu bez użycia komputera)`
    case 'absence':
      return a.k === 'block.end' ? `${name} skończony o ${clock} (w chwili odejścia)` : a.k === 'block.pause' ? `${name}: nieobecność od ${clock} odliczona` : `${name}: powrót o ${clock}`
    case 'shutdown':
      return `${name} skończony o ${clock} (zamknięcie aplikacji)`
    case 'workEnd':
      return `${name} zaparkowany („Koniec pracy”)`
    case 'boundary':
      return `granica zatwierdzona sama o ${clock} (start pierwszego bloku pracy)`
    default:
      return `${name}: ${a.rule} o ${clock}`
  }
}
