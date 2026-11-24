/**
 * Szybki zapis (OPS2, D385, D402): the window „Do skrzynki” exists hidden and never comes up by itself – not at the
 * start, not with the bar's refreshes; its field saves a task of your own into „Skrzynka” on Enter and hides, Esc hides
 * it without saving (shown here from the test, as the shortcut would). „+ Skrzynka” of the main window's bar unfolds the
 * same field in the bar; „+ Skrzynka” of the desktop bar (it takes no keys) brings up the window itself, as the shortcut does
 * (D564 P15).
 * The shortcut itself – Win+Alt+N pressed for real, the window over the others with the focus, not on top after – only
 * in CI on Windows (`quick-windows.spec.ts`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { dayFileFrom } from '../../src/shared/model/plan'
import { addDays } from '../../src/shared/time/zone'
import { dataOpen, launch, viewPage, withMainLog } from './app'

const QUICK_TITLE = 'Regulated Day – do skrzynki'

/** The window „Do skrzynki” as the main process has it. */
const quickWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)
    return w ? { visible: w.isVisible(), onTop: w.isAlwaysOnTop(), focusable: w.isFocusable() } : null
  }, QUICK_TITLE)

/** The tasks the data folder holds now (the files of requests/ with `kind: 'task'`). */
async function tasks(app: ElectronApplication): Promise<Array<Record<string, unknown>>> {
  const dir = await app.evaluate(() => process.env.RD_DATA_DIR ?? '')
  const files = (() => {
    try {
      return readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))
    } catch {
      return []
    }
  })()
  return files.map((n) => JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as Record<string, unknown>).filter((r) => r.kind === 'task')
}

async function quickPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 200; i++) {
    for (const p of app.windows()) if ((await p.evaluate(() => document.documentElement.dataset.view).catch(() => null)) === 'quick') return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Okno „Do skrzynki” nie pojawiło się.')
}

/** As the shortcut shows it (the test cannot press a global shortcut on every system): shown, on top, with the focus. */
const showAsShortcut = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)!
    w.setAlwaysOnTop(true, 'floating')
    w.show()
    w.focus()
    w.webContents.send('rd:onQuickShown')
  }, QUICK_TITLE)

