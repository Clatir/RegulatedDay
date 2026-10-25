/**
 * Where the helper's program is: RD_HELPER_PATH (tests, CI on Linux: a stand-in), the installation's resources/helper
 * (packaged), build/helper of the repository (development, after `npm run build:helper`).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export const HELPER_EXE = 'rd-helper.exe'

export function helperProgram(): string | null {
  const fromEnv = process.env.RD_HELPER_PATH
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  if (process.platform !== 'win32') return null
  const file = app.isPackaged ? join(process.resourcesPath, 'helper', HELPER_EXE) : join(app.getAppPath(), 'build', 'helper', HELPER_EXE)
  return existsSync(file) ? file : null
}
