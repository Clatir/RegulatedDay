/**
 * Steps and „Sprawy” in the window (SNT5) – the cases of the third review without a DOM: a refusal said before the send
 * names the list it is about (a task's – „w zadaniu”); one helper reads a change's answer (`caseAnswer`: sent and not known
 * – a question), and the field of a new task gives its title back only when nothing was sent – a second Enter never adds the
 * task twice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, RdApi } from '@shared/api'
import { addStepOp, STEPS_FULL, STEPS_FULL_TASK, STEPS_MAX, stepsFrom } from '@shared/model/steps'
import { refusedOp } from '@renderer/features/steps/stepsUi'
import { submitTitle } from '@renderer/features/cases/casesUi'
import { caseAnswer, createTask } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { oneAtATime } from '@renderer/lib/busy'

const full = stepsFrom(Array.from({ length: STEPS_MAX }, (_, i) => ({ id: `k${i}`, title: `krok ${i}`, order: i })))

describe('odmowa przed wysłaniem mówi, czyja lista (przegląd 3, T792)', () => {
  it('pełna lista zadania – „w zadaniu”, bloku (domyślnie) – „w bloku”', () => {
    expect(refusedOp(full, addStepOp('nowy'), 'task')).toBe(STEPS_FULL_TASK)
    expect(refusedOp(full, addStepOp('nowy'), 'block')).toBe(STEPS_FULL)
    expect(refusedOp(full, addStepOp('nowy'))).toBe(STEPS_FULL)
  })
})

describe('odpowiedź zmiany jednym pomocnikiem (przegląd 3)', () => {
  it('`caseAnswer`: zapisane – true; odmowa – false; wysłane, wynik nieznany – „asked”; niewysłane – false', () => {
    const base = { error: null, outcomes: null, id: null, undo: [] }
    expect(caseAnswer({ ...base, saved: true, outcomes: [] })).toBe(true)
    expect(caseAnswer({ ...base, saved: false, error: 'Zadanie potrzebuje tytułu.' })).toBe(false)
    expect(caseAnswer({ ...base, saved: false, sent: { afterSend: true } })).toBe('asked')
    expect(caseAnswer({ ...base, saved: false, sent: { afterSend: false } })).toBe(false)
    expect(caseAnswer({ ...base, saved: false, outcomes: [{ status: 'conflict' }] })).toBe('asked')
  })

  it('nowe zadanie: wynik nieznany po wysłaniu – tytuł nie wraca do pola (drugi Enter nie dubluje), pole się nie zamyka', async () => {
    const fields: string[] = []
    const o = { set: (t: string) => fields.push(t), save: async () => 'asked' as const, done: vi.fn() }
    await submitTitle(oneAtATime(), 'Napisać raport', o)
    expect(fields).toEqual([''])
    expect(o.done).not.toHaveBeenCalled()
  })
})

describe('„wysłane” dopiero po odpowiedzi kolejki (przegląd 4, `SendState`)', () => {
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
    useUi.setState({ toasts: [] })
  })
  const stub = (edit: RdApi['edit']) => {
    const view = { status: 'open', rd: null, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} } as unknown as DataView
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd: { edit, dataView: async () => view } }
    useData.setState({ view, requests: [] })
  }
  it('proces główny odrzuca zmianę przed kolejką – `false`, tytuł wraca do pola', async () => {
    stub(async () => Promise.reject(new Error('ten rekord już jest w folderze')))
    const fields: string[] = []
    await submitTitle(oneAtATime(), 'Napisać raport', { set: (t) => fields.push(t), save: async (t) => caseAnswer(await createTask({ title: t })), done: vi.fn() })
    expect(fields).toEqual(['', 'Napisać raport'])
  })
  it('kolejka przyjęła, potem błąd (odpowiedź nie do odczytania) – `asked`, tytuł nie wraca', async () => {
    // An answer of the queue that breaks what follows it (the notice): a failure after the queue took the edit.
    stub(async () => undefined as never)
    const r = await createTask({ title: 'Napisać raport' })
    expect(r.sent).toEqual({ afterSend: true })
    expect(caseAnswer(r)).toBe('asked')
    const fields: string[] = []
    await submitTitle(oneAtATime(), 'Napisać raport', { set: (t) => fields.push(t), save: async (t) => caseAnswer(await createTask({ title: t })), done: vi.fn() })
    expect(fields).toEqual([''])
  })
})