test('„Do skrzynki”: nie wychodzi sam; Enter zapisuje zadanie w Skrzynce i chowa okno, Esc chowa bez zapisu', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      // The day is counted and the bar refreshed a few times: the window is still hidden and not on top.
      await expect(page.getByTestId('bar-main')).toBeVisible({ timeout: 30_000 })
      await expect.poll(() => quickWindow(app)).toEqual({ visible: false, onTop: false, focusable: true })
      const bar = await viewPage(app, 'bar')
      await expect(bar.getByTestId('bar-quick')).toBeVisible()
      expect(await quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      // The shortcut's state for the settings: Win+Alt+N (another program may hold it on a developer's computer).
      expect(await page.evaluate(() => window.rd.quickShortcut())).toMatchObject({ key: 'Super+Alt+N', state: expect.stringMatching(/^(on|taken)$/) })

      // The window and its bar show before the folder opens: an Enter of that moment is refused, not saved.
      await dataOpen(page)
      await showAsShortcut(app)
      const q = await quickPage(app)
      await q.getByTestId('quick-title').fill('Zamówić karmę dla kota')
      await q.getByTestId('quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ kind: 'task', title: 'Zamówić karmę dla kota', list: 'inbox', estimateMin: 30, categoryId: 'inne' })])
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: false, onTop: false })

      // Esc: hidden, nothing saved.
      await showAsShortcut(app)
      await q.getByTestId('quick-title').fill('nie zapisuj')
      await q.getByTestId('quick-title').press('Escape')
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      expect((await tasks(app)).map((t) => t.title)).toEqual(['Zamówić karmę dla kota'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('„+ Skrzynka” w pasku okna głównego rozwija pole – Enter zapisuje do Skrzynki; „+ Skrzynka” paska pulpitu otwiera okienko „Do skrzynki” (D564 P15)', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      const bar = page.getByTestId('bar-main')
      await expect(bar).toBeVisible({ timeout: 30_000 })
      // The bar shows before the folder opens: an Enter of that moment is refused („Folder danych nie jest otwarty”), not saved.
      await dataOpen(page)
      await bar.getByTestId('bar-quick').click()
      await bar.getByTestId('bar-quick-title').fill('Sprawdzić błąd w kodzie')
      await bar.getByTestId('bar-quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ title: 'Sprawdzić błąd w kodzie', list: 'inbox' })])
      await expect(bar.getByTestId('bar-quick-field')).toHaveCount(0)

      expect(await quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      // The desktop bar takes no keys: its „+ Skrzynka” brings up the window „Do skrzynki”, on top with the focus – no panel.
      const desktop = await viewPage(app, 'bar')
      await expect(desktop.getByTestId('bar-quick')).toHaveText('+ Skrzynka')
      await desktop.getByTestId('bar-quick').click()
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: true, onTop: true })
      const q = await quickPage(app)
      await expect(q.getByTestId('quick-title')).toBeFocused()
      await q.getByTestId('quick-title').fill('Zadzwonić do ubezpieczyciela')
      await q.getByTestId('quick-title').press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => t.title).sort()).toEqual(['Sprawdzić błąd w kodzie', 'Zadzwonić do ubezpieczyciela'])
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: false, onTop: false })
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Regulated Day – panel' && w.isVisible()))).toBe(false)
      await expect.poll(() => readFile(join(userData, 'logs', 'main.log'), 'utf8')).toContain('okienko „Do skrzynki” otwarte przyciskiem „+ Skrzynka” paska pulpitu')
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('szybki zapis z „!jutro” (D409): podgląd „Termin: jutro” pod polem okienka i pola paska przed Enter; zadanie bez słowa w tytule z terminem na jutro', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      const bar = page.getByTestId('bar-main')
      await expect(bar).toBeVisible({ timeout: 30_000 })
      // The folder open first: a save of the moment before is refused, not saved.
      await dataOpen(page)
      const today = await page.evaluate(() => window.rd.dataView().then((v) => v.today))
      await showAsShortcut(app)
      const q = await quickPage(app)
      await expect(q.getByTestId('quick-preview')).toHaveCount(0)
      await q.getByTestId('quick-title').fill('Odebrać paczkę !jutro')
      await expect(q.getByTestId('quick-preview')).toHaveText('Termin: jutro')
      await q.getByTestId('quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ title: 'Odebrać paczkę', dueDate: addDays(today, 1), doDate: null })])

      // The field of the bar: the same line under it.
      await bar.getByTestId('bar-quick').click()
      await bar.getByTestId('bar-quick-title').fill('Zapłacić rachunek @dziś')
      await expect(bar.getByTestId('bar-quick-preview')).toHaveText('Wykonać: dziś')
      await bar.getByTestId('bar-quick-title').press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => [t.title, t.doDate != null]).sort()).toEqual([
        ['Odebrać paczkę', false],
        ['Zapłacić rachunek', true]
      ])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('szybki zapis z długością, godziną i podkategorią (N10, D600–D602): podgląd mówi wszystko, blok stoi na osi jutra', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('bar-main')).toBeVisible({ timeout: 30_000 })
      await dataOpen(page)
      const today = await page.evaluate(() => window.rd.dataView().then((v) => v.today))
      const tomorrow = addDays(today, 1)
      await showAsShortcut(app)
      const q = await quickPage(app)
      await q.getByTestId('quick-title').fill('Raport @jutro 15:00 1h #anal')
      await expect(q.getByTestId('quick-preview')).toHaveText('Wykonać: jutro 15:00 · 1 h · Analiza')
      await q.getByTestId('quick-title').press('Enter')
      await expect.poll(() => tasks(app)).toEqual([expect.objectContaining({ title: 'Raport', estimateMin: 60, categoryId: 'analiza', doDate: tomorrow, day: tomorrow, block: expect.any(String) })])
      const [task] = await tasks(app)
      await expect
        .poll(async () => {
          const raw = (await page.evaluate((d) => window.rd.dayFiles([d]), tomorrow))[tomorrow]
          return raw ? dayFileFrom(raw, tomorrow).blocks.map((b) => ({ id: b.id, categoryId: b.categoryId, startMin: b.startMin, durationMin: b.durationMin })) : []
        })
        .toEqual([{ id: task!.block, categoryId: 'analiza', startMin: 900, durationMin: 60 }])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

