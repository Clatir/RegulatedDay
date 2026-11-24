/**
 * Szybki zapis rozumie więcej (N10, D600–D602): oprócz „!termin” i „@wykonać” (D409) długość („1h30”), podkategoria („#anal”)
 * i godzina po słowie dnia („@jutro 15:00”) – parser jest czysty, kategorie podaje wywołujący w kolejności drzewa.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { rdFrom } from '@shared/model/rd'
import { categoryOfWord, parseQuickDates, parseQuickWords, quickPreview, type QuickCategory } from '@shared/quickDates'
import { quickCategories } from '@shared/quickCategories'
import { NOT_PLACED, notPlacedBefore, quickNowMin, quickSavedText } from '@shared/quickSaid'
import { placeLogical } from '@shared/time/day'

const WED = '2026-11-11'
const THU = '2026-11-12'
const FRI = '2026-11-13'
const CATS: QuickCategory[] = [
  { id: 'inne', name: 'Inne obowiązki' },
  { id: 'analiza', name: 'Analiza' },
  { id: 'analiza-tyg', name: 'Analiza tygodniowa' },
  { id: 'zrodla', name: 'Źródła' },
  { id: 'prosby', name: 'Prośby domowe' }
]
const words = (text: string, today = WED) => parseQuickWords(text, today, CATS)

describe('długość (D602)', () => {
  it.each([
    ['30m', 30],
    ['45min', 45],
    ['90m', 90],
    ['1h', 60],
    ['2H', 120],
    ['1h30', 90],
    ['1h30m', 90],
    ['1h05min', 65],
    ['8h', 480]
  ])('„%s” = %i min, znika z tytułu', (w, min) => {
    expect(words(`Raport ${w}`)).toMatchObject({ title: 'Raport', estimateMin: min, startMin: null, doDate: null })
  })

  it.each(['0m', '9h', '500m', '1h60', '1h5', '1h30x', '1,5h', '30', 'h30', '1:30'])('„%s” nie jest długością – zostaje w tytule', (w) => {
    expect(words(`Raport ${w}`)).toMatchObject({ title: `Raport ${w}`, estimateMin: null })
  })

  it('długość bez godziny tylko ustawia szacunek – bez daty i miejsca na osi', () => {
    expect(words('Raport 1h')).toMatchObject({ title: 'Raport', estimateMin: 60, doDate: null, startMin: null, preview: '1 h' })
  })
})

describe('podkategoria „#…” (D600)', () => {
  it('początek nazwy, bez wielkości liter i bez polskich znaków', () => {
    expect(words('Raport #anal')).toMatchObject({ title: 'Raport', categoryId: 'analiza', categoryName: 'Analiza' })
    expect(words('Raport #zrodla')).toMatchObject({ title: 'Raport', categoryId: 'zrodla' })
    expect(words('Raport #ŹRÓD')).toMatchObject({ categoryId: 'zrodla' })
    expect(words('Raport #prosby')).toMatchObject({ categoryId: 'prosby' })
  })

  it('najpierw dokładna nazwa, potem pierwsza w kolejności drzewa', () => {
    // „analiza” to dokładna nazwa Analizy, choć „Analiza tygodniowa” też zaczyna się tak.
    expect(categoryOfWord('analiza', [CATS[2]!, CATS[1]!])?.id).toBe('analiza')
    // „anal” – pierwsza z drzewa.
    expect(categoryOfWord('anal', [CATS[2]!, CATS[1]!])?.id).toBe('analiza-tyg')
    expect(categoryOfWord('anal', CATS)?.id).toBe('analiza')
    expect(categoryOfWord('', CATS)).toBeNull()
  })

  it('bez dopasowania zostaje w tytule i kończy szukanie', () => {
    expect(words('Raport #xyz')).toMatchObject({ title: 'Raport #xyz', categoryId: null, preview: null })
    expect(words('Raport #xyz 1h')).toMatchObject({ title: 'Raport #xyz', estimateMin: 60 })
    expect(words('Raport 1h #xyz')).toMatchObject({ title: 'Raport 1h #xyz', estimateMin: null })
  })

  it('bez listy kategorii „#…” nigdy nie pasuje', () => {
    expect(parseQuickWords('Raport #anal', WED)).toMatchObject({ title: 'Raport #anal', categoryId: null })
  })

  it('dwa „#” – drugi (od końca) kończy szukanie i zostaje w tytule', () => {
    expect(words('Raport #zrodla #anal')).toMatchObject({ title: 'Raport #zrodla', categoryId: 'analiza' })
  })
})

describe('godzina po słowie dnia (D601)', () => {
  it('„@jutro 15:00” – dzień wykonania i minuta 900 dnia logicznego', () => {
    expect(words('Raport @jutro 15:00')).toMatchObject({ title: 'Raport', doDate: THU, startMin: 900, preview: 'Wykonać: jutro 15:00' })
  })

  it('samo „@15:00” = dziś o 15:00; „H:MM” też', () => {
    expect(words('Raport @15:00')).toMatchObject({ title: 'Raport', doDate: WED, startMin: 900 })
    expect(words('Raport @9:05')).toMatchObject({ doDate: WED, startMin: 545 })
    expect(words('Raport @pt 9:05')).toMatchObject({ doDate: FRI, startMin: 545 })
  })

  it('00:00–03:59 to noc po dacie (oś dnia logicznego, +1440)', () => {
    expect(words('Raport @jutro 01:30')).toMatchObject({ doDate: THU, startMin: 1530, preview: 'Wykonać: jutro 01:30 +1' })
    expect(words('Raport @jutro 04:00')).toMatchObject({ startMin: 240 })
    expect(words('Raport @jutro 00:00')).toMatchObject({ startMin: 1440 })
  })

  it('„25:00”, „24:00”, „15:60” nie są godziną – zostają w tytule', () => {
    for (const w of ['25:00', '24:00', '15:60']) {
      expect(words(`Raport @jutro ${w}`)).toMatchObject({ title: `Raport @jutro ${w}`, doDate: null, startMin: null })
    }
    expect(words('Raport @25:00')).toMatchObject({ title: 'Raport @25:00', doDate: null })
  })

  it('godzina bez słowa dnia przed nią zostaje w tytule', () => {
    expect(words('Spotkanie 15:00')).toMatchObject({ title: 'Spotkanie 15:00', doDate: null, startMin: null })
    expect(words('Spotkanie !jutro 15:00')).toMatchObject({ title: 'Spotkanie !jutro 15:00', dueDate: null })
    // Godzina musi stać zaraz po słowie dnia.
    expect(words('Raport @jutro 1h 15:00')).toMatchObject({ title: 'Raport @jutro 1h 15:00', doDate: null })
  })

  it('godzina i drugie „@” – drugie kończy szukanie', () => {
    expect(words('Raport @pt @jutro 15:00')).toMatchObject({ title: 'Raport @pt', doDate: THU, startMin: 900 })
    expect(words('Raport @jutro 15:00 @pt')).toMatchObject({ title: 'Raport @jutro 15:00', doDate: FRI, startMin: null })
  })
})

describe('wszystko razem', () => {
  it('„Raport @jutro 15:00 1h #anal” – tytuł, dzień, godzina, długość, kategoria; podgląd mówi wszystko', () => {
    const q = words('Raport @jutro 15:00 1h #anal')
    expect(q).toMatchObject({ title: 'Raport', dueDate: null, doDate: THU, startMin: 900, estimateMin: 60, categoryId: 'analiza', categoryName: 'Analiza' })
    expect(q.preview).toBe('Wykonać: jutro 15:00 · 1 h · Analiza')
  })

  it('kolejność dowolna', () => {
    const a = words('Raport #anal 1h30 !pt @jutro 15:00')
    expect(a).toMatchObject({ title: 'Raport', dueDate: FRI, doDate: THU, startMin: 900, estimateMin: 90, categoryId: 'analiza' })
    expect(a.preview).toBe('Termin: pt 13.11 · Wykonać: jutro 15:00 · 1 h 30 min · Analiza')
    expect(words('Raport 45m @dziś #zrodla')).toMatchObject({ title: 'Raport', doDate: WED, estimateMin: 45, categoryId: 'zrodla' })
  })

  it('każdy rodzaj najwyżej raz: druga długość zostaje w tytule', () => {
    expect(words('Raport 1h 30m')).toMatchObject({ title: 'Raport 1h', estimateMin: 30 })
  })

  it('same słowa – pusty tytuł (zapis odmówi)', () => {
    expect(words('@jutro 15:00 1h #anal').title).toBe('')
  })

  it('daty jak dotąd (D409): parseQuickDates nie bierze długości ani kategorii', () => {
    expect(parseQuickDates('Raport 1h #anal @jutro', WED)).toEqual({ title: 'Raport 1h #anal', dueDate: null, doDate: THU, preview: 'Wykonać: jutro' })
    expect(words('Zapłacić !jutro @dziś')).toMatchObject({ title: 'Zapłacić', dueDate: THU, doDate: WED, preview: 'Termin: jutro · Wykonać: dziś' })
  })

  it('quickPreview: bez dnia z procesu głównego – nic; z kategoriami – pełna linia', () => {
    expect(quickPreview('Raport @jutro 15:00', null, CATS)).toBeNull()
    expect(quickPreview('Raport @jutro 15:00 1h #anal', WED, CATS)).toBe('Wykonać: jutro 15:00 · 1 h · Analiza')
  })
})

describe('lista podkategorii dla „#…” (D600)', () => {
  it('kolejność drzewa Ustawień → Kategorie, bez zarchiwizowanych, nazwy z rd.categories', () => {
    const rd = rdFrom({ schema: 1, categories: { analiza: { name: 'Analiza rynku' }, nauka: { archived: true } } })
    const list = quickCategories(rd, WED)
    expect(list.map((c) => c.id)).toContain('analiza')
    expect(list.map((c) => c.id)).not.toContain('nauka')
    expect(list.find((c) => c.id === 'analiza')?.name).toBe('Analiza rynku')
    expect(list.length).toBe(DEFAULT_CATEGORIES.length - 1)
    expect(categoryOfWord('analiza', list)?.id).toBe('analiza')
  })
})

describe('powody, dla których blok nie stanął na osi (D601, D603)', () => {
  const at = (date: string, hh: number, mm = 0) => placeLogical(date, hh * 60 + mm)
  it('dzień minął; dziś – godzina przed bieżącą minutą; bieżąca minuta, późniejsza godzina i dalszy dzień stoją', () => {
    expect(notPlacedBefore('2026-11-10', 900, at(WED, 12))).toBe(NOT_PLACED.dayGone)
    expect(notPlacedBefore(WED, 11 * 60 + 59, at(WED, 12))).toBe(NOT_PLACED.hourGone)
    expect(notPlacedBefore(WED, 12 * 60, at(WED, 12))).toBeNull()
    expect(notPlacedBefore(WED, 13 * 60, at(WED, 12))).toBeNull()
    expect(notPlacedBefore(THU, 8 * 60, at(WED, 12))).toBeNull()
    // The night after the date (+1440) is later than any hour of the day.
    expect(notPlacedBefore(WED, 1500, at(WED, 23, 30))).toBeNull()
  })

  it('jedno brzmienie linii: „Zapisano: <tytuł> – nie postawiono na osi: <powód>”, bez „Skrzynki”; postawiona – „Dodano na oś”', () => {
    expect(quickSavedText('Raport', { notPlaced: NOT_PLACED.hourGone })).toBe('Zapisano: Raport – nie postawiono na osi: ta godzina już minęła')
    expect(quickSavedText('Raport', { placed: 'jutro 15:00' })).toBe('Dodano na oś: Raport – jutro 15:00')
    expect(quickSavedText('Raport')).toBe('Dodano do Skrzynki: Raport')
    // Waiting for the answer about the day's file (D601): never „Dodano na oś”.
    expect(quickSavedText('Raport', { asked: true, placed: 'jutro 15:00' })).toBe('Zapisano: Raport – czeka na odpowiedź o zmianie z innego komputera')
    expect(quickSavedText(`Zadzwonić ${'x'.repeat(100)}`, { notPlaced: NOT_PLACED.dayGone })).toBe(`Zapisano: Zadzwonić ${'x'.repeat(29)}… – nie postawiono na osi: ten dzień już minął`)
  })
})

describe('samo „@HH:MM” w nocy po dacie (D604)', () => {
  const NIGHT = 1530 // 01:30 of the night after the logical day
  it('godzina od 04:00 to następny dzień logiczny; przed 04:00 – ta noc; za dnia – dziś', () => {
    expect(parseQuickWords('Raport @15:00', WED, CATS, NIGHT)).toMatchObject({ doDate: THU, startMin: 900, preview: 'Wykonać: jutro 15:00' })
    expect(parseQuickWords('Raport @04:00', WED, CATS, NIGHT)).toMatchObject({ doDate: THU, startMin: 240 })
    expect(parseQuickWords('Raport @02:00', WED, CATS, NIGHT)).toMatchObject({ doDate: WED, startMin: 1560 })
    expect(parseQuickWords('Raport @01:00', WED, CATS, NIGHT)).toMatchObject({ doDate: WED, startMin: 1500 })
    expect(notPlacedBefore(WED, 1500, placeLogical(WED, NIGHT))).toBe(NOT_PLACED.hourGone)
    expect(notPlacedBefore(WED, 1560, placeLogical(WED, NIGHT))).toBeNull()
    expect(parseQuickWords('Raport @15:00', WED, CATS, 600)).toMatchObject({ doDate: WED, startMin: 900 })
    expect(parseQuickWords('Raport @15:00', WED, CATS)).toMatchObject({ doDate: WED, startMin: 900 })
  })

  it('słowo dnia z godziną nie zmienia się w nocy; quickPreview i quickNowMin zgodne z zapisem', () => {
    expect(parseQuickWords('Raport @dziś 15:00', WED, CATS, NIGHT)).toMatchObject({ doDate: WED, startMin: 900 })
    expect(parseQuickWords('Raport @jutro 15:00', WED, CATS, NIGHT)).toMatchObject({ doDate: THU, startMin: 900 })
    expect(quickPreview('Raport @15:00', WED, CATS, NIGHT)).toBe('Wykonać: jutro 15:00')
    expect(quickNowMin(WED, placeLogical(WED, NIGHT))).toBe(NIGHT)
    // A clock that is another day than the logical day given – not known, no night.
    expect(quickNowMin(WED, placeLogical('2026-11-20', 600))).toBeNull()
    // The logical day ends at 03:59 (1679); 04:05 of the next day is the next logical day's, not a night minute 1685.
    expect(quickNowMin(WED, placeLogical(WED, 1679))).toBe(1679)
    expect(quickNowMin(WED, placeLogical(THU, 245))).toBeNull()
  })
})

describe('lista „#…” bez nazw usuniętych kategorii (D600)', () => {
  it('podkategoria bez wpisu w rd.categories nie trafia na listę („kategoria usunięta” to nie słowo)', () => {
    const rd = rdFrom({ schema: 1 })
    expect(quickCategories(rd, WED).map((c) => c.id)).toContain('analiza')
    delete rd.categories.analiza
    const list = quickCategories(rd, WED)
    expect(list.map((c) => c.id)).not.toContain('analiza')
    expect(list.some((c) => c.name === 'kategoria usunięta')).toBe(false)
  })
})
