// adapted from FI playwright.update.config.ts @ de81f2b
import { defineConfig } from '@playwright/test'

/** Windows CI only: the helper's self-test, the installer and the update paths (tests/update, see ci.yml). */
export default defineConfig({
  testDir: 'tests/update',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // One JSON report per step of CI (RD_REPORT): the log of flaky tests reads them all.
  reporter: process.env.CI ? [['list'], ['json', { outputFile: `test-results/update-${process.env.RD_REPORT ?? 'all'}-report.json` }]] : [['list']],
  outputDir: 'test-results/update'
})
