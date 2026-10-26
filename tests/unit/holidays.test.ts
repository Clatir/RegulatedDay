import { describe, expect, it, vi } from 'vitest'
import { HOLIDAY_EXCEPTIONS, MARKET_ZONE, easterSunday, marketDay, marketHolidays, type EarlyClose, type Market } from '@shared/calendar/holidays'

const MARKETS: Market[] = ['NYSE', 'CME_FX', 'UK', 'PL']

/** 'MM-DD' of a market's closed days in a year. */
const closedIn = (market: Market, year: number): string[] =>
  marketHolidays(market, `${year}-01-01`, `${year}-12-31`)
    .filter((d) => d.closed)
    .map((d) => d.date.slice(5))

/** 'MM-DD' of a market's shortened sessions in a year. */
const earlyIn = (market: Market, year: number): string[] =>
  marketHolidays(market, `${year}-01-01`, `${year}-12-31`)
    .filter((d) => d.earlyClose)
    .map((d) => d.date.slice(5))

/** Day of the week computed apart from the module: 0 = Sunday … 6 = Saturday. */
const weekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay()

const regular = (market: Market, date: string) => ({ market, date, closed: false, earlyClose: null, names: [] })
const closed = (market: Market, date: string, names: string[]) => ({ market, date, closed: true, earlyClose: null, names })
const shortened = (market: Market, date: string, earlyClose: EarlyClose, names: string[]) => ({ market, date, closed: false, earlyClose, names })

const NYSE_13 = { zone: 'America/New_York', hour: 13, minute: 0 }
const CME_12 = { zone: 'America/Chicago', hour: 12, minute: 0 }
const CME_1215 = { zone: 'America/Chicago', hour: 12, minute: 15 }
const LSE_1230 = { zone: 'Europe/London', hour: 12, minute: 30 }

/** The wall clock 'RRRR-MM-DD HH:MM' of an instant in a zone. */
function wall(at: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at)
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

/** A market's closing time on `date` shown in Polish time („CME zamyka o 19:15”). */
function inPolishTime(date: string, close: EarlyClose): string {
  const want = `${date} ${String(close.hour).padStart(2, '0')}:${String(close.minute).padStart(2, '0')}`
  const base = Date.parse(`${want.replace(' ', 'T')}:00Z`)
  for (let h = -14; h <= 14; h++) {
    const at = base - h * 3_600_000
    if (wall(at, close.zone) === want) return wall(at, 'Europe/Warsaw').slice(11)
  }
  throw new Error(`no ${want} in ${close.zone}`)
}

describe('Wielkanoc (algorytm anonimowy, kalendarz gregoriański)', () => {
  it('daty 2024–2030', () => {
    expect([2024, 2025, 2026, 2027, 2028, 2029, 2030].map(easterSunday)).toEqual([
      '2024-03-31',
      '2025-04-20',
      '2026-04-05',
      '2027-03-28',
      '2028-04-16',
      '2029-04-01',
      '2030-04-21'
    ])
  })

  it('lata skrajne i zawsze niedziela między 22.03 a 25.04 (2000–2100)', () => {
    expect([2000, 2008, 2011, 2038, 2100].map(easterSunday)).toEqual(['2000-04-23', '2008-03-23', '2011-04-24', '2038-04-25', '2100-03-28'])
    for (let y = 2000; y <= 2100; y++) {
      const easter = easterSunday(y)
      expect(weekday(easter)).toBe(0)
      expect(easter.slice(5) >= '03-22' && easter.slice(5) <= '04-25').toBe(true)
    }
  })

  it('rok spoza kalendarza gregoriańskiego jest odrzucany', () => {
    expect(() => easterSunday(1500)).toThrow(RangeError)
    expect(() => easterSunday(2026.5)).toThrow(RangeError)
  })
})