/** A paste of `text` into the field as the clipboard brings it (the test cannot press Ctrl+V into a page it does not own the clipboard of). */
async function pasteText(field: Locator, text: string): Promise<void> {
  await field.focus()
  await field.evaluate((el, t) => {
    const data = new DataTransfer()
    data.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

const LIST = '- Kup mleko\r\n\r\n- [ ] Raport @jutro 15:00 1h #anal\n1. Telefon do mamy\n* Zamówić karmę !jutro\n• Oddać książki'

test('wklejona lista (N11, D605, D606): okienko pyta, Enter zapisuje 5 spraw z blokiem jednej z nich i zostaje z „Cofnij”, „Cofnij” zdejmuje wszystkie; Esc – jeden tytuł', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      await expect(page.getByTestId('bar-main')).toBeVisible({ timeout: 30_000 })
      await dataOpen(page)
      const today = await page.evaluate(() => window.rd.dataView().then((v) => v.today))
      const tomorrow = addDays(today, 1)
      const blocks = () =>
        page.evaluate((d) => window.rd.dayFiles([d]), tomorrow).then((files) => (files[tomorrow] ? dayFileFrom(files[tomorrow], tomorrow).blocks.map((b) => b.startMin) : []))
      await showAsShortcut(app)
      const q = await quickPage(app)
      const field = q.getByTestId('quick-title')
      await pasteText(field, LIST)
      // The field takes no text; the question stands under it.
      await expect(field).toHaveValue('')
      await expect(q.getByTestId('quick-paste')).toHaveText('Dodać 5 spraw? · Enter · Esc – jeden tytuł')
      await field.press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => t.title).sort()).toEqual(['Kup mleko', 'Oddać książki', 'Raport', 'Telefon do mamy', 'Zamówić karmę'])
      expect((await tasks(app)).find((t) => t.title === 'Raport')).toMatchObject({ estimateMin: 60, categoryId: 'analiza', doDate: tomorrow, day: tomorrow })
      await expect.poll(blocks).toEqual([900])
      // The window stays – with the line and its „Cofnij”.
      await expect(q.getByTestId('quick-list-text')).toHaveText('Dodano 5 spraw')
      await expect.poll(() => quickWindow(app)).toMatchObject({ visible: true })
      await q.getByTestId('quick-undo').click()
      await expect(q.getByTestId('quick-list-text')).toHaveText('Cofnięto 5 spraw')
      await expect.poll(() => tasks(app)).toEqual([])
      await expect.poll(blocks).toEqual([])

      // Esc: the paste becomes one title in the field – the window stays; Enter saves that one title.
      await pasteText(field, 'Wizyta\n- u lekarza')
      await expect(q.getByTestId('quick-paste')).toHaveText('Dodać 2 sprawy? · Enter · Esc – jeden tytuł')
      await field.press('Escape')
      await expect(field).toHaveValue('Wizyta - u lekarza')
      await expect(q.getByTestId('quick-paste')).toHaveCount(0)
      expect(await quickWindow(app)).toMatchObject({ visible: true })
      await field.press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => t.title)).toEqual(['Wizyta - u lekarza'])
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})

test('wklejona lista w polu „+ Skrzynka” paska okna (N11): Enter zapisuje, pasek mówi „Dodano 3 sprawy · Cofnij”, „Cofnij” zdejmuje wszystkie', async () => {
  const { app, page, userData, errors } = await launch({ data: true })
  try {
    await withMainLog(userData, async () => {
      const bar = page.getByTestId('bar-main')
      await expect(bar).toBeVisible({ timeout: 30_000 })
      await dataOpen(page)
      await bar.getByTestId('bar-quick').click()
      const field = bar.getByTestId('bar-quick-title')
      await pasteText(field, '- jeden\n- dwa\n- trzy')
      await expect(bar.getByTestId('bar-quick-paste')).toHaveText('Dodać 3 sprawy? · Enter · Esc – jeden tytuł')
      await field.press('Enter')
      await expect.poll(async () => (await tasks(app)).map((t) => t.title).sort()).toEqual(['dwa', 'jeden', 'trzy'])
      await expect(bar.getByTestId('bar-quick-field')).toHaveCount(0)
      // The line of the list stands after every line of the day: at some hours of the run a morning question or water fill the bar and it waits in „⋯”.
      const line = page.locator('[data-testid^="bar-line-quick:"]')
      const more = bar.getByTestId('bar-group-more')
      await expect(async () => {
        if (!(await line.count()) && (await more.count()) && (await more.getAttribute('aria-pressed')) !== 'true') await more.click()
        await expect(line).toContainText('Dodano 3 sprawy', { timeout: 1_000 })
      }).toPass({ timeout: 10_000 })
      await page.getByTestId('bar-act-quick-undo').click()
      await expect.poll(() => tasks(app)).toEqual([])
      await expect(line).toHaveCount(0)
    })
    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
