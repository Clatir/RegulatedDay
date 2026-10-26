/**
 * The built-in holiday calendar of the trading sessions (spec „Sesje tradingowe”: „Wbudowany kalendarz świąt działa bez
 * sieci”): the US markets per NYSE and the CME Globex FX calendar, with their shortened sessions („dni skróconej sesji”);
 * the United Kingdom (London Stock Exchange = the England & Wales bank holidays, plus its half days); Poland (public
 * holidays, „razem z 24.12”). The rules are computed for any year (those in force from 2000 on, checked for 2000–2100);
 * one-off closures and openings are rows of HOLIDAY_EXCEPTIONS („Reguły i listę wyjątków aktualizuje każde wydanie”).
 * Pure and offline: dates are 'RRRR-MM-DD' and all arithmetic is in UTC, so the machine's own zone never matters.
 */

export type Market = 'NYSE' | 'CME_FX' | 'UK' | 'PL'

/** A market's local closing time on a shortened day, in that market's own zone (IANA name). */
export interface EarlyClose {
  zone: string
  hour: number
  minute: number
}

export interface MarketDay {
  market: Market
  date: string
  /** Weekend days count as closed for NYSE/CME_FX/UK (no names then); PL: closed = a public holiday (Sundays are not listed as holidays). */
  closed: boolean
  /** A shortened session (null when closed or regular). */
  earlyClose: EarlyClose | null
  /** Polish names of the holidays that fall on or are observed on this date (empty for a plain weekend). */
  names: string[]
}

/** The zone each market's dates and closing times belong to. */
export const MARKET_ZONE: Readonly<Record<Market, string>> = {
  NYSE: 'America/New_York',
  CME_FX: 'America/Chicago',
  UK: 'Europe/London',
  PL: 'Europe/Warsaw'
}

/** One exception row: `closed` closes the date, `earlyClose` shortens it, neither = a regular day despite the rules. */
export interface HolidayException {
  market: Market
  date: string
  closed: boolean
  earlyClose?: EarlyClose
  name: string
}

/**
 * One-off closures and openings no rule knows (national days of mourning, jubilees, a bank holiday moved for one): a row
 * replaces whatever the rules give for its date; the `name` of an opening row only says why. A later release adds rows.
 * CME_FX has none on purpose – only a closure CME itself announced belongs here.
 */
