import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The entry is the script itself: WordPress prints the page, the manifest tells AppAssets which file to enqueue.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    manifest: 'manifest.json',
    rollupOptions: { input: 'src/main.tsx' },
    // The one chunk past the default is exceljs, fetched only when Export is pressed.
    chunkSizeWarningLimit: 1000,
  },
  test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'] },
})
