/**
 * Załączniki i linki bloków (SNT4, D410): „Dołącz plik…” w panelu bloku (the test identity takes the files from RD_E2E_ATTACH
 * instead of the dialog of Windows – T812) – the file copied into attachments/<id>/ of the data folder, its original untouched,
 * a name and a size, a thumbnail for an image; „Dodaj link” (no network in the test identity – the domain stands for the title,
 * T813); the 📎N of the tile; a removal and „Cofnij”; an attachment of a series seen in its occurrence, gone with „Cała seria”
 * and back with its „Cofnij” (D415). A drop from the Explorer is tested in tests/web (the window has no real files to drag here).
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { DEFAULT_GENERAL, rdFrom } from '../../src/shared/model/rd'
import { DEFAULT_SETTINGS } from '../../src/shared/model/settings'
import { newSeries } from '../../src/shared/engine/series'
import { seriesJson } from '../../src/shared/model/series'
import { defaultTemplates, firstComputerRecords } from '../../src/shared/model/defaults'
import { launch, logicalToday, withMainLog } from './app'

/** A folder like the wizard's, today with a block of its own at 10:00 (an hour) and a daily series (held on special days: always there). */
function seed(dir: string): void {
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
  mkdirSync(join(dir, 'days', today.slice(0, 4)), { recursive: true })
  writeFileSync(join(dir, 'days', today.slice(0, 4), `${today}.json`), JSON.stringify({ schema: 1, date: today, blocks: [{ id: 'w1', categoryId: 'inne', startMin: 10 * 60, durationMin: 60, fixed: false }] }))
  const block = { categoryId: 'nauka', variantId: null, startMin: 15 * 60, durationMin: 30, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: null, routine: null }
  mkdirSync(join(dir, 'series'), { recursive: true })
  writeFileSync(join(dir, 'series', 'sr1.json'), JSON.stringify(seriesJson(newSeries('sr1', block as never, today, { kind: 'daily' }, 'held', { until: null, count: null }))))
}