export const HOLIDAY_EXCEPTIONS: ReadonlyArray<HolidayException> = [
  // NYSE: the attacks of 11.09.2001, national days of mourning, Hurricane Sandy.
  { market: 'NYSE', date: '2001-09-11', closed: true, name: 'Zamachy z 11 września' },
  { market: 'NYSE', date: '2001-09-12', closed: true, name: 'Zamachy z 11 września' },
  { market: 'NYSE', date: '2001-09-13', closed: true, name: 'Zamachy z 11 września' },
  { market: 'NYSE', date: '2001-09-14', closed: true, name: 'Zamachy z 11 września' },
  { market: 'NYSE', date: '2004-06-11', closed: true, name: 'Żałoba narodowa po Ronaldzie Reaganie' },
  { market: 'NYSE', date: '2007-01-02', closed: true, name: 'Żałoba narodowa po Geraldzie Fordzie' },
  { market: 'NYSE', date: '2012-10-29', closed: true, name: 'Huragan Sandy' },
  { market: 'NYSE', date: '2012-10-30', closed: true, name: 'Huragan Sandy' },
  { market: 'NYSE', date: '2018-12-05', closed: true, name: 'Żałoba narodowa po George’u H. W. Bushu' },
  { market: 'NYSE', date: '2025-01-09', closed: true, name: 'Żałoba narodowa po Jimmym Carterze' },
  // UK: special bank holidays, and the regular ones moved to make room for them.
  { market: 'UK', date: '2002-05-27', closed: false, name: 'Spring bank holiday przeniesiony na 4.06 (Złoty Jubileusz)' },
  { market: 'UK', date: '2002-06-03', closed: true, name: 'Złoty Jubileusz królowej Elżbiety II' },
  { market: 'UK', date: '2002-06-04', closed: true, name: 'Spring bank holiday (przeniesiony)' },
  { market: 'UK', date: '2011-04-29', closed: true, name: 'Ślub księcia Williama' },
  { market: 'UK', date: '2012-05-28', closed: false, name: 'Spring bank holiday przeniesiony na 4.06 (Diamentowy Jubileusz)' },
  { market: 'UK', date: '2012-06-04', closed: true, name: 'Spring bank holiday (przeniesiony)' },
  { market: 'UK', date: '2012-06-05', closed: true, name: 'Diamentowy Jubileusz królowej Elżbiety II' },
  { market: 'UK', date: '2020-05-04', closed: false, name: 'Early May bank holiday przeniesiony na 8.05 (Dzień Zwycięstwa)' },
  { market: 'UK', date: '2020-05-08', closed: true, name: 'Early May bank holiday (przeniesiony – 75. rocznica Dnia Zwycięstwa)' },
  { market: 'UK', date: '2022-05-30', closed: false, name: 'Spring bank holiday przeniesiony na 2.06 (Platynowy Jubileusz)' },
  { market: 'UK', date: '2022-06-02', closed: true, name: 'Spring bank holiday (przeniesiony)' },
  { market: 'UK', date: '2022-06-03', closed: true, name: 'Platynowy Jubileusz królowej Elżbiety II' },
  { market: 'UK', date: '2022-09-19', closed: true, name: 'Pogrzeb królowej Elżbiety II' },
  { market: 'UK', date: '2023-05-08', closed: true, name: 'Koronacja króla Karola III' }
]

// ---- Calendar arithmetic: whole days since 1970-01-01, in UTC ----

const DAY_MS = 86_400_000
const SUN = 0
const MON = 1
const THU = 4
const SAT = 6

/** Days since 1970-01-01 of a calendar date (Date.UTC rolls over: day 0 of a month is the last day of the one before). */
const dayNumber = (y: number, month: number, d: number): number => Date.UTC(y, month - 1, d) / DAY_MS

/** The 'RRRR-MM-DD' of a day number. */
const isoOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7

const isWeekend = (day: number): boolean => weekdayOf(day) === SAT || weekdayOf(day) === SUN

const isMonToThu = (day: number): boolean => weekdayOf(day) >= MON && weekdayOf(day) <= THU

/** The n-th (from 1) given weekday of a month: the 3rd Monday of January = nthWeekday(y, 1, MON, 3). */
function nthWeekday(y: number, month: number, weekday: number, n: number): number {
  const first = dayNumber(y, month, 1)
  return first + ((weekday - weekdayOf(first) + 7) % 7) + 7 * (n - 1)
}

/** The last given weekday of a month. */
function lastWeekday(y: number, month: number, weekday: number): number {
  const last = dayNumber(y, month + 1, 0)
  return last - ((weekdayOf(last) - weekday + 7) % 7)
}

/** Easter Sunday as a day number: the anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easterDay(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return dayNumber(year, Math.floor(n / 31), (n % 31) + 1)
}

/** Easter Sunday of a Gregorian year (1583–9999) as 'RRRR-MM-DD'. */
export function easterSunday(year: number): string {
  if (!Number.isInteger(year) || year < 1583 || year > 9999) throw new RangeError(`Not a Gregorian year: ${year}`)
  return isoOf(easterDay(year))
}

// ---- The rules of each market for one year ----

/** Records a holiday (no `earlyClose`) or a shortened session on a day of the year being built. */
type Put = (day: number, name: string, earlyClose?: EarlyClose) => void

const OBSERVED = ' (obchodzony)'

