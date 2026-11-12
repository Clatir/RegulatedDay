// @vitest-environment jsdom
/**
 * The panel of a block with attachments (SNT4, D410, T811, T814): the section stands in the panel of a saved block (not in the
 * panel of a draft, which has `place` left out); files dropped on the panel go to the block's own owner – a day's block to the
 * day, a block of a template to the template, a series to the series.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import type { BlockPlace } from '@shared/model/attachment'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { attachFiles } from '@renderer/store/attachments'
import { installEscape } from '@renderer/lib/escape'

vi.mock('@renderer/store/attachments', async (orig) => ({ ...(await orig<typeof import('@renderer/store/attachments')>()), attachFiles: vi.fn(async () => ({ added: [], failed: [] })) }))

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const block = planBlock({ id: 'b1', categoryId: 'inne', startMin: 9 * 60, durationMin: 60, origin: 'user' })

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})
beforeEach(() => {
  vi.mocked(attachFiles).mockClear()
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}`, attachmentThumb: async () => null }
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function mount(place: BlockPlace | undefined) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, place })))
  return host.querySelector<HTMLElement>('[data-testid="block-editor"]')!
}
function drop(el: Element, type: string, files: File[]): boolean {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'dataTransfer', { value: { types: ['Files'], getData: () => '', files, dropEffect: 'none' } })
  let cancelled = false
  act(() => {
    cancelled = !el.dispatchEvent(e)
  })
  return cancelled
}

describe('panel bloku z załącznikami', () => {
  it('blok dnia: sekcja jest, upuszczenie plików na panel dołącza je do bloku tego dnia', async () => {
    const panel = await mount({ scope: 'day', date: '2026-11-18', templateId: null })
    expect(panel.querySelector('[data-testid="attachments"]')).not.toBeNull()
    expect(drop(panel, 'dragover', [new File(['x'], 'a.pdf')])).toBe(true)
    expect(panel.querySelector('[data-testid="attachments"]')!.getAttribute('data-drop')).toBe('on')
    drop(panel, 'drop', [new File(['x'], 'a.pdf')])
    expect(attachFiles).toHaveBeenCalledWith({ scope: 'day', date: '2026-11-18', blockId: 'b1' }, ['C:/a.pdf'])
  })

  it('blok szablonu: pod właścicielem „szablon”', async () => {
    const panel = await mount({ scope: 'template', templateId: 't1' })
    drop(panel, 'drop', [new File(['x'], 'b.pdf')])
    expect(attachFiles).toHaveBeenCalledWith({ scope: 'template', templateId: 't1', blockId: 'b1' }, ['C:/b.pdf'])
  })

  it('seria: pod właścicielem „seria”, bez id bloku', async () => {
    const panel = await mount({ scope: 'series', root: 'r1' })
    drop(panel, 'drop', [new File(['x'], 'c.pdf')])
    expect(attachFiles).toHaveBeenCalledWith({ scope: 'series', root: 'r1' }, ['C:/c.pdf'])
  })

  it('szkic nowego bloku (bez place): ani sekcji, ani przyjmowania plików', async () => {
    const panel = await mount(undefined)
    expect(panel.querySelector('[data-testid="attachments"]')).toBeNull()
    expect(drop(panel, 'dragover', [new File(['x'], 'a.pdf')])).toBe(false)
    drop(panel, 'drop', [new File(['x'], 'a.pdf')])
    expect(attachFiles).not.toHaveBeenCalled()
  })
})
