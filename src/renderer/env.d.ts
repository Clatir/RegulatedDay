// adapted from FI src/renderer/env.d.ts @ de81f2b
/// <reference types="vite/client" />
import type { RdApi } from '@shared/api'

declare global {
  interface Window {
    rd: RdApi
  }
}

export {}
