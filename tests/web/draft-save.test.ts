/**
 * The first save of the new block of „Dziś” and what follows it (D461, T1066): a change made once that save has started waits
 * for it and then is its own write of the block, in the window's turn – each with its own answer; a change made while another
 * one's write runs is written too; the first save failed – the changes stay in the draft. Draft or block is decided by the save
 * started, not by whether the plan shows the block yet. Leaving: only a bare click of the axis left untouched is thrown away (T1045).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planBlock } from '@shared/model/plan'
import { FirstSave } from '@renderer/features/today/draftSave'
import type { SaveAnswer } from '@renderer/store/data'

const draft = planBlock({ id: 'd1', categoryId: 'inne', startMin: 9 * 60, durationMin: 60, origin: 'user' })
const flush = () => new Promise<void>((r) => setTimeout(r, 0))
/** A promise and its resolver. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('pierwszy zapis szkicu i zmiany po nim (D461, T1066)', () => {
  it('zmiana w trakcie pierwszego zapisu czeka na jego koniec i jest osobnym zapisem bloku, po kolei', async () => {
    const f = new FirstSave()
    const first = deferred<boolean>()
    const run = f.start({ ...draft, startMin: 20 * 60 }, () => first.promise)
    const writes: string[] = []
    const a = f.after('d1', (saved) => (writes.push(`end:${saved.startMin}`), true))
    const b = f.after('d1', () => (writes.push('name'), true))
    await flush()
    expect(writes).toEqual([])
    first.resolve(true)
    expect(await run).toBe(true)
    expect([await a, await b]).toEqual([true, true])
    // Over the block as the first save wrote it (the file's in its turn), in the order committed.
    expect(writes).toEqual(['end:1200', 'name'])
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

  it('rozsunięcie nowego bloku liczone raz (dla zapisu i dla dymka)', () => {
    expect(page.match(/pushedStarts\(/g)?.length).toBe(1)
  })
})