describe('NYSE', () => {
  it('pełna lista 2026', () => {
    expect(closedIn('NYSE', 2026)).toEqual(['01-01', '01-19', '02-16', '04-03', '05-25', '06-19', '07-03', '09-07', '11-26', '12-25'])
    expect(earlyIn('NYSE', 2026)).toEqual(['11-27', '12-24'])
  })

  it('pełna lista 2027', () => {
    expect(closedIn('NYSE', 2027)).toEqual(['01-01', '01-18', '02-15', '03-26', '05-31', '06-18', '07-05', '09-06', '11-25', '12-24'])
    expect(earlyIn('NYSE', 2027)).toEqual(['11-26'])
  })

  it('2025 z żałobą narodową 9.01 (wyjątek) i trzema skróconymi sesjami', () => {
    expect(closedIn('NYSE', 2025)).toEqual(['01-01', '01-09', '01-20', '02-17', '04-18', '05-26', '06-19', '07-04', '09-01', '11-27', '12-25'])
    expect(earlyIn('NYSE', 2025)).toEqual(['07-03', '11-28', '12-24'])
    expect(marketDay('NYSE', '2025-01-09')).toEqual(closed('NYSE', '2025-01-09', ['Żałoba narodowa po Jimmym Carterze']))
  })

  it('otwarta 31.12.2027 mimo soboty 1.01.2028 – Nowy Rok w sobotę nie ma dnia zastępczego', () => {
    expect(weekday('2028-01-01')).toBe(6)
    expect(marketDay('NYSE', '2027-12-31')).toEqual(regular('NYSE', '2027-12-31'))
    expect(marketDay('NYSE', '2028-01-01')).toEqual(closed('NYSE', '2028-01-01', []))
    expect(marketHolidays('NYSE', '2027-12-01', '2028-01-31').map((d) => d.date)).toEqual(['2027-12-24', '2028-01-17'])
    expect(marketDay('NYSE', '2021-12-31')).toEqual(regular('NYSE', '2021-12-31'))
  })

  it('Nowy Rok w niedzielę – zamknięta w poniedziałek 2.01', () => {
    expect(weekday('2023-01-01')).toBe(0)
    expect(marketDay('NYSE', '2023-01-02')).toEqual(closed('NYSE', '2023-01-02', ['Nowy Rok (obchodzony)']))
  })

  it('Juneteenth 2027 w sobotę – zamknięta w piątek 18.06.2027; święto giełdy od 2022', () => {
    expect(weekday('2027-06-19')).toBe(6)
    expect(marketDay('NYSE', '2027-06-18')).toEqual(closed('NYSE', '2027-06-18', ['Juneteenth (obchodzony)']))
    expect(marketDay('NYSE', '2027-06-19')).toEqual(closed('NYSE', '2027-06-19', []))
    expect(marketDay('NYSE', '2021-06-18')).toEqual(regular('NYSE', '2021-06-18'))
    expect(marketDay('NYSE', '2022-06-20')).toEqual(closed('NYSE', '2022-06-20', ['Juneteenth (obchodzony)']))
  })

  it('24.12.2027 zamknięta – Boże Narodzenie w sobotę obchodzone w piątek', () => {
    expect(weekday('2027-12-25')).toBe(6)
    expect(marketDay('NYSE', '2027-12-24')).toEqual(closed('NYSE', '2027-12-24', ['Boże Narodzenie (obchodzony)']))
  })

  it('Dzień Niepodległości 2026 w sobotę – zamknięta w piątek 3.07, bez skróconego 2.07', () => {
    expect(weekday('2026-07-04')).toBe(6)
    expect(marketDay('NYSE', '2026-07-03')).toEqual(closed('NYSE', '2026-07-03', ['Dzień Niepodległości USA (obchodzony)']))
    expect(marketDay('NYSE', '2026-07-02')).toEqual(regular('NYSE', '2026-07-02'))
  })

  it('skrócone sesje do 13:00 czasu Nowego Jorku', () => {
    expect(marketDay('NYSE', '2026-11-27')).toEqual(shortened('NYSE', '2026-11-27', NYSE_13, ['Dzień po Święcie Dziękczynienia']))
    expect(marketDay('NYSE', '2026-12-24')).toEqual(shortened('NYSE', '2026-12-24', NYSE_13, ['Wigilia']))
    expect(marketDay('NYSE', '2025-07-03')).toEqual(shortened('NYSE', '2025-07-03', NYSE_13, ['Przed Dniem Niepodległości USA']))
    expect(marketDay('NYSE', '2023-07-03')).toEqual(shortened('NYSE', '2023-07-03', NYSE_13, ['Przed Dniem Niepodległości USA']))
    // 3.07 on a Saturday, 24.12 on a Saturday: no shortened Friday before.
    expect(marketDay('NYSE', '2027-07-02')).toEqual(regular('NYSE', '2027-07-02'))
    expect(marketDay('NYSE', '2022-12-23')).toEqual(regular('NYSE', '2022-12-23'))
  })

  it('wyjątki: 11.09.2001, huragan Sandy', () => {
    expect(closedIn('NYSE', 2001).filter((d) => d.startsWith('09-'))).toEqual(['09-03', '09-11', '09-12', '09-13', '09-14'])
    expect(closedIn('NYSE', 2012).filter((d) => d.startsWith('10-'))).toEqual(['10-29', '10-30'])
  })

  it('liczba dni zamkniętych 2000–2100: 9, od 2022 10, mniej o Nowy Rok w sobotę, więcej o wyjątki', () => {
    for (let y = 2000; y <= 2100; y++) {
      const extra = HOLIDAY_EXCEPTIONS.filter((r) => r.market === 'NYSE' && r.closed && r.date.startsWith(`${y}-`)).length
      expect(closedIn('NYSE', y).length).toBe((y >= 2022 ? 10 : 9) - (weekday(`${y}-01-01`) === 6 ? 1 : 0) + extra)
    }
  })
})

