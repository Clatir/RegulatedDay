// adapted from FI electron.vite.config.mts @ de81f2b
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('.', import.meta.url))

const alias = {
  '@shared': resolve(root, 'src/shared'),
  '@renderer': resolve(root, 'src/renderer')
}

/** Strict Content-Security-Policy for the packaged app (dev server needs inline scripts for HMR). */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html: string) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    }
  }
}

// All runtime libraries live in devDependencies and are bundled, so the packaged
// app.asar contains only the build output (no node_modules, no native modules).
export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        // Two entries (T381): `start` sets the identity (name, data folder, AppUserModelId) and only then loads `index`;
        // it imports nothing but electron and Node modules – scripts/check-code.mjs checks the built file.
        input: { start: resolve(root, 'src/main/start.ts'), index: resolve(root, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias },
    build: { externalizeDeps: false }
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss(), cspPlugin()],
    build: { chunkSizeWarningLimit: 2000, minify: 'esbuild' }
  }
})
