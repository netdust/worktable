import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The engine serves `/api` itself, so the proxy passes the path through unchanged.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.ENGINE_URL ?? 'http://127.0.0.1:4310' } },
  build: {
    outDir: 'dist',
    // The one chunk past the default is exceljs, fetched only when Export is pressed.
    chunkSizeWarningLimit: 1000,
  },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
})