describe('CME FX', () => {
  it('Wielki Piątek zamknięty w CME i NYSE (2026–2028)', () => {
    for (const date of ['2026-04-03', '2027-03-26', '2028-04-14']) {
      expect(weekday(date)).toBe(5)
      expect(marketDay('CME_FX', date)).toEqual(closed('CME_FX', date, ['Wielki Piątek']))
      expect(marketDay('NYSE', date)).toEqual(closed('NYSE', date, ['Wielki Piątek']))
    }
  })

  it('27.11.2026 zamyka o 12:15 czasu Chicago, czyli o 19:15 polskiego (przykład ze specyfikacji)', () => {
    const day = marketDay('CME_FX', '2026-11-27')
    expect(day).toEqual(shortened('CME_FX', '2026-11-27', CME_1215, ['Dzień po Święcie Dziękczynienia']))
    expect(day.earlyClose && inPolishTime(day.date, day.earlyClose)).toBe('19:15')
  })

  it('26.11.2026 (Święto Dziękczynienia) – handel do 12:00 czasu Chicago, dzień otwarty', () => {
    expect(marketDay('CME_FX', '2026-11-26')).toEqual(shortened('CME_FX', '2026-11-26', CME_12, ['Święto Dziękczynienia']))
  })

  it('pełna lista 2026', () => {
    expect(closedIn('CME_FX', 2026)).toEqual(['01-01', '04-03', '12-25'])
    expect(earlyIn('CME_FX', 2026)).toEqual(['01-19', '02-16', '05-25', '06-19', '07-03', '09-07', '11-26', '11-27', '12-24'])
    expect(marketDay('CME_FX', '2026-12-24')).toEqual(shortened('CME_FX', '2026-12-24', CME_1215, ['Wigilia']))
  })

  it('Nowy Rok i Boże Narodzenie obchodzone jak w NYSE', () => {
    expect(marketDay('CME_FX', '2027-12-24')).toEqual(closed('CME_FX', '2027-12-24', ['Boże Narodzenie (obchodzony)']))
    expect(marketDay('CME_FX', '2027-12-31')).toEqual(regular('CME_FX', '2027-12-31'))
    expect(marketDay('CME_FX', '2023-01-02')).toEqual(closed('CME_FX', '2023-01-02', ['Nowy Rok (obchodzony)']))
  })

  it('każde inne święto NYSE to w CME wcześniejszy koniec o 12:00 (2022–2030)', () => {
    const cmeClosed = ['Nowy Rok', 'Wielki Piątek', 'Boże Narodzenie']
    const oneOff = new Set(HOLIDAY_EXCEPTIONS.map((r) => `${r.market} ${r.date}`))
    for (let y = 2022; y <= 2030; y++) {
      for (const nyse of marketHolidays('NYSE', `${y}-01-01`, `${y}-12-31`)) {
        if (!nyse.closed || oneOff.has(`NYSE ${nyse.date}`)) continue
        const cme = marketDay('CME_FX', nyse.date)
        expect(cme.names).toEqual(nyse.names)
        const name = (nyse.names[0] ?? '').replace(' (obchodzony)', '')
        if (cmeClosed.includes(name)) expect(cme.closed).toBe(true)
        else expect([cme.closed, cme.earlyClose]).toEqual([false, CME_12])
      }
    }
  })
})