/** A real PNG of 8 × 8 pixels (the thumbnail is made by Electron's nativeImage – it needs bytes it can decode). */
function png(): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(8, 0)
  ihdr.writeUInt32BE(8, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.alloc(8 * (1 + 8 * 3), 0x7f)
  for (let y = 0; y < 8; y++) rows[y * 25] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

test('załączniki bloku: plik z „Dołącz plik…” w folderze danych, miniatura obrazu, link z domeną, 📎N, usunięcie i „Cofnij”, załącznik serii w wystąpieniu', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'rd-e2e-attach-'))
  seed(dataDir)
  const source = mkdtempSync(join(tmpdir(), 'rd-e2e-attach-src-'))
  const pdf = join(source, 'raport.pdf')
  const img = join(source, 'foto.png')
  writeFileSync(pdf, Buffer.alloc(2048, 0x41))
  writeFileSync(img, png())
  const { app, page, userData, errors } = await launch({ env: { RD_DATA_DIR: dataDir, RD_E2E_ATTACH: `${pdf};${img}` } })
  const rows = page.getByTestId('attachment')
  /** The folders of attachments of the data folder (each holds the file of one). */
  const folders = () => {
    try {
      return readdirSync(join(dataDir, 'attachments'), { withFileTypes: true }).filter((e) => e.isDirectory())
    } catch {
      return []
    }
  }
  try {
    await withMainLog(userData, async () => {
      await page.setViewportSize({ width: 1280, height: 860 }).catch(() => undefined)
      await expect(page.getByTestId('today')).toBeVisible({ timeout: 30_000 })
      await page.getByTestId('block-w1').click()
      await expect(page.getByTestId('attachments')).toBeVisible()
      await expect(rows).toHaveCount(0)
      await expect(page.getByTestId('attach-badge')).toHaveCount(0)

      // „Dołącz plik…”: two files – a document and a picture.
      await page.getByTestId('attach-pick').click()
      await expect(rows).toHaveCount(2, { timeout: 30_000 })
      const doc = rows.filter({ hasText: 'raport.pdf' })
      await expect(doc.getByTestId('attachment-meta')).toHaveText('PDF · 2 KB')
      await expect(doc.getByTestId('attachment-icon')).toHaveAttribute('data-kind', 'pdf')
      // The picture has its thumbnail (loaded by the main process).
      await expect(rows.filter({ hasText: 'foto.png' }).getByTestId('attachment-thumb')).toBeVisible({ timeout: 30_000 })
      // The files are in the data folder, one folder to an attachment; the originals are as they were.
      await expect.poll(() => folders().length, { timeout: 30_000 }).toBe(2)
      const inside = folders().flatMap((f) => readdirSync(join(dataDir, 'attachments', f.name)))
      expect(inside.sort()).toEqual(['foto.png', 'raport.pdf'])
      const copy = folders().find((f) => readdirSync(join(dataDir, 'attachments', f.name)).includes('raport.pdf'))!
      expect(readFileSync(join(dataDir, 'attachments', copy.name, 'raport.pdf')).equals(readFileSync(pdf))).toBe(true)
      // The tile of the block carries 📎2.
      await expect(page.getByTestId('block-w1').getByTestId('attach-badge')).toHaveText('📎2')

      // „Dodaj link”: the address as typed (no scheme – https); no network here, so the domain stands for the title.
      await page.getByTestId('attach-link-add').click()
      await page.getByTestId('attach-link-input').fill('example.org/strona')
      await page.getByTestId('attach-link-input').press('Enter')
      await expect(rows).toHaveCount(3, { timeout: 30_000 })
      const site = page.locator('[data-testid="attachment"][data-kind="link"]')
      await expect(site).toContainText('example.org')
      await expect(page.getByTestId('attach-link-input')).toHaveCount(0)
      await expect(page.getByTestId('block-w1').getByTestId('attach-badge')).toHaveText('📎3')
      await expect(page.getByTestId('attach-open-all')).toHaveText('Otwórz wszystko (3)')

      // „Usuń” without asking; „Cofnij” brings it back.
      await doc.getByTestId('attachment-remove').click()
      await expect(rows).toHaveCount(2, { timeout: 30_000 })
      // The removal is soft: the file stays in the folder (30 days, D410).
      expect(readdirSync(join(dataDir, 'attachments', copy.name))).toContain('raport.pdf')
      await expect(page.getByTestId('block-w1').getByTestId('attach-badge')).toHaveText('📎2')
      await page.getByTestId('toast-action').click()
      await expect(rows).toHaveCount(3, { timeout: 30_000 })
      await expect(page.getByTestId('block-w1').getByTestId('attach-badge')).toHaveText('📎3')

      // „Zmień nazwę” in place.
      await rows.filter({ hasText: 'raport.pdf' }).getByTestId('attachment-rename').click()
      await page.getByTestId('attachment-rename-input').fill('Raport roczny')
      await page.getByTestId('attachment-rename-input').press('Enter')
      await expect(rows.filter({ hasText: 'Raport roczny' })).toHaveCount(1, { timeout: 30_000 })

      // An attachment of the series (in „Szablony”): its occurrence of today shows it, tagged „z serii”.
      await page.getByTestId('nav-templates').click()
      await expect(page.getByTestId('series-item')).toHaveCount(1)
      await page.getByTestId('series-item').click()
      await expect(page.getByTestId('series-editor')).toBeVisible()
      await expect(rows).toHaveCount(0)
      await page.getByTestId('attach-pick').click()
      await expect(rows).toHaveCount(2, { timeout: 30_000 })
      await page.getByTestId('nav-today').click()
      await expect(page.getByTestId('today')).toBeVisible()
      const occurrence = page.locator('button[data-testid^="block-"]').filter({ has: page.getByTestId('series-mark') })
      await expect(occurrence).toHaveCount(1, { timeout: 30_000 })
      await expect(occurrence.getByTestId('attach-badge')).toHaveText('📎2')
      await occurrence.click()
      await expect(rows).toHaveCount(2)
      await expect(page.getByTestId('attachment-origin')).toHaveText(['z serii', 'z serii'])
      // Where they are the series', they are changed there: no „Usuń” here.
      await expect(page.getByTestId('attachment-remove')).toHaveCount(0)

      // D415: „Usuń” · „Cała seria” takes the series' attachments with it (soft – the files stay 30 days); „Cofnij” brings
      // back the series and them.
      const seriesRecords = () =>
        readdirSync(join(dataDir, 'attachments'))
          .filter((n) => n.endsWith('.json'))
          .map((n) => JSON.parse(readFileSync(join(dataDir, 'attachments', n), 'utf8')) as { owner: { scope: string }; removedAt: number | null })
          .filter((r) => r.owner.scope === 'series')
      expect(seriesRecords().map((r) => r.removedAt)).toEqual([null, null])
      await page.getByTestId('block-remove').click()
      await expect(page.getByTestId('series-scope')).toBeVisible()
      await page.getByTestId('series-scope-all').click()
      await expect(occurrence).toHaveCount(0, { timeout: 30_000 })
      await expect.poll(() => seriesRecords().map((r) => typeof r.removedAt), { timeout: 30_000 }).toEqual(['number', 'number'])
      expect(folders().length).toBe(4)
      await page.getByRole('status').filter({ hasText: 'Usunięta seria' }).getByTestId('toast-action').click()
      await expect(occurrence).toHaveCount(1, { timeout: 30_000 })
      await expect(occurrence.getByTestId('attach-badge')).toHaveText('📎2')
      await expect.poll(() => seriesRecords().map((r) => r.removedAt), { timeout: 30_000 }).toEqual([null, null])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
