/**
 * The morning's step „Cele na <miesiąc>” (D356, D360, D72): it can always be closed – „Pomiń” closes it in this window
 * whatever the save does, and tells that it comes back tomorrow when nothing was written; „Zapisz” that fails leaves it.
 */
import { describe, expect, it } from 'vitest'
import type { EditOutcome } from '@shared/api'
import type { GoalsPatch, MonthGoals } from '@shared/model/goals'
import { goalsStepOpen, saveGoalsStep, skipGoals, stepPatch, stepValues } from '@renderer/features/today/goalsStepLogic'

const G = (o: Partial<MonthGoals> = {}): MonthGoals => ({ study: null, regen: null, trading: null, skipped: false, ...o })
const applied = [{ status: 'applied' }] as unknown as EditOutcome[]
const refused = [{ status: 'refused' }] as unknown as EditOutcome[]

describe('kiedy krok „Cele” jest otwarty', () => {
  it('cele nieustawione i krok niepominięty – otwarty; zamknięty w tym oknie, zatwierdzony plan albo ustawione cele – nie', () => {
    expect(goalsStepOpen(undefined, '2026-11', null, false)).toBe(true)
    expect(goalsStepOpen(G(), '2026-11', '2026-10', false)).toBe(true)
    expect(goalsStepOpen(G(), '2026-11', '2026-11', false)).toBe(false)
    expect(goalsStepOpen(G(), '2026-11', null, true)).toBe(false)
    expect(goalsStepOpen(G({ regen: 10 }), '2026-11', null, false)).toBe(false)
    expect(goalsStepOpen(G({ skipped: true }), '2026-11', null, false)).toBe(false)
  })
})

describe('„Pomiń” (D72: nic nie blokuje)', () => {
  const io = (save: () => Promise<EditOutcome[] | null>) => {
    const log: string[] = []
    return { log, io: { save: async (_m: string, p: GoalsPatch) => (log.push(`save ${JSON.stringify(p)}`), save()), close: (m: string) => log.push(`close ${m}`), notify: (t: string) => log.push(`notify ${t}`) } }
  }

  it('zapisane: krok zamknięty w oknie, bez komunikatu', async () => {
    const t = io(async () => applied)
    expect(await skipGoals('2026-11', t.io)).toBe(true)
    expect(t.log).toEqual(['close 2026-11', 'save {"skipped":true}'])
  })

  it('zapis nieudany (null, odmowa, wyjątek): krok i tak zamknięty w oknie – i komunikat, że wróci jutro', async () => {
    for (const save of [async () => null, async () => refused, async (): Promise<EditOutcome[] | null> => Promise.reject(new Error('rd.json nieczytelny'))]) {
      const t = io(save)
      expect(await skipGoals('2026-11', t.io)).toBe(false)
      expect(t.log[0]).toBe('close 2026-11')
      expect(t.log.at(-1)).toContain('wróci jutro')
    }
  })
})

describe('„Zapisz”', () => {
  it('zapisuje tylko ustawione liczby; nieudany zapis daje false (krok zostaje)', async () => {
    const sent: GoalsPatch[] = []
    const values = { study: 30, regen: null, trading: 5 }
    expect(stepPatch(values)).toEqual({ study: 30, trading: 5 })
    expect(await saveGoalsStep('2026-11', values, { save: async (_m, p) => (sent.push(p), applied) })).toBe(true)
    expect(sent).toEqual([{ study: 30, trading: 5 }])
    expect(await saveGoalsStep('2026-11', values, { save: async () => null })).toBe(false)
    expect(await saveGoalsStep('2026-11', values, { save: async () => Promise.reject(new Error('x')) })).toBe(false)
  })
})

describe('wartości pól kroku', () => {
  const rd = { '2026-10': G({ study: 40, regen: 20 }), '2026-11': G({ study: 10 }) }

  it('poprzedni miesiąc jako start, zmiany z tego miesiąca nad nim', () => {
    expect(stepValues('2026-11', rd, null)).toEqual({ study: 40, regen: 20, trading: null })
    expect(stepValues('2026-11', rd, { month: '2026-11', values: { regen: null, trading: 7 } })).toEqual({ study: 40, regen: null, trading: 7 })
  })

  it('zmiany wpisane dla innego miesiąca nie przechodzą na ten (zmiana miesiąca zeruje wpisane)', () => {
    expect(stepValues('2026-12', { '2026-11': G({ study: 10 }) }, { month: '2026-11', values: { study: 99, trading: 3 } })).toEqual({ study: 10, regen: null, trading: null })
  })
})