describe('Wielka Brytania (LSE)', () => {
  it('2026: dni wolne (Boxing Day w sobotę → 28.12) i pół dnia sesji 24.12 i 31.12', () => {
    expect(closedIn('UK', 2026)).toEqual(['01-01', '04-03', '04-06', '05-04', '05-25', '08-31', '12-25', '12-28'])
    expect(marketDay('UK', '2026-12-28')).toEqual(closed('UK', '2026-12-28', ['Drugi dzień świąt (Boxing Day) (obchodzony)']))
    expect(marketDay('UK', '2026-12-26')).toEqual(closed('UK', '2026-12-26', []))
    expect(marketDay('UK', '2026-12-24')).toEqual(shortened('UK', '2026-12-24', LSE_1230, ['Wigilia']))
    expect(marketDay('UK', '2026-12-31')).toEqual(shortened('UK', '2026-12-31', LSE_1230, ['Sylwester']))
  })

  it('27.12 i 28.12.2027 – święta w weekend, dni zastępcze; także 2021, 2022 i 2023', () => {
    const december = (y: number) => closedIn('UK', y).filter((d) => d.startsWith('12-'))
    expect(december(2027)).toEqual(['12-27', '12-28'])
    expect(marketDay('UK', '2027-12-27').names).toEqual(['Boże Narodzenie (obchodzony)'])
    expect(marketDay('UK', '2027-12-28').names).toEqual(['Drugi dzień świąt (Boxing Day) (obchodzony)'])
    expect(december(2021)).toEqual(['12-27', '12-28'])
    // 25.12.2022 on a Sunday: Boxing Day keeps Monday 26, Christmas moves to Tuesday 27.
    expect(december(2022)).toEqual(['12-26', '12-27'])
    expect(marketDay('UK', '2022-12-26').names).toEqual(['Drugi dzień świąt (Boxing Day)'])
    expect(marketDay('UK', '2022-12-27').names).toEqual(['Boże Narodzenie (obchodzony)'])
    expect(december(2023)).toEqual(['12-25', '12-26'])
  })

  it('Nowy Rok w weekend – najbliższy poniedziałek', () => {
    expect(marketDay('UK', '2022-01-03')).toEqual(closed('UK', '2022-01-03', ['Nowy Rok (obchodzony)']))
    expect(marketDay('UK', '2023-01-02')).toEqual(closed('UK', '2023-01-02', ['Nowy Rok (obchodzony)']))
  })

  it('wyjątki: jubileusze, ślub, pogrzeb, koronacja i przeniesione bank holidays', () => {
    expect(closedIn('UK', 2022)).toEqual(['01-03', '04-15', '04-18', '05-02', '06-02', '06-03', '08-29', '09-19', '12-26', '12-27'])
    expect(marketDay('UK', '2022-05-30')).toEqual(regular('UK', '2022-05-30'))
    expect(marketDay('UK', '2022-06-02')).toEqual(closed('UK', '2022-06-02', ['Spring bank holiday (przeniesiony)']))
    expect(marketDay('UK', '2023-05-08').closed).toBe(true)
    expect(marketDay('UK', '2020-05-04')).toEqual(regular('UK', '2020-05-04'))
    expect(marketDay('UK', '2020-05-08').closed).toBe(true)
    expect(marketDay('UK', '2012-05-28')).toEqual(regular('UK', '2012-05-28'))
    expect([marketDay('UK', '2012-06-04').closed, marketDay('UK', '2012-06-05').closed]).toEqual([true, true])
    expect(marketDay('UK', '2011-04-29').closed).toBe(true)
    expect(marketDay('UK', '2002-05-27')).toEqual(regular('UK', '2002-05-27'))
    expect([marketDay('UK', '2002-06-03').closed, marketDay('UK', '2002-06-04').closed]).toEqual([true, true])
  })

  it('osiem dni wolnych rocznie (2000–2100), poza latami wyjątków', () => {
    const extra: Record<number, number> = { 2002: 1, 2011: 1, 2012: 1, 2022: 2, 2023: 1 }
    for (let y = 2000; y <= 2100; y++) expect(closedIn('UK', y).length).toBe(8 + (extra[y] ?? 0))
  })
})

