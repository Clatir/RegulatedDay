// adapted from FI src/preload/index.ts @ de81f2b
/**
 * `window.rd` for every window (the main one, the icon's panel, the desktop bar): the view comes from the window's
 * arguments. In the desktop bar a tooltip would be a separate Chromium window on top of every other (D229): the preload
 * removes every `title` attribute and empties the text inside `<title>` elements (SVG) through nodeValue – never removing
 * an element or a node by textContent, which would break React at its next change.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, type RdApi, type ViewKind } from '../shared/api'

const viewArg = process.argv.find((a) => a.startsWith('--rd-view='))?.slice('--rd-view='.length)
const view: ViewKind = viewArg === 'bar' || viewArg === 'panel' || viewArg === 'sound' ? viewArg : 'main'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RdApi = {
  view,
  appInfo: () => ipcRenderer.invoke(CH.appInfo),
  prefs: () => ipcRenderer.invoke(CH.prefs),
  setPrefs: (patch) => ipcRenderer.invoke(CH.setPrefs, patch),
  onPrefs: (cb) => on(CH.onPrefs, cb),
  autostart: () => ipcRenderer.invoke(CH.autostart),
  setAutostart: (value) => ipcRenderer.invoke(CH.setAutostart, value),
  openLogs: () => ipcRenderer.invoke(CH.openLogs),
  widget: () => ipcRenderer.invoke(CH.widget),
  onWidget: (cb) => on(CH.onWidget, cb),
  widgetAction: (action, arg) => ipcRenderer.invoke(CH.widgetAction, action, arg),
  barLayout: (layout) => ipcRenderer.send(CH.barLayout, layout),
  barDrag: (phase, why) => ipcRenderer.send(CH.barDrag, phase, why),
  barScreens: () => ipcRenderer.invoke(CH.barScreens),
  placeBar: (display, spot) => ipcRenderer.invoke(CH.placeBar, display, spot),
  panelTouch: () => ipcRenderer.send(CH.panelTouch),
  panelClose: () => ipcRenderer.send(CH.panelClose),
  barAction: (action, arg) => ipcRenderer.invoke(CH.barAction, action, arg),
  update: () => ipcRenderer.invoke(CH.update),
  onUpdate: (cb) => on(CH.onUpdate, cb),
  updateAction: (action) => ipcRenderer.invoke(CH.updateAction, action),
  onNavigate: (cb) => on(CH.onNavigate, cb),
  showMain: (page) => ipcRenderer.send(CH.showMain, page),
  copyText: (text) => ipcRenderer.invoke(CH.copyText, text),
  onPanelTarget: (cb) => on('rd:panelTarget', cb),
  onBarGrows: (cb) => on('rd:barGrows', cb),
  dataView: () => ipcRenderer.invoke(CH.dataView),
  onData: (cb) => on(CH.onData, cb),
  dayData: (date) => ipcRenderer.invoke(CH.dayData, date),
  dayFiles: (dates) => ipcRenderer.invoke(CH.dayFiles, dates),
  edit: (entries) => ipcRenderer.invoke(CH.edit, entries),
  logEvents: (events) => ipcRenderer.invoke(CH.logEvents, events),
  resolve: (id, choice) => ipcRenderer.invoke(CH.resolve, id, choice),
  monthEvents: (month, kinds) => ipcRenderer.invoke(CH.monthEvents, month, kinds),
  requestCounters: () => ipcRenderer.invoke(CH.requestCounters),
  historyList: () => ipcRenderer.invoke(CH.historyList),
  historyVersions: (kind, id) => ipcRenderer.invoke(CH.historyVersions, kind, id),
  historyRestore: (kind, id, file) => ipcRenderer.invoke(CH.historyRestore, kind, id, file),
  folderDefault: () => ipcRenderer.invoke(CH.folderDefault),
  folderPick: (current) => ipcRenderer.invoke(CH.folderPick, current),
  folderProbe: (path) => ipcRenderer.invoke(CH.folderProbe, path),
  wizardFinish: (w) => ipcRenderer.invoke(CH.wizardFinish, w),
  pinFolder: () => ipcRenderer.invoke(CH.pinFolder),
  openSystemSettings: (page) => ipcRenderer.invoke(CH.openSystemSettings, page),
  openDataFolder: () => ipcRenderer.invoke(CH.openDataFolder),
  setNightInstall: (on) => ipcRenderer.invoke(CH.setNightInstall, on),
  timer: (click) => ipcRenderer.invoke(CH.timer, click),
  answer: (id, answer, value) => ipcRenderer.invoke(CH.answer, id, answer, value ?? null),
  ritual: (day) => ipcRenderer.invoke(CH.ritual, day),
  ritualAnswer: (day, row, choice, value, item) => ipcRenderer.invoke(CH.ritualAnswer, day, row, choice, value ?? null, item ?? null),
  closeDay: (day, how) => ipcRenderer.invoke(CH.closeDay, day, how),
  unclosedDays: () => ipcRenderer.invoke(CH.unclosedDays),
  exportCsv: (from, to) => ipcRenderer.invoke(CH.exportCsv, from, to),
  backups: () => ipcRenderer.invoke(CH.backups),
  backupContents: (path) => ipcRenderer.invoke(CH.backupContents, path),
  restoreRecords: (path, rels) => ipcRenderer.invoke(CH.restoreRecords, path, rels),
  restoreWhole: (path) => ipcRenderer.invoke(CH.restoreWhole, path),
  moveTo: (dir) => ipcRenderer.invoke(CH.moveTo, dir),
  game: () => ipcRenderer.invoke(CH.game),
  celebrated: (keys) => ipcRenderer.invoke(CH.celebrated, keys),
  sideB: () => ipcRenderer.invoke(CH.sideB),
  calibration: () => ipcRenderer.invoke(CH.calibration),
  seen: (ids) => ipcRenderer.send(CH.seen, ids),
  onSound: (cb) => on('rd:sound', cb)
}

contextBridge.exposeInMainWorld('rd', api)

/** The desktop bar: no `title` anywhere, no text inside `<title>` (each would open a tooltip window on top). */
function stripTooltips(root: ParentNode): void {
  for (const el of root.querySelectorAll('[title]')) el.removeAttribute('title')
  for (const t of root.querySelectorAll('title'))
    for (const node of t.childNodes) if (node.nodeType === Node.TEXT_NODE && node.nodeValue) node.nodeValue = ''
}

const inTitle = (n: Node) => n.nodeType === Node.TEXT_NODE && n.parentNode?.nodeName.toLowerCase() === 'title'

/** An element added to the bar, with everything inside it. */
function stripElement(el: Element): void {
  if (el.hasAttribute('title')) el.removeAttribute('title')
  if (el.nodeName.toLowerCase() === 'title') for (const node of el.childNodes) if (inTitle(node) && node.nodeValue) node.nodeValue = ''
  stripTooltips(el)
}

if (view === 'bar') {
  window.addEventListener('DOMContentLoaded', () => {
    stripTooltips(document)
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes') {
          if (r.target instanceof Element && r.target.hasAttribute('title')) r.target.removeAttribute('title')
          continue
        }
        if (r.type === 'characterData') {
          if (inTitle(r.target) && r.target.nodeValue) r.target.nodeValue = ''
          continue
        }
        for (const n of r.addedNodes) {
          if (n instanceof Element) stripElement(n)
          else if (inTitle(n) && n.nodeValue) n.nodeValue = ''
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'], characterData: true })
  })
}
