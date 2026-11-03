import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:3101",
    headless: true,
    actionTimeout: 15000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3101",
    url: "http://localhost:3101/api/studio",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      STUDIO_DATA_DIR: path.resolve(".studio-data", `e2e-${Date.now()}`),
      REPLICATE_API_KEY: "",
      STUDIO_DATABASE_URL: process.env.STUDIO_E2E_DATABASE_URL || "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