const NYSE_EARLY: EarlyClose = { zone: MARKET_ZONE.NYSE, hour: 13, minute: 0 }
/** CME Globex FX on a US holiday other than New Year, Good Friday and Christmas: trading halts early, no settlement. */
const CME_HALT: EarlyClose = { zone: MARKET_ZONE.CME_FX, hour: 12, minute: 0 }
const CME_EARLY: EarlyClose = { zone: MARKET_ZONE.CME_FX, hour: 12, minute: 15 }
const LSE_HALF: EarlyClose = { zone: MARKET_ZONE.UK, hour: 12, minute: 30 }

/** A US holiday on a Saturday is observed the Friday before, on a Sunday the Monday after (NYSE Rule 7.2). */
function usObserved(day: number): number {
  const wd = weekdayOf(day)
  return wd === SAT ? day - 1 : wd === SUN ? day + 1 : day
}

/** Thanksgiving: the 4th Thursday of November. */
const thanksgiving = (y: number): number => nthWeekday(y, 11, THU, 4)

interface UsHoliday {
  day: number
  name: string
  /** CME Globex FX is closed that day; otherwise it halts early at 12:00 CT. */
  cmeClosed: boolean
}

/** The NYSE holidays of a year on their observed dates (shared by NYSE and CME_FX). */
function usHolidays(y: number): UsHoliday[] {
  const list: UsHoliday[] = []
  const add = (actual: number, name: string, cmeClosed = false): void => {
    const day = usObserved(actual)
    list.push({ day, name: day === actual ? name : name + OBSERVED, cmeClosed })
  }
  // New Year's Day: on a Sunday observed Monday 2.01; on a Saturday no make-up day – 31.12 of the year before stays open.
  const newYear = dayNumber(y, 1, 1)
  if (weekdayOf(newYear) !== SAT) add(newYear, 'Nowy Rok', true)
  add(nthWeekday(y, 1, MON, 3), 'Dzień Martina Luthera Kinga') // 3rd Monday of January
  add(nthWeekday(y, 2, MON, 3), 'Dzień Prezydentów') // Washington's Birthday, 3rd Monday of February
  add(easterDay(y) - 2, 'Wielki Piątek', true) // Good Friday
  add(lastWeekday(y, 5, MON), 'Memorial Day') // last Monday of May
  if (y >= 2022) add(dayNumber(y, 6, 19), 'Juneteenth') // 19.06, a NYSE holiday from 2022
  add(dayNumber(y, 7, 4), 'Dzień Niepodległości USA') // 4.07
  add(nthWeekday(y, 9, MON, 1), 'Labor Day') // 1st Monday of September
  add(thanksgiving(y), 'Święto Dziękczynienia')
  add(dayNumber(y, 12, 25), 'Boże Narodzenie', true) // 25.12 (on a Saturday observed Friday 24.12)
  return list
}

/**
 * NYSE (America/New_York): closed on the US holidays above; closes at 13:00 ET on 3.07 when it is Monday–Thursday
 * (4.07 on Tuesday–Friday), on the day after Thanksgiving, and on 24.12 when it is Monday–Thursday (a Friday 24.12 is
 * the observed Christmas – closed).
 */
function nyseRules(y: number, put: Put): void {
  for (const h of usHolidays(y)) put(h.day, h.name)
  const jul3 = dayNumber(y, 7, 3)
  if (isMonToThu(jul3)) put(jul3, 'Przed Dniem Niepodległości USA', NYSE_EARLY)
  put(thanksgiving(y) + 1, 'Dzień po Święcie Dziękczynienia', NYSE_EARLY)
  const dec24 = dayNumber(y, 12, 24)
  if (isMonToThu(dec24)) put(dec24, 'Wigilia', NYSE_EARLY)
}

/**
 * CME Globex FX futures (America/Chicago): closed on New Year's Day, Good Friday and Christmas (observed as at NYSE);
 * on the other NYSE holidays trading halts at 12:00 CT (open, shortened); closes at 12:15 CT on the day after
 * Thanksgiving and on 24.12 when it is Monday–Thursday.
 */
