/**
 * What the screens of attachments say (SNT4, D410, T811): the kind of a file for its icon, its size in Polish, where an attachment
 * of a day's block comes from, the counts of the tiles of the axis.
 */
import { describe, expect, it } from 'vitest'
import { attachBadge, attachBadgeTitle, fileKind, isOwnHere, originTag, sizeText, withAttachCounts } from '@renderer/features/attachments/attachView'
import type { Attachment, BlockPlace } from '@shared/model/attachment'

const a = (id: string, owner: Attachment['owner'], removedAt: number | null = null): Attachment => ({
  id,
  kind: 'file',
  name: id,
  file: { fileName: `${id}.pdf`, size: 10, ext: 'pdf' },
  link: null,
  owner,
  addedAt: Number(id.replace(/\D/g, '')) || 0,
  removedAt
})

describe('rodzaj pliku (ikona)', () => {
  it('po rozszerzeniu: pdf, dokument, arkusz, prezentacja, archiwum, obraz, dźwięk i wideo, inne', () => {
    expect([
      fileKind('a.pdf', 'pdf'),
      fileKind('a.docx', 'docx'),
      fileKind('a.xlsx', 'xlsx'),
      fileKind('a.pptx', 'pptx'),
      fileKind('a.zip', 'zip'),
      fileKind('a.png', 'png'),
      fileKind('a.mp3', 'mp3'),
      fileKind('a.xyz', 'xyz'),
      fileKind('a', '')
    ]).toEqual(['pdf', 'doc', 'sheet', 'slides', 'archive', 'image', 'media', 'other', 'other'])
  })

  it('plik, który Windows by uruchomił, to „program” – także z ostatnim rozszerzeniem po kropkach i spacjach', () => {
    expect(fileKind('setup.exe', 'exe')).toBe('program')
    expect(fileKind('faktura.pdf.exe', 'exe')).toBe('program')
    expect(fileKind('run.bat', 'bat')).toBe('program')
  })
})

describe('rozmiar po polsku', () => {
  it('B, KB, MB, GB z przecinkiem, jedno miejsce poniżej 10, bez „,0”', () => {
    expect(sizeText(0)).toBe('0 B')
    expect(sizeText(999)).toBe('999 B')
    expect(sizeText(1024)).toBe('1 KB')
    expect(sizeText(1536)).toBe('1,5 KB')
    expect(sizeText(12 * 1024)).toBe('12 KB')
    expect(sizeText(1024 * 1024)).toBe('1 MB')
    expect(sizeText(3.2 * 1024 * 1024)).toBe('3,2 MB')
    expect(sizeText(250 * 1024 * 1024)).toBe('250 MB')
    expect(sizeText(2 * 1024 ** 3)).toBe('2 GB')
  })

  it('wartość ujemna albo ułamkowa nie psuje tekstu', () => {
    expect(sizeText(-5)).toBe('0 B')
    expect(sizeText(10.9)).toBe('10 B')
  })
})

describe('skąd załącznik w bloku dnia', () => {
  const day: BlockPlace = { scope: 'day', date: '2026-11-18', templateId: 't1' }
  it('własny – bez dopisku, można go zmienić i usunąć; z szablonu i z serii – z dopiskiem, bez zmiany tutaj (T811)', () => {
    const own = a('a1', { scope: 'day', date: '2026-11-18', blockId: 'b1' })
    const tpl = a('a2', { scope: 'template', templateId: 't1', blockId: 's1' })
    const ser = a('a3', { scope: 'series', root: 'r1' })
    expect([originTag(own, day), originTag(tpl, day), originTag(ser, day)]).toEqual([null, 'z szablonu', 'z serii'])
    expect([isOwnHere(own, day), isOwnHere(tpl, day), isOwnHere(ser, day)]).toEqual([true, false, false])
  })

  it('w szablonie i w serii wszystko, co widać, jest własne', () => {
    const tpl = a('a2', { scope: 'template', templateId: 't1', blockId: 's1' })
    const ser = a('a3', { scope: 'series', root: 'r1' })
    expect(originTag(tpl, { scope: 'template', templateId: 't1' })).toBeNull()
    expect(isOwnHere(ser, { scope: 'series', root: 'r1' })).toBe(true)
  })
})

describe('znaczek 📎N', () => {
  it('liczba i podpowiedź po polsku', () => {
    expect(attachBadge(3)).toBe('📎3')
    expect([1, 2, 4, 5, 12, 14, 22, 25].map(attachBadgeTitle)).toEqual(['1 załącznik', '2 załączniki', '4 załączniki', '5 załączników', '12 załączników', '14 załączników', '22 załączniki', '25 załączników'])
  })

  it('liczy załączniki bloku (własne, szablonu, serii), nie usunięte; blok nieznany – bez liczby', () => {
    const day: BlockPlace = { scope: 'day', date: '2026-11-18', templateId: 't1' }
    const list = [
      a('a1', { scope: 'day', date: '2026-11-18', blockId: 'b1' }),
      a('a2', { scope: 'template', templateId: 't1', blockId: 's1' }),
      a('a3', { scope: 'series', root: 'r1' }),
      a('a4', { scope: 'day', date: '2026-11-18', blockId: 'b1' }, 5),
      a('a5', { scope: 'day', date: '2026-11-18', blockId: 'zly' })
    ]
    const blocks = new Map<string, { id: string; origin: 'template' | 'series' | 'user'; sourceId: string | null }>([
      ['b1', { id: 'b1', origin: 'template', sourceId: 's1' }],
      ['b2', { id: 'b2', origin: 'series', sourceId: 'r1' }],
      ['b3', { id: 'b3', origin: 'user', sourceId: null }]
    ])
    const items = [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'poza' }]
    const out = withAttachCounts(items, (id) => blocks.get(id) ?? null, day, list)
    expect(out.map((i) => [i.id, i.attach])).toEqual([
      ['b1', 2],
      ['b2', 1],
      ['b3', 0],
      ['poza', undefined]
    ])
  })
})
