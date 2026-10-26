/**
 * The window of sound (spec „Widget”: „Dźwięki gra ukryte okno dźwięku, które nigdy się nie pokazuje”): a short quiet
 * tone made in WebAudio – no file, no autoplay block (the window is made without it), also after a reload without a click.
 * Before every sound the audio is resumed: after a sleep or a change of the output device it is often suspended.
 */
import { useEffect } from 'react'

let ctx: AudioContext | null = null

export async function playTone(kind: 'five' | 'zero', volume: number): Promise<void> {
  ctx ??= new AudioContext()
  if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)
  const gain = ctx.createGain()
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.25
  gain.connect(ctx.destination)
  // Two soft notes at 5 min, one lower at 0 min.
  const notes = kind === 'five' ? [660, 880] : [520]
  let at = ctx.currentTime
  for (const f of notes) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    o.connect(gain)
    o.start(at)
    o.stop(at + 0.18)
    at += 0.22
  }
}

export function SoundApp() {
  useEffect(() => window.rd.onSound((s) => void playTone(s.kind, s.volume)), [])
  return null
}
