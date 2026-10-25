// adapted from FI playwright.config.ts @ de81f2b
import { defineConfig } from '@playwright/test'

// The Windows job of CI retries a failed test once and lists the flaky ones (plan: one automatic retry and a log of flaky
// tests); everywhere else a failure is a failure.
const windowsCi = !!process.env.CI && process.platform === 'win32'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: windowsCi ? 1 : 0,
  reporter: windowsCi ? [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]] : [['dot']],
  outputDir: 'test-results'
})
