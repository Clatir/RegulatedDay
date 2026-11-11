/**
 * The note of a block as a live Markdown editor (D388, T660–T665): bold and check boxes typed in the note, saved on leaving
 * the editor as Markdown in the day's file, shown formatted when the block is opened again; a note only opened is never
 * written; a click on a check box saves at once; Esc throws away what was not saved and the next one closes the panel;
 * „Powiększ” keeps the unsaved text and Esc brings it back without throwing it away.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, today with a block of its own at 10:00 with a note of plain lines written by an older version. */
function seed(dir: string): string {
  const today = logicalToday()
  const records = firstComputerRecords(
    { settings: DEFAULT_SETTINGS, general: DEFAULT_GENERAL, categories: rdFrom(undefined).categories, people: [], templates: defaultTemplates(), lectures: [], days: {} },
    Date.now(),
    'seed'
  )
  for (const r of records) {
    mkdirSync(dirname(join(dir, r.rel)), { recursive: true })
    writeFileSync(join(dir, r.rel), JSON.stringify(r.value, null, 2))
  }
  const path = join(dir, 'days', today.slice(0, 4), `${today}.json`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ schema: 1, date: today, blocks: [{ id: 'n1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false, note: 'stara linia 1\nstara linia 2' }] }))
  return path
}

const noteOf = (path: string): string | undefined => {
  const blocks = (JSON.parse(readFileSync(path, 'utf8')) as { blocks: unknown }).blocks
  const list = (Array.isArray(blocks) ? blocks : Object.values(blocks as object)) as Array<{ id: string; note?: string }>
  return list.find((b) => b.id === 'n1')?.note
}

test('notatka bloku: pogrubienie i pola wyboru zapisane jako Markdown, widoczne po ponownym otwarciu, Esc i „Powiększ” (D388)', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-note-'))
  const dayPath = seed(dataDir)
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir } })
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      const block = page.getByTestId('block-n1')
      const note = page.getByTestId('block-note')
      // The caret at the end of the text, and ProseMirror knows it (its selection follows the browser's a moment later).
      const toEnd = async () => {
        await note.focus()
        await page.keyboard.press('Control+End')
        await expect.poll(() => note.evaluate((el) => { const e = (el as unknown as { editor: { state: { selection: { from: number }; doc: { content: { size: number } } } } }).editor; return e.state.selection.from === e.state.doc.content.size - 1 })).toBe(true)
      }
      const open = async () => {
        await block.scrollIntoViewIfNeeded()
        await block.click()
        await expect(page.getByTestId('block-editor')).toBeVisible()
      }
      const before = readFileSync(dayPath, 'utf8')

      // A note only opened and left is never written (T661a); its lines are lines (T661b).
      await open()
      await expect(note).toContainText('stara linia 1')
      await expect(note.locator('br')).not.toHaveCount(0)
      await page.getByTestId('block-duration').click()
      await page.getByTestId('block-editor-close').click()
      await expect(page.getByTestId('block-editor')).toBeHidden()
      expect(readFileSync(dayPath, 'utf8')).toBe(before)

      // Bold with Ctrl B (the keys stay in the editor) and check boxes; saved on leaving the field.
      await open()
      await toEnd()
      await page.keyboard.press('Enter')
      await page.keyboard.press('Control+b')
      await page.keyboard.type('Ważne')
      await page.keyboard.press('Control+b')
      await page.keyboard.type(' reszta')
      await expect(note.locator('strong')).toHaveText('Ważne')
      // Not saved while typing (T662).
      expect(noteOf(dayPath)).toBe('stara linia 1\nstara linia 2')
      await page.keyboard.press('Enter')
      await page.getByTestId('note-tasks').click()
      await page.keyboard.type('kupić mleko')
      await page.keyboard.press('Enter')
      await page.keyboard.type('zadzwonić')
      await page.getByTestId('block-duration').click()
      await expect.poll(() => noteOf(dayPath), { timeout: 15_000 }).toBe('stara linia 1\nstara linia 2\n\n**Ważne** reszta\n\n- [ ] kupić mleko\n- [ ] zadzwonić')

      // Opened again the formatting shows; a click on a check box saves at once.
      await page.getByTestId('block-editor-close').click()
      await open()
      await expect(note.locator('strong')).toHaveText('Ważne')
      await expect(note.locator('input[type="checkbox"]')).toHaveCount(2)
      await note.locator('input[type="checkbox"]').first().click()
      await expect.poll(() => noteOf(dayPath), { timeout: 15_000 }).toContain('- [x] kupić mleko\n- [ ] zadzwonić')

      // Esc throws away what was not saved, the next Esc closes the panel (T662).
      await toEnd()
      await page.keyboard.type(' LOST')
      await page.keyboard.press('Escape')
      await expect(note).not.toContainText('LOST')
      await expect(page.getByTestId('block-editor')).toBeVisible()
      expect(noteOf(dayPath)).not.toContain('LOST')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('block-editor')).toBeHidden()

      // „Powiększ”: the unsaved text and the cursor stay; Esc brings the note back and does not throw the text away (T665).
      await open()
      await toEnd()
      await page.keyboard.type(' KEPT')
      await page.getByTestId('note-expand').click()
      await expect(page.getByTestId('note-editor')).toHaveAttribute('role', 'dialog')
      await expect(page.getByTestId('note-expand')).toHaveText('Pomniejsz')
      await page.keyboard.type('+')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('note-editor')).not.toHaveAttribute('role', 'dialog')
      await expect(page.getByTestId('block-editor')).toBeVisible()
      await expect(note).toContainText('KEPT+')
      expect(noteOf(dayPath)).not.toContain('KEPT')
      await page.getByTestId('block-duration').click()
      await expect.poll(() => noteOf(dayPath), { timeout: 15_000 }).toContain('KEPT+')
      expect(errors).toEqual([])
    })
  } finally {
    await app.close()
  }
})
