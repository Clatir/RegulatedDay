/**
 * The first save of the new block of „Dziś” and what follows it (D461, T1072): a change made once that save has started waits
 * for it and then is its own write of the block, in the window's turn – each with its own answer; a change made while another
 * one's write runs is written too; the first save failed – the changes stay in the draft. Draft or block is decided by the save
 * started, not by whether the plan shows the block yet. Leaving: only a bare click of the axis left untouched is thrown away (T1045).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planBlock } from '@shared/model/plan'
import { escapeDraft, FirstSave } from '@renderer/features/today/draftSave'
import { patchBlockDraft, setBlockDraft, useUi } from '@renderer/store/ui'
import type { SaveAnswer } from '@renderer/store/data'

const draft = planBlock({ id: 'd1', categoryId: 'inne', startMin: 9 * 60, durationMin: 60, origin: 'user' })
const flush = () => new Promise<void>((r) => setTimeout(r, 0))
/** A promise and its resolver. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('pierwszy zapis szkicu i zmiany po nim (D461, T1072)', () => {
  it('zmiana w trakcie pierwszego zapisu czeka na jego koniec i jest osobnym zapisem bloku, po kolei', async () => {
    const f = new FirstSave()
    const first = deferred<boolean>()
    const run = f.start({ ...draft, startMin: 20 * 60 }, () => first.promise)
    const writes: string[] = []
    const a = f.after('d1', () => (writes.push('end'), true))
    const b = f.after('d1', () => (writes.push('name'), true))
    await flush()
    expect(writes).toEqual([])
    first.resolve(true)
    expect(await run).toBe(true)
    expect([await a, await b]).toEqual([true, true])
    // In the order committed (each over the file as it is in its turn).
    expect(writes).toEqual(['end', 'name'])
  })

  it('zmiana zatwierdzona, gdy biegnie zapis poprzedniej, też się zapisuje (nic nie ginie)', async () => {
    const f = new FirstSave()
    void f.start(draft, async () => true)
    const slow = deferred<SaveAnswer>()
    const writes: string[] = []
    const a = f.after('d1', () => (writes.push('end'), slow.promise))
    await flush()
    expect(writes).toEqual(['end'])
    // The end's write still runs: the name committed now is written too, not kept aside and forgotten.
    const b = f.after('d1', () => (writes.push('name'), true))
    await flush()
    expect(writes).toEqual(['end', 'name'])
    slow.resolve(true)
    expect([await a, await b]).toEqual([true, true])
  })

  it('każda zmiana mówi swój wynik: odmowa – false, pytanie po konflikcie – „asked”, nie „zapisano” pierwszego zapisu', async () => {
    const f = new FirstSave()
    void f.start(draft, async () => true)
    expect(await f.after('d1', async () => false)).toBe(false)
    expect(await f.after('d1', async () => 'asked' as const)).toBe('asked')
    expect(await f.after('d1', async () => true)).toBe(true)
  })

  it('pierwszy zapis odmówiony: zmiany czekające nie piszą nic i zostają w szkicu („asked”); następna zaczyna zapis od nowa', async () => {
    const f = new FirstSave()
    const first = deferred<boolean>()
    void f.start(draft, () => first.promise)
    let wrote = false
    const a = f.after('d1', () => ((wrote = true), true))
    first.resolve(false)
    expect(await a).toBe('asked')
    expect(wrote).toBe(false)
    expect(f.of('d1')).toBeNull()
    expect(f.after('d1', () => true)).toBeNull()
  })

  it('szkic czy blok – po rozpoczętym zapisie: w trakcie i po nim (zanim plan pokaże blok) – blok; inny id – nic', async () => {
    const f = new FirstSave()
    expect(f.of('d1')).toBeNull()
    const first = deferred<boolean>()
    void f.start(draft, () => first.promise)
    expect(f.of('d1')?.block).toEqual(draft)
    first.resolve(true)
    await flush()
    expect(f.of('d1')).not.toBeNull()
    expect(f.of('d2')).toBeNull()
  })
})

describe('zmiany po pierwszym zapisie, wyjście w trakcie zapisu, Esc (T1079, T1080)', () => {
  it('zmiana po pierwszym zapisie nie dostaje zdjęcia bloku z pierwszego zapisu – pisze ją okno nad blokiem, jaki ma przy tej zmianie', async () => {
    const f = new FirstSave()
    await f.start({ ...draft, durationMin: 60 }, async () => true)
    const calls: unknown[][] = []
    // 60 → 120 → 30: the gap freed by the last one (D368) is counted from 120, never from the 60 the first save wrote.
    expect(await f.after('d1', (...a: unknown[]) => (calls.push(a), true))).toBe(true)
    expect(await f.after('d1', (...a: unknown[]) => (calls.push(a), true))).toBe(true)
    expect(calls).toEqual([[], []])
  })

  it('trwający pierwszy zapis widać (`pending`) do jego końca – udanego czy nie; wyjście z panelu czeka na niego', async () => {
    const f = new FirstSave()
    expect(f.pending()).toBeNull()
    const first = deferred<boolean>()
    const run = f.start(draft, () => first.promise)
    expect(f.pending()).toBe(run)
    first.resolve(true)
    await run
    await flush()
    expect(f.pending()).toBeNull()
    const refused = deferred<boolean>()
    void f.start({ ...draft, id: 'd2' }, () => refused.promise)
    expect(f.pending()).not.toBeNull()
    refused.resolve(false)
    await flush()
    expect(f.pending()).toBeNull()
  })

  it('Esc odrzuca tylko szkic nietknięty, którego zapis się nie zaczął; ruszony (pole, krok) albo zapisywany – zamyka panel jak „Zamknij”', () => {
    expect(escapeDraft(false, false)).toBe('discard')
    expect(escapeDraft(false, true)).toBe('leave')
    expect(escapeDraft(true, false)).toBe('leave')
    expect(escapeDraft(true, true)).toBe('leave')
  })

  it('szkic w store wie, czy go ruszono: nowy – nie; zmienione pole albo krok – tak; puste wyjście (zapis, jak stoi) – bez zmiany', () => {
    setBlockDraft('2026-11-18', draft, true)
    expect(useUi.getState().blockDraft?.touched).toBe(false)
    patchBlockDraft('2026-11-18', {})
    expect(useUi.getState().blockDraft?.touched).toBe(false)
    patchBlockDraft('2026-11-18', { steps: [] })
    expect(useUi.getState().blockDraft?.touched).toBe(true)
    setBlockDraft('2026-11-18', null)
  })
})

describe('„Dziś” prowadzi szkic przez pierwszy zapis (D461)', () => {
  const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')

  it('bez osobnej kolejki szkicu: pola i kroki po rozpoczętym zapisie idą przez `firstSave.after`', () => {
    for (const gone of ['later.current', 'saving.current', 'draftRest', 'saved.current']) expect(page).not.toContain(gone)
    expect(page).not.toMatch(/saveBlockSteps\([^\n]*draft != null\)/)
    expect(page.match(/firstSave\.after\(/g)?.length).toBe(2)
  })

  it('szkic odrzucony przed chwilą (Esc, klik osi gdzie indziej) nie zapisuje się spóźnionym zatwierdzeniem pola ani kroku', () => {
    expect(page).toMatch(/if \(!isDraft\) return saveFields\(b, patch\)\n\s*if \(!d\) return Promise\.resolve\(true\)/)
    expect(page).toContain('return isDraft ? Promise.resolve(true) : saveBlockSteps(o, b, op, false)')
    expect(page).toMatch(/if \(d\?\.date !== date \|\| d\.block\.id !== draft\.id\) return true/)
  })

  it('„+ Blok” i Ctrl+N są zamierzone (zapis przy opuszczeniu); goły klik osi – nie (T1045)', () => {
    expect(page).toMatch(/const newHere = \(\) => create\(nextPlace\(\), undefined, true\)/)
    expect(page).toMatch(/const create = async \(startMin: number, durationMin\?: number, intended = durationMin != null\)/)
  })

  it('zmiana po pierwszym zapisie – nad szkicem sprzed niej albo blokiem planu (T1079); wyjście bez szkicu czeka na trwający zapis, a jego koniec nie zmienia wyboru zrobionego w międzyczasie', () => {
    expect(page).toContain('firstSave.after(b.id, () => saveFields(over, patch))')
    expect(page).toContain('firstSave.after(b.id, () => saveBlockSteps(o, d ?? b, op, false))')
    expect(page).toMatch(/const leaveDraft = async \(quiet = false\): Promise<boolean> => \{\n\s*if \(!draft\) \{[^}]*firstSave\.pending\(\)[^}]*return true/)
    expect(page).toContain('if (dateNow.current === date && selectedNow.current === was) setSelected(full.id)')
  })

  it('Esc w panelu szkicu przez `escapeDraft` (T1080); Del i „Usuń” z jednego warunku; kroki i dzień w panelu (D462, T1067)', () => {
    expect(page).toContain('escapeDraft(firstSave.of(draft.id) != null, touchedNow(draft.id))')
    expect(page).toContain("{cancelWord ? 'Odwołaj na ten dzień' : 'Usuń'}")
    expect(page).toContain("useDeleteResolver('block', (id) => (deleteTarget && block!.id === id ? deleteTarget : null))")
    // A list of the block's routine (D473) asks no series' scope (T1102).
    expect(page).toContain('removeAsks={() => stepsAskScope({ date, series, scope: stepsScope }, block, draft != null, routineList != null)}')
    expect(page).toMatch(/<BlockEditor\n\s*key=\{block\.id\}\n\s*day=\{date\}/)
  })

  it('rozsunięcie nowego bloku liczone raz (dla zapisu i dla dymka)', () => {
    expect(page.match(/pushedStarts\(/g)?.length).toBe(1)
  })
})
