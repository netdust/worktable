import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The engine serves `/api` itself, so the proxy passes the path through unchanged; changeOrigin sends the engine's own
// Host, which its allowlist requires.
const proxy = { '/api': { target: process.env.ENGINE_URL ?? 'http://127.0.0.1:4310', changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  // changeOrigin hides a rebound page's Host from the engine, so Vite's own host check guards the proxied path.
  server: { host: '127.0.0.1', strictPort: true, allowedHosts: [], proxy },
  preview: { host: '127.0.0.1', allowedHosts: [] },
  build: {
    outDir: 'dist',
    // The one chunk past the default is exceljs, fetched only when Export is pressed.
    chunkSizeWarningLimit: 1000,
  },
  // Half the cores: jsdom waits starve and time out on a loaded machine with a worker per core (R15).
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'], testTimeout: 15000, maxWorkers: '50%' },
})
