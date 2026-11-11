/**
 * What the note's editor is told about its save (D388, T670): refused for good (put the shown text back) is not the same as a
 * question about a change on another computer, or a result not known after the send (your answer, or the folder, may still
 * write the text – the editor leaves it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveAnswer, storedAnswer, trySaveWith, type SendState } from '@renderer/store/data'
import type { EditEntry, EditOutcome } from '@shared/api'

const s = (...status: EditOutcome['status'][]): EditOutcome[] => status.map((x) => ({ status: x }))

describe('odpowiedź zapisu dla edytora notatki (T670)', () => {
  it('zapisane albo czeka na folder – true', () => {
    expect(saveAnswer(s('applied'))).toBe(true)
    expect(saveAnswer(s('applied', 'waiting'))).toBe(true)
    expect(saveAnswer([])).toBe(true)
  })
  it('konflikt, rekord zmieniony albo usunięty gdzie indziej – pytanie, nie odrzucenie', () => {
    for (const st of ['conflict', 'removedElsewhere', 'changedElsewhere'] as const) {
      expect(saveAnswer(s(st)), st).toBe('asked')
      expect(saveAnswer(s('applied', st)), st).toBe('asked')
    }
  })
  it('uszkodzony plik i brak wysyłki – odrzucone na dobre (false)', () => {
    expect(saveAnswer(null)).toBe(false)
    expect(saveAnswer(null, { afterSend: false })).toBe(false)
    expect(saveAnswer(s('broken'))).toBe(false)
    expect(saveAnswer(s('conflict', 'broken'))).toBe(false)
  })
  it('wynik nieznany po wysłaniu (null i afterSend) – pytanie, bez cofania', () => {
    expect(saveAnswer(null, { afterSend: true })).toBe('asked')
    expect(storedAnswer(null, { afterSend: true })).toBe('asked')
  })
  it('szablon, którego już nie ma (pusta odpowiedź), nie jest zapisem; reszta jak wyżej', () => {
    expect(storedAnswer([])).toBe(false)
    expect(storedAnswer(null)).toBe(false)
    expect(storedAnswer(s('applied'))).toBe(true)
    expect(storedAnswer(s('conflict'))).toBe('asked')
    expect(storedAnswer(s('broken'))).toBe(false)
  })
})

describe('trySaveWith zaznacza, że błąd był po wysłaniu (T670)', () => {
  const entry = { rel: 'x.json', fields: {} } as unknown as EditEntry
  const stub = (edit: () => Promise<EditOutcome[]>) => {
    ;(globalThis as { window?: unknown }).window = { rd: { edit, dataView: () => Promise.reject(new Error('x')), onData: () => undefined } }
  }
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('wywołanie edit odrzucone po wysłaniu: null i afterSend', async () => {
    stub(() => Promise.reject(new Error('IPC')))
    const state: SendState = { afterSend: false }
    expect(await trySaveWith(() => [entry], state)).toBeNull()
    expect(state.afterSend).toBe(true)
    expect(saveAnswer(null, state)).toBe('asked')
  })
  it('błąd przy budowie edycji (przed wysłaniem): null, afterSend zostaje false', async () => {
    const edit = vi.fn(() => Promise.resolve(s('applied')))
    stub(edit)
    const state: SendState = { afterSend: false }
    expect(
      await trySaveWith(() => {
        throw new Error('plik')
      }, state)
    ).toBeNull()
    expect(state.afterSend).toBe(false)
    expect(edit).not.toHaveBeenCalled()
    expect(saveAnswer(null, state)).toBe(false)
  })
  it('bez stanu działa jak dotąd (null przy błędzie, wynik przy sukcesie)', async () => {
    stub(() => Promise.reject(new Error('IPC')))
    expect(await trySaveWith(() => [entry])).toBeNull()
    stub(() => Promise.resolve(s('applied')))
    expect(await trySaveWith(() => [entry])).toEqual(s('applied'))
  })
})
