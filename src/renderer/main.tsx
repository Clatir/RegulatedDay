// adapted from FI src/renderer/main.tsx @ de81f2b
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/outfit/latin-400.css'
import '@fontsource/outfit/latin-ext-400.css'
import '@fontsource/outfit/latin-500.css'
import '@fontsource/outfit/latin-ext-500.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-ext-400.css'
import './styles/index.css'
import { App } from './app/App'
import { DesktopBarApp } from './widget/DesktopBarApp'
import { PanelApp } from './widget/PanelApp'
import { installEscape } from './lib/escape'
import { loadMachinePrefs } from './store/machine'
import { loadWidget } from './store/widget'
import { loadUpdate } from './store/update'

const view = window.rd.view
document.documentElement.dataset.view = view
installEscape()
void loadMachinePrefs()
void loadWidget()
if (view === 'main') void loadUpdate()

const root = view === 'bar' ? <DesktopBarApp /> : view === 'panel' ? <PanelApp /> : <App />
createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode>{root}</StrictMode>)
