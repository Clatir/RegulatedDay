// adapted from FI vitest.config.mts @ de81f2b
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@renderer': resolve(root, 'src/renderer')
    }
  },
  test: {
    testTimeout: 30000,
    include: ['tests/unit/**/*.test.ts', 'tests/fs/**/*.test.ts', 'tests/sim/**/*.test.ts', 'tests/web/**/*.test.ts'],
    environment: 'node'
  }
})
