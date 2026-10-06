import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  // Runs once the web servers are up (Playwright starts them first): it creates and signs in one account per role.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    storageState: 'e2e/.tmp/state/editor.json',
  },
  webServer: [
    {
      command:
        'bun packages/engine/src/serve.ts --domain @worktable/theatre --db e2e/.tmp/e2e.db --port 4311 --fresh' +
        ' --outbox e2e/.tmp/outbox --app-url http://127.0.0.1:5174',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5174 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4311', VITE_RECORDS_PAGE_SIZE: '2' },
      wait: { stdout: /127\.0\.0\.1:5174/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Cookies ignore the port: the fiche engine's own cookie name keeps the two sessions apart on 127.0.0.1.
      command:
        'bun packages/engine/src/serve.ts --domain @worktable/fiche --db e2e/.tmp/fiche.db --port 4312 --fresh' +
        ' --outbox e2e/.tmp/outbox-fiche --app-url http://127.0.0.1:5175 --cookie-name wt_session_fiche',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5175 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4312' },
      wait: { stdout: /127\.0\.0\.1:5175/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
