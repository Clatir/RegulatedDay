// adapted from FI scripts/make-icon.mjs @ de81f2b
/**
 * Renders the app's icon (D288): a desk lamp in the lamp colour, its warm light, on a rounded tile in the background
 * colour. Drawn by Chromium's canvas in Electron (no browser to install), at every size of the .ico, with strokes made
 * thicker at the small sizes so the lamp still reads at 16 px. Run: npx electron scripts/make-icon.cjs
 * Writes resources/icon.png (512 px) and resources/icon.ico (16–256 px).
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

function draw(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')
  const k = size / 512
  // Small sizes: bolder strokes, no thin details.
  const bold = size <= 32 ? 1.9 : size <= 64 ? 1.4 : 1
  x.scale(k, k)
  x.fillStyle = '#211B23'
  x.beginPath()
  x.roundRect(16, 16, 480, 480, 96)
  x.fill()
  if (size >= 48) {
    x.strokeStyle = '#3B3140'
    x.lineWidth = 8
    x.stroke()
  }
  // Geometry: the base, the elbow, the shade's hinge; the shade's axis points down to the desk.
  const hinge = { x: 196, y: 150 }
  const elbow = { x: 318, y: 252 }
  const foot = { x: 236, y: 404 }
  const axis = (66 * Math.PI) / 180
  const len = 118
  const open = { x: hinge.x + len * Math.cos(axis), y: hinge.y + len * Math.sin(axis) }
  const back = 30 * Math.min(bold, 1.35)
  const wide = 74
  x.save()
  x.beginPath()
  x.roundRect(16, 16, 480, 480, 96)
  x.clip()
  // The light: a cone from the shade's opening to the desk, fading.
  if (size >= 32) {
    const px = -Math.sin(axis)
    const py = Math.cos(axis)
    const far = 330
    const spread = 1.9
    x.beginPath()
    x.moveTo(open.x + px * wide, open.y + py * wide)
    x.lineTo(open.x + far * Math.cos(axis) + px * wide * spread * 2.2, open.y + far * Math.sin(axis) + py * wide * spread * 2.2)
    x.lineTo(open.x + far * Math.cos(axis) - px * wide * spread * 2.2, open.y + far * Math.sin(axis) - py * wide * spread * 2.2)
    x.lineTo(open.x - px * wide, open.y - py * wide)
    x.closePath()
    const glow = x.createRadialGradient(open.x, open.y, 20, open.x, open.y, 300)
    glow.addColorStop(0, 'rgba(242, 182, 109, 0.40)')
    glow.addColorStop(1, 'rgba(242, 182, 109, 0)')
    x.fillStyle = glow
    x.fill()
  }
  x.restore()
  x.strokeStyle = '#F2B66D'
  x.fillStyle = '#F2B66D'
  x.lineCap = 'round'
  x.lineJoin = 'round'
  // The base.
  x.beginPath()
  x.roundRect(136, 404, 200, 36 * bold, 18 * bold)
  x.fill()
  // The arms and the elbow.
  x.lineWidth = 26 * bold
  x.beginPath()
  x.moveTo(foot.x, foot.y)
  x.lineTo(elbow.x, elbow.y)
  x.lineTo(hinge.x, hinge.y)
  x.stroke()
  x.beginPath()
  x.arc(elbow.x, elbow.y, 19 * bold, 0, Math.PI * 2)
  x.fill()
  // The shade: narrow at its hinge, open towards the desk.
  x.save()
  x.translate(hinge.x, hinge.y)
  x.rotate(axis)
  x.beginPath()
  x.moveTo(-18, -back)
  x.lineTo(len, -wide)
  x.lineTo(len, wide)
  x.lineTo(-18, back)
  x.closePath()
  x.fill()
  // The bulb in the opening.
  if (size >= 32) {
    x.fillStyle = '#FFF3DE'
    x.beginPath()
    x.ellipse(len + 4, 0, 16, 50, 0, 0, Math.PI * 2)
    x.fill()
  }
  x.restore()
  return c.toDataURL('image/png').split(',')[1]
}

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + entries.length
  images.forEach((img, i) => {
    entries[i * 16] = img.size >= 256 ? 0 : img.size
    entries[i * 16 + 1] = img.size >= 256 ? 0 : img.size
    entries.writeUInt16LE(1, i * 16 + 4)
    entries.writeUInt16LE(32, i * 16 + 6)
    entries.writeUInt32LE(img.png.length, i * 16 + 8)
    entries.writeUInt32LE(offset, i * 16 + 12)
    offset += img.png.length
  })
  return Buffer.concat([header, entries, ...images.map((i) => i.png)])
}

// A large canvas goes to the GPU, which may be unavailable (a CI runner, a remote session): software only.
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const run = (size) => win.webContents.executeJavaScript(`(${draw.toString()})(${size})`)
  const root = join(__dirname, '..', 'resources')
  writeFileSync(join(root, 'icon.png'), Buffer.from(await run(512), 'base64'))
  const images = []
  for (const size of SIZES) images.push({ size, png: Buffer.from(await run(size), 'base64') })
  writeFileSync(join(root, 'icon.ico'), ico(images))
  console.log('resources/icon.png, resources/icon.ico')
  app.quit()
})
