import { defineConfig } from "@playwright/test";
import { globSync } from "node:fs";

// Chromium is pre-installed under a versioned dir; resolve it once.
const chromium =
  process.env.PW_CHROMIUM ||
  globSync("/opt/pw-browsers/chromium-*/chrome-linux/chrome")[0] ||
  "/opt/pw-browsers/chromium/chrome-linux/chrome";

// The suite boots the REAL worktable server against a fixture folder
// and the built UI (vite preview), then drives a real browser. The
// global setup writes the fixture + starts the server; webServer runs
// the preview with the API proxied to it. Chromium is pre-installed
// in this environment (PLAYWRIGHT_BROWSERS_PATH).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:4318",
    launchOptions: { executablePath: chromium },
  },
  webServer: {
    command: "npm run preview -- --port 4318 --strictPort",
    port: 4318,
    reuseExistingServer: true,
    timeout: 120000,
    env: { WORKTABLE_API: "http://127.0.0.1:8791" },
  },
});