function cmeRules(y: number, put: Put): void {
  for (const h of usHolidays(y)) put(h.day, h.name, h.cmeClosed ? undefined : CME_HALT)
  put(thanksgiving(y) + 1, 'Dzień po Święcie Dziękczynienia', CME_EARLY)
  const dec24 = dayNumber(y, 12, 24)
  if (isMonToThu(dec24)) put(dec24, 'Wigilia', CME_EARLY)
}

/**
 * England & Wales substitute days: a holiday on a weekday keeps its date; one on a weekend moves to the first weekday
 * after it not taken by the group. So 25.12 on Saturday → Monday 27 and Boxing Day → Tuesday 28; 25.12 on Sunday →
 * Tuesday 27, Boxing Day keeps Monday 26; Boxing Day on Saturday → Monday 28.
 */
function ukSubstitutes(put: Put, group: ReadonlyArray<readonly [number, string]>): void {
  const taken = new Set(group.filter(([day]) => !isWeekend(day)).map(([day]) => day))
  for (const [day, name] of group) {
    if (!isWeekend(day)) {
      put(day, name)
      continue
    }
    let sub = day + 1
    while (isWeekend(sub) || taken.has(sub)) sub++
    taken.add(sub)
    put(sub, name + OBSERVED)
  }
}

/**
 * London Stock Exchange (Europe/London): closed on the England & Wales bank holidays – New Year's Day, Good Friday,
 * Easter Monday, the early May (1st Monday of May), spring (last Monday of May) and summer (last Monday of August) bank
 * holidays, Christmas and Boxing Day, with substitute days; half days closing at 12:30 on 24.12 and 31.12 when they
 * are weekdays.
 */
function ukRules(y: number, put: Put): void {
  const easter = easterDay(y)
  ukSubstitutes(put, [[dayNumber(y, 1, 1), 'Nowy Rok']])
  put(easter - 2, 'Wielki Piątek')
  put(easter + 1, 'Poniedziałek Wielkanocny')
  put(nthWeekday(y, 5, MON, 1), 'Early May bank holiday')
  put(lastWeekday(y, 5, MON), 'Spring bank holiday')
  put(lastWeekday(y, 8, MON), 'Summer bank holiday')
  ukSubstitutes(put, [
    [dayNumber(y, 12, 25), 'Boże Narodzenie'],
    [dayNumber(y, 12, 26), 'Drugi dzień świąt (Boxing Day)']
  ])
  for (const [d, name] of [
    [24, 'Wigilia'],
    [31, 'Sylwester']
  ] as const) {
    const day = dayNumber(y, 12, d)
    if (!isWeekend(day)) put(day, name, LSE_HALF)
  }
}

/**
 * Poland (Europe/Warsaw): the public holidays („dni wolne od pracy”), each on its own date – one on a Saturday or a
 * Sunday has no make-up day here. Trzech Króli from 2011, Wigilia from 2025; Easter-based: Wielkanoc, Poniedziałek
 * Wielkanocny (+1), Zielone Świątki (+49), Boże Ciało (+60).
 */
function plRules(y: number, put: Put): void {
  const on = (month: number, d: number, name: string): void => put(dayNumber(y, month, d), name)
  const easter = easterDay(y)
  on(1, 1, 'Nowy Rok')
  if (y >= 2011) on(1, 6, 'Trzech Króli')
  put(easter, 'Wielkanoc')
  put(easter + 1, 'Poniedziałek Wielkanocny')
  on(5, 1, 'Święto Pracy')
  on(5, 3, 'Święto Konstytucji 3 Maja')
  put(easter + 49, 'Zielone Świątki')
  put(easter + 60, 'Boże Ciało')
  on(8, 15, 'Wniebowzięcie NMP')
  on(11, 1, 'Wszystkich Świętych')
  on(11, 11, 'Święto Niepodległości')
  if (y >= 2025) on(12, 24, 'Wigilia')
  on(12, 25, 'Boże Narodzenie')
  on(12, 26, 'Drugi dzień Bożego Narodzenia')
}

