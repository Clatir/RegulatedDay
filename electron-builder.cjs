// adapted from FI electron-builder.cjs @ de81f2b
/**
 * electron-builder: one per-user NSIS installer (spec „Instalacja, aktualizacje i log”) – one click, for this user only,
 * no choice of folder, a fixed nsis.guid (its uninstall entry and its mutex are named by it), no portable version. The
 * helper, the guard and the install helper (build/helper, C#) go to resources/helper. After packing, the manifest of the
 * release – every file of win-unpacked with its size and SHA-256 – is written beside the installer (scripts/manifest.cjs).
 */
const product = 'Regulated Day'

module.exports = {
  appId: 'app.regulatedday.desktop',
  productName: product,
  executableName: product,
  // app.getName() (the uninstaller's name) comes from the packaged package.json; the identity is set by start.ts.
  extraMetadata: { productName: product },
  copyright: 'Copyright © 2026 Regulated Day',
  directories: { output: 'release', buildResources: 'resources' },
  // Everything is bundled by electron-vite into out/ (all libraries are devDependencies), so the package contains no
  // node_modules and no native modules.
  files: ['out/**', 'package.json', '!**/*.map'],
  extraResources: [{ from: 'build/helper', to: 'helper', filter: ['*.exe', '*.exe.config', '!roslyn/**'] }],
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  electronLanguages: ['pl', 'en-US'],
  win: {
    icon: 'resources/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  nsis: {
    artifactName: 'Regulated-Day-Setup.${ext}',
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    guid: 'E2A45BEE-EF15-48BC-9498-F12E5B866145',
    createStartMenuShortcut: true,
    // The shortcut directly in Programs (no subfolder – that would make a second entry in Start).
    menuCategory: false,
    createDesktopShortcut: true,
    shortcutName: product,
    deleteAppDataOnUninstall: false,
    include: 'resources/installer.nsh'
  },
  // After signing (rcedit and the signing change the exe, elevate.exe is added): the files as the installer packs them.
  afterSign: './scripts/manifest.cjs',
  // Updates come from the app's own code (src/main/update), not electron-updater: no app-update.yml.
  publish: null
}
