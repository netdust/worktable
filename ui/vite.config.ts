import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Lean by contract: one plugin, no router, no data lib, no CSS
// framework. The dev server proxies /api and /events and /seal and
// /views and /records and /flows to the worktable server so the UI
// and API share an origin in dev (and the token is the only auth).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "^/(views|records|flows|events|seal)": {
        target: process.env.WORKTABLE_API || "http://127.0.0.1:8737",
        changeOrigin: true,
      },
    },
  },
});
