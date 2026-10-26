import { describe, expect, it } from 'vitest'
import { dayEnd, dayLengthMin, dayStart, logicalDayOf, logicalMinuteOf, placeLogical, resolveLogical, weekStart } from '@shared/time/day'
import { HOUR, MINUTE, addDays, instantsOfWall, offsetMin, resolveWall, wallOf, weekday } from '@shared/time/zone'

const utc = (s: string) => Date.parse(s)

describe('zone', () => {
  it('knows the Polish offset in winter and in summer', () => {
    expect(offsetMin('Europe/Warsaw', utc('2026-01-15T12:00:00Z'))).toBe(60)
    expect(offsetMin('Europe/Warsaw', utc('2026-07-15T12:00:00Z'))).toBe(120)
    expect(offsetMin('America/New_York', utc('2026-07-15T12:00:00Z'))).toBe(-240)
  })

  it('the doubled hour of 25.10.2026 has two instants, the first is taken unless the second is chosen', () => {
    const both = instantsOfWall('Europe/Warsaw', '2026-10-25', 2 * 60 + 30)
    expect(both).toEqual([utc('2026-10-25T00:30:00Z'), utc('2026-10-25T01:30:00Z')])
    const first = resolveWall('Europe/Warsaw', '2026-10-25', 150)
    expect(first).toEqual({ ok: true, at: utc('2026-10-25T00:30:00Z'), ambiguous: true, other: utc('2026-10-25T01:30:00Z') })
    const second = resolveWall('Europe/Warsaw', '2026-10-25', 150, 'second')
    expect(second.ok && second.at).toBe(utc('2026-10-25T01:30:00Z'))
  })

  it('the skipped hour of 28.03.2027 is refused, with the first instant after the gap', () => {
    const r = resolveWall('Europe/Warsaw', '2027-03-28', 2 * 60 + 30)
    expect(r).toEqual({ ok: false, reason: 'nonexistent', next: utc('2027-03-28T01:00:00Z') })
    expect(wallOf('Europe/Warsaw', utc('2027-03-28T01:00:00Z'))).toEqual({ date: '2027-03-28', minutes: 180 })
    expect(resolveWall('Europe/Warsaw', '2027-03-28', 3 * 60)).toEqual({ ok: true, at: utc('2027-03-28T01:00:00Z'), ambiguous: false, other: null })
    expect(resolveWall('Europe/Warsaw', '2027-03-28', 119)).toEqual({ ok: true, at: utc('2027-03-28T00:59:00Z'), ambiguous: false, other: null })
  })

  it('counts calendar dates and weekdays without a zone', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(weekday('2026-10-26')).toBe(1)
    expect(weekday('2026-10-25')).toBe(7)
  })
})

describe('logical day', () => {
  it('starts at 04:00 Polish time; 03:59 belongs to the day before', () => {
    expect(dayStart('2026-10-21')).toBe(utc('2026-10-21T02:00:00Z'))
    expect(logicalDayOf(utc('2026-10-22T01:59:00Z'))).toBe('2026-10-21')
    expect(logicalDayOf(utc('2026-10-22T02:00:00Z'))).toBe('2026-10-22')
    expect(logicalDayOf(utc('2026-10-21T22:30:00Z'))).toBe('2026-10-21')
  })

  it('the day of the autumn change lasts 25 h, of the spring change 23 h', () => {
    expect(dayLengthMin('2026-10-24')).toBe(1500)
    expect(dayLengthMin('2026-10-25')).toBe(1440)
    expect(dayLengthMin('2027-03-27')).toBe(1380)
    expect(dayEnd('2026-10-24')).toBe(utc('2026-10-25T03:00:00Z'))
  })

  it('a logical minute after midnight is the next date; both 02:30 of 25.10 belong to 24.10', () => {
    expect(placeLogical('2026-10-21', 1440 + 30)).toBe(utc('2026-10-21T22:30:00Z'))
    const r = resolveLogical('2026-10-24', 1440 + 150)
    expect(r.ok && r.at).toBe(utc('2026-10-25T00:30:00Z'))
    expect(logicalDayOf(utc('2026-10-25T00:30:00Z'))).toBe('2026-10-24')
    expect(logicalDayOf(utc('2026-10-25T01:30:00Z'))).toBe('2026-10-24')
    expect(resolveLogical('2027-03-27', 1440 + 150).ok).toBe(false)
    expect(placeLogical('2027-03-27', 1440 + 150)).toBe(utc('2027-03-28T01:00:00Z'))
  })

  it('shows instants back as logical minutes, +1 after midnight', () => {
    expect(logicalMinuteOf('2026-10-21', utc('2026-10-21T22:30:00Z'))).toBe(1440 + 30)
    expect(logicalMinuteOf('2026-10-21', utc('2026-10-21T15:45:00Z'))).toBe(17 * 60 + 45)
  })

  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
  })

  it('the minute grid is aligned in Polish time too', () => {
    // Polish offsets are whole hours: a UTC minute is a Polish minute.
    expect((dayStart('2026-10-24') + 37 * MINUTE) % MINUTE).toBe(0)
    expect(dayStart('2026-10-25') - dayStart('2026-10-24')).toBe(25 * HOUR)
  })
})
