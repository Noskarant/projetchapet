import { defineConfig, devices } from "@playwright/test";
import { seedMobileWorkspace } from "./lib/mobile-prototype";

const demoStorageState = {
  cookies: [],
  origins: [
    {
      origin: "http://127.0.0.1:3000",
      localStorage: [
        {
          name: "projetchapet-mobile-workspace-v3",
          value: JSON.stringify(seedMobileWorkspace()),
        },
        {
          name: "projetchapet:fresh-start:2026-09-v1",
          value: "done",
        },
      ],
    },
  ],
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: demoStorageState,
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "iphone-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
