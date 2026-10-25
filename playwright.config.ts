// adapted from FI playwright.config.ts @ de81f2b
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['dot']],
  outputDir: 'test-results'
})
