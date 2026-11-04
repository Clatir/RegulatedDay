/**
 * The cost a first click shows (spec: „przedłużenie · −40 min puli”, „pora snu +40 min”, „przekroczenie”, D339): the
 * bar and the block's panel word it the same way.
 */
import type { ActionCost } from './engine/timer'

export const costText = (label: string, c: Pick<ActionCost, 'minutes' | 'overrun' | 'bedtime'>): string =>
  `${label}: ${c.overrun ? 'przekroczenie' : 'przedłużenie'} · ${c.bedtime ? `pora snu +${c.minutes} min` : `−${c.minutes} min puli`}`
