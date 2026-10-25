import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { TRAY_SIZES, renderTrayIcon, trayIconKey } from '@shared/trayIcon'
import { crc32, encodeIco, encodePng } from '../../src/main/icon/ico'

const px = (rgba: Uint8Array, size: number, x: number, y: number) => Array.from(rgba.subarray((y * size + x) * 4, (y * size + x) * 4 + 4))

describe('ikona przy zegarze (D289)', () => {
  it('pełne kółko w kolorze paska; rogi przezroczyste', () => {
    for (const size of TRAY_SIZES) {
      const rgba = renderTrayIcon(size, { color: '#F2B66D', dot: false, drop: false })
      const c = px(rgba, size, Math.floor(size * 0.46), Math.floor(size * 0.54))
      expect(c).toEqual([0xf2, 0xb6, 0x6d, 255])
      expect(px(rgba, size, 0, 0)[3]).toBe(0)
    }
  })

  it('kropka w prawym górnym rogu i kropla w prawym dolnym zmieniają piksele tylko tam', () => {
    const size = 32
    const plain = renderTrayIcon(size, { color: '#79AFAB', dot: false, drop: false })
    const dot = renderTrayIcon(size, { color: '#79AFAB', dot: true, drop: false })
    const drop = renderTrayIcon(size, { color: '#79AFAB', dot: false, drop: true })
    expect(px(dot, size, 25, 6)).toEqual([0xee, 0xe3, 0xd6, 255])
    expect(px(drop, size, 25, 26)).toEqual([0x9b, 0xd3, 0xf2, 255])
    // The left half is the same in all three.
    for (let y = 0; y < size; y++) for (let x = 0; x < 12; x++) expect(px(dot, size, x, y)).toEqual(px(plain, size, x, y))
    expect(trayIconKey({ color: '#79AFAB', dot: true, drop: true })).toBe('79afab-dw')
  })

  it('PNG i ICO mają poprawną budowę', () => {
    const rgba = renderTrayIcon(16, { color: '#F2B66D', dot: true, drop: true })
    const png = encodePng(rgba, 16, 16)
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    // IDAT round-trips to the same pixels.
    const idatAt = png.indexOf('IDAT')
    const len = png.readUInt32BE(idatAt - 4)
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len))
    expect(raw.length).toBe(16 * (16 * 4 + 1))
    expect(Array.from(raw.subarray(1, 1 + 64))).toEqual(Array.from(rgba.subarray(0, 64)))
    expect(png.readUInt32BE(idatAt + 4 + len)).toBe(crc32(png.subarray(idatAt, idatAt + 4 + len)))
    const ico = encodeIco(TRAY_SIZES.map((size) => ({ size, png: encodePng(renderTrayIcon(size, { color: '#F2B66D', dot: false, drop: false }), size, size) })))
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(5)
    expect([0, 1, 2, 3, 4].map((i) => ico[6 + i * 16])).toEqual([16, 20, 24, 28, 32])
    const firstOffset = ico.readUInt32LE(6 + 12)
    expect(ico.subarray(firstOffset + 1, firstOffset + 4).toString('ascii')).toBe('PNG')
  })
})
