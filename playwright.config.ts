import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium' },
  webServer: [
    {
      command: 'bun packages/engine/src/serve.ts --domain @worktable/theatre --db e2e/.tmp/e2e.db --port 4311 --fresh',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5174 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4311' },
      wait: { stdout: /127\.0\.0\.1:5174/ },
      reuseExistingServer: false,
    },
  ],
})
