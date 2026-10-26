/** The desktop bar's window: only the bar, unfolding the way the main process says (up, or down at the top). */
import { useEffect, useRef, useState } from 'react'
import { useWidget } from '../store/widget'
import { Bar, useReportLayout } from './Bar'

export function DesktopBarApp() {
  const view = useWidget((s) => s.view)
  const [grows, setGrows] = useState<'up' | 'down'>('up')
  const [unfolded, setUnfolded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => window.rd.onBarGrows(setGrows), [])
  useReportLayout(ref, unfolded)
  return (
    <div className="flex h-full flex-col" style={{ justifyContent: grows === 'up' ? 'flex-end' : 'flex-start' }}>
      <div ref={ref}>{view && <Bar view={view} mode="desktop" grows={grows} onUnfold={setUnfolded} />}</div>
    </div>
  )
}
