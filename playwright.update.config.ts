// adapted from FI playwright.update.config.ts @ de81f2b
import { defineConfig } from '@playwright/test'

/** Windows CI only: the helper's self-test, the installer and the four update paths (tests/update, see ci.yml). */
export default defineConfig({
  testDir: 'tests/update',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/update'
})
