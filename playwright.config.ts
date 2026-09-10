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
  testIgnore: /public-auth\.spec\.ts/,
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
    serviceWorkers: "block",
    storageState: demoStorageState,
  },
  webServer: {
    command: process.env.CI
      ? "npm run start -- --hostname 127.0.0.1"
      : "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_FORGEO_AUTH_BYPASS: "1",
      NEXT_PUBLIC_COMMERCIAL_CLOUD_ENABLED: "0",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e_local_only",
    },
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