const RULES: Readonly<Record<Market, (y: number, put: Put) => void>> = { NYSE: nyseRules, CME_FX: cmeRules, UK: ukRules, PL: plRules }

// ---- One table per (market, year), cached ----

interface Entry {
  closed: boolean
  earlyClose: EarlyClose | null
  names: string[]
}

const minutesOf = (c: EarlyClose): number => c.hour * 60 + c.minute

/** Adds a holiday or a shortened session to a date: closed wins, of two closing times the earlier one. */
function merge(table: Map<string, Entry>, date: string, name: string, earlyClose: EarlyClose | null): void {
  const entry = table.get(date)
  if (!entry) {
    table.set(date, { closed: earlyClose === null, earlyClose, names: [name] })
    return
  }
  entry.names.push(name)
  if (earlyClose === null) {
    entry.closed = true
    entry.earlyClose = null
  } else if (!entry.closed && (entry.earlyClose === null || minutesOf(earlyClose) < minutesOf(entry.earlyClose))) {
    entry.earlyClose = earlyClose
  }
}

const tables = new Map<string, Map<string, Entry>>()

/** The holidays and shortened sessions of a market in one year, by date: the rules, then the exception rows. */
function yearTable(market: Market, year: number): Map<string, Entry> {
  const key = `${market} ${year}`
  const cached = tables.get(key)
  if (cached) return cached
  const table = new Map<string, Entry>()
  RULES[market](year, (day, name, earlyClose) => {
    const date = isoOf(day)
    // A date is looked up in its own year's table: an observed day moved into another year would be lost (hence no
    // make-up 31.12 for a Saturday New Year) – so a rule that ever does it fails loudly instead.
    if (!date.startsWith(`${year}-`)) throw new Error(`${market}: ${name} of ${year} falls on ${date}`)
    merge(table, date, name, earlyClose ?? null)
  })
  for (const row of HOLIDAY_EXCEPTIONS) {
    if (row.market !== market || !row.date.startsWith(`${year}-`)) continue
    if (row.closed) table.set(row.date, { closed: true, earlyClose: null, names: [row.name] })
    else if (row.earlyClose) table.set(row.date, { closed: false, earlyClose: row.earlyClose, names: [row.name] })
    else table.delete(row.date)
  }
  tables.set(key, table)
  return table
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A 'RRRR-MM-DD' of a real day → its year and day number; anything else throws. */
function parse(date: string): { year: number; day: number } {
  const m = ISO_DATE.exec(date)
  const day = m ? dayNumber(Number(m[1]), Number(m[2]), Number(m[3])) : Number.NaN
  if (!m || !Number.isFinite(day) || isoOf(day) !== date) throw new RangeError(`Not a 'RRRR-MM-DD' date: ${date}`)
  return { year: Number(m[1]), day }
}

/**
 * A market on one date (spec „Sesje tradingowe”): closed (a session that day is asked about), shortened (a session ends
 * at the market's close at the latest) or regular, with the names of its holidays.
 */
export function marketDay(market: Market, date: string): MarketDay {
  const { year, day } = parse(date)
  if (market !== 'PL' && isWeekend(day)) return { market, date, closed: true, earlyClose: null, names: [] }
  const entry = yearTable(market, year).get(date)
  if (!entry) return { market, date, closed: false, earlyClose: null, names: [] }
  return { market, date, closed: entry.closed, earlyClose: entry.earlyClose && { ...entry.earlyClose }, names: [...entry.names] }
}

/** All holiday/early-close dates of a market in [from, to] (inclusive), weekends without a holiday omitted. */
export function marketHolidays(market: Market, from: string, to: string): MarketDay[] {
  const start = parse(from)
  const end = parse(to)
  const out: MarketDay[] = []
  for (let y = start.year; y <= end.year; y++) {
    for (const date of yearTable(market, y).keys()) {
      if (date < from || date > to) continue
      const day = marketDay(market, date)
      if (day.closed || day.earlyClose) out.push(day)
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
