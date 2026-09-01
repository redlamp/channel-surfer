import { defineConfig } from "@playwright/test";

/**
 * End-to-end shader tests. They drive the dev server (or reuse one that
 * is already running on 7847) in headless Chromium and read pixels back
 * off the WebGL canvas. Kept separate from `bun test` so the unit suite
 * stays instant; run with `bun run test:e2e`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // "list" prints one line per test — enough to read pass/fail without
  // a report to open, and cheap to paste into a chat.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:7847",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev",
    url: "http://localhost:7847",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
