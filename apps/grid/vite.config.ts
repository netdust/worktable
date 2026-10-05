import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The engine serves `/api` itself, so the proxy passes the path through unchanged; changeOrigin sends the engine's own
// Host, which its allowlist requires.
const proxy = { '/api': { target: process.env.ENGINE_URL ?? 'http://127.0.0.1:4310', changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', strictPort: true, proxy },
  preview: { host: '127.0.0.1' },
  build: {
    outDir: 'dist',
    // The one chunk past the default is exceljs, fetched only when Export is pressed.
    chunkSizeWarningLimit: 1000,
  },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
})