describe('Polska', () => {
  it('2026: wszystkie dni wolne, w tym 24.12; nigdy skrócona sesja', () => {
    expect(closedIn('PL', 2026)).toEqual(['01-01', '01-06', '04-05', '04-06', '05-01', '05-03', '05-24', '06-04', '08-15', '11-01', '11-11', '12-24', '12-25', '12-26'])
    expect(earlyIn('PL', 2026)).toEqual([])
  })

  it('Wigilia wolna od 2025: 24.12.2026 tak, 24.12.2024 nie', () => {
    expect(marketDay('PL', '2026-12-24')).toEqual(closed('PL', '2026-12-24', ['Wigilia']))
    expect(marketDay('PL', '2024-12-24')).toEqual(regular('PL', '2024-12-24'))
  })

  it('Boże Ciało 2026: czwartek 4.06', () => {
    expect(weekday('2026-06-04')).toBe(4)
    expect(marketDay('PL', '2026-06-04')).toEqual(closed('PL', '2026-06-04', ['Boże Ciało']))
  })

  it('święto w sobotę bez dnia zastępczego; zwykła niedziela nie jest świętem, Wielkanoc jest', () => {
    expect(weekday('2026-08-15')).toBe(6)
    expect(marketDay('PL', '2026-08-15')).toEqual(closed('PL', '2026-08-15', ['Wniebowzięcie NMP']))
    expect(marketDay('PL', '2026-08-14')).toEqual(regular('PL', '2026-08-14'))
    expect(marketDay('PL', '2026-08-17')).toEqual(regular('PL', '2026-08-17'))
    expect(weekday('2026-10-25')).toBe(0)
    expect(marketDay('PL', '2026-10-25')).toEqual(regular('PL', '2026-10-25'))
    expect(marketDay('PL', '2026-04-05')).toEqual(closed('PL', '2026-04-05', ['Wielkanoc']))
  })

  it('Trzech Króli od 2011', () => {
    expect(marketDay('PL', '2010-01-06')).toEqual(regular('PL', '2010-01-06'))
    expect(marketDay('PL', '2011-01-06')).toEqual(closed('PL', '2011-01-06', ['Trzech Króli']))
  })

  it('liczba dni wolnych 2000–2100: 12, od 2011 13, od 2025 14', () => {
    for (let y = 2000; y <= 2100; y++) expect(closedIn('PL', y).length).toBe(12 + (y >= 2011 ? 1 : 0) + (y >= 2025 ? 1 : 0))
  })
})

