/**
 * The two windows of a day's freeze, apart from the engine of `freeze.ts` (which pulls the whole day's engine in): the
 * window reads them too, for the note over the charts (D472).
 */

/** The window of corrections after the opening of the day after it. */
export const CORRECTION_H = 24
/** The latest a day waits for its freeze after its end. */
export const FREEZE_MAX_H = 72
