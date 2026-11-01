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
      // Written here, not in global setup, which runs only once the servers are up. A leftover file keeps its mode, hence chmod.
      command:
        'mkdir -p e2e/.tmp && (umask 077 && head -c 32 /dev/urandom > e2e/.tmp/link-secret && chmod 600 e2e/.tmp/link-secret) &&' +
        ' bun packages/engine/src/serve.ts --domain @worktable/theatre --db e2e/.tmp/e2e.db --port 4311 --fresh' +
        ' --outbox e2e/.tmp/outbox --files-dir e2e/.tmp/files --app-url http://127.0.0.1:5174' +
        ' --link-secret-file e2e/.tmp/link-secret',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5174 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4311' },
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
    {
      // Not the live studio's cookie name, so opening this grid never signs Stefan out of his own studio.
      command:
        'bun packages/engine/src/serve.ts --domain @worktable/studio --db e2e/.tmp/studio.db --port 4313 --fresh' +
        ' --outbox e2e/.tmp/outbox-studio --files-dir e2e/.tmp/files-studio --app-url http://127.0.0.1:5176' +
        ' --cookie-name wt_session_studio_e2e --handoff-service worker',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5176 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4313' },
      wait: { stdout: /127\.0\.0\.1:5176/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The engine's own selection fixture, another instance: its cookie name keeps its session apart on 127.0.0.1.
      command:
        'bun packages/engine/src/serve.ts --domain ./packages/engine/test/fixtures/selection-domain.ts --db e2e/.tmp/selection.db --port 4314 --fresh' +
        ' --outbox e2e/.tmp/outbox-selection --app-url http://127.0.0.1:5177 --cookie-name wt_session_selection_e2e',
      wait: { stdout: /engine listening/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'cd apps/grid && bunx vite --port 5177 --strictPort --host 127.0.0.1',
      env: { ENGINE_URL: 'http://127.0.0.1:4314' },
      wait: { stdout: /127\.0\.0\.1:5177/ },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