describe('weekendy, zakres i dane wejściowe', () => {
  it('weekend zamknięty na NYSE, CME i w Wielkiej Brytanii, bez nazw', () => {
    for (const market of ['NYSE', 'CME_FX', 'UK'] as const) {
      expect(marketDay(market, '2026-10-24')).toEqual(closed(market, '2026-10-24', []))
      expect(marketDay(market, '2026-10-25')).toEqual(closed(market, '2026-10-25', []))
    }
  })

  it('NYSE, CME i LSE mają święta i skrócone sesje tylko w dni robocze (2000–2100)', () => {
    for (const market of ['NYSE', 'CME_FX', 'UK'] as const) {
      for (const day of marketHolidays(market, '2000-01-01', '2100-12-31')) {
        expect([day.date, weekday(day.date) >= 1 && weekday(day.date) <= 5]).toEqual([day.date, true])
        expect(day.names.length).toBeGreaterThan(0)
      }
    }
  })

  it('marketHolidays: zakres domknięty i posortowany, także przez granicę roku', () => {
    expect(marketHolidays('NYSE', '2026-11-26', '2027-01-18').map((d) => d.date)).toEqual(['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2027-01-01', '2027-01-18'])
    for (const market of MARKETS) {
      const dates = marketHolidays(market, '2025-01-01', '2028-12-31').map((d) => d.date)
      expect(dates).toEqual([...new Set(dates)].sort())
    }
    expect(marketHolidays('PL', '2026-12-26', '2026-12-25')).toEqual([])
    expect(marketHolidays('PL', '2026-10-24', '2026-10-25')).toEqual([])
  })

  it('błędna data jest odrzucana', () => {
    expect(() => marketDay('NYSE', '2026-02-30')).toThrow(RangeError)
    expect(() => marketDay('NYSE', '2026-1-1')).toThrow(RangeError)
    expect(() => marketHolidays('PL', 'jutro', '2026-12-31')).toThrow(RangeError)
  })

  it('zwracane nazwy i godziny to kopie – zmiana wyniku nie psuje kalendarza', () => {
    marketDay('PL', '2026-12-25').names.push('x')
    expect(marketDay('PL', '2026-12-25').names).toEqual(['Boże Narodzenie'])
    const early = marketDay('NYSE', '2026-11-27').earlyClose
    if (early) early.hour = 0
    expect(marketDay('NYSE', '2026-11-27').earlyClose).toEqual(NYSE_13)
  })
})

describe('lista wyjątków', () => {
  it('prawdziwe daty, dni robocze (poza PL), bez powtórzeń, godziny w strefie rynku', () => {
    const seen = new Set<string>()
    for (const row of HOLIDAY_EXCEPTIONS) {
      const day = marketDay(row.market, row.date)
      if (row.market !== 'PL') expect([row.date, weekday(row.date) >= 1 && weekday(row.date) <= 5]).toEqual([row.date, true])
      if (row.earlyClose) expect(row.earlyClose.zone).toBe(MARKET_ZONE[row.market])
      expect(day.closed).toBe(row.closed)
      expect(seen.has(`${row.market} ${row.date}`)).toBe(false)
      seen.add(`${row.market} ${row.date}`)
    }
  })
})

describe('strefa komputera i szybkość', () => {
  it('wynik nie zależy od strefy czasowej komputera', async () => {
    const expected = MARKETS.map((m) => marketHolidays(m, '2026-01-01', '2028-12-31'))
    const easters = Array.from({ length: 101 }, (_, i) => easterSunday(2000 + i))
    const saved = process.env.TZ
    try {
      for (const [zone, hour] of [
        ['America/Los_Angeles', 16],
        ['Pacific/Kiritimati', 14]
      ] as const) {
        process.env.TZ = zone
        expect(new Date(Date.UTC(2026, 0, 1)).getHours()).toBe(hour) // the machine's zone did change
        vi.resetModules()
        const fresh = await import('@shared/calendar/holidays')
        expect(MARKETS.map((m) => fresh.marketHolidays(m, '2026-01-01', '2028-12-31'))).toEqual(expected)
        expect(Array.from({ length: 101 }, (_, i) => fresh.easterSunday(2000 + i))).toEqual(easters)
      }
    } finally {
      if (saved === undefined) delete process.env.TZ
      else process.env.TZ = saved
    }
  })

  it('3 lata × 365 dni × 4 rynki marketDay – wyraźnie poniżej 200 ms (bez gotowej pamięci)', async () => {
    vi.resetModules()
    const fresh = await import('@shared/calendar/holidays')
    const dates = Array.from({ length: 3 * 365 }, (_, i) => new Date(Date.UTC(2040, 0, 1 + i)).toISOString().slice(0, 10))
    const start = performance.now()
    let shut = 0
    for (const market of MARKETS) for (const date of dates) if (fresh.marketDay(market, date).closed) shut++
    const ms = performance.now() - start
    expect(shut).toBeGreaterThan(3 * 3 * 104)
    expect(ms).toBeLessThan(200)
  })
})
