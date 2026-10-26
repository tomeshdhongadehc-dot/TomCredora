import { defineConfig, devices } from "@playwright/test";

// 3200 is the app's own port (npm run dev); tests use their own server so the two never collide and the tests never see a real AI key.
const PORT = 3201;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    // Parallel tests share one server and IP, so lift the per-client AI limits (defaults are exercised by unit tests).
    env: { NEXT_DIST_DIR: ".next-test", AUTH_MODE: "mock", NEXT_PUBLIC_AUTH_MODE: "mock", GEMINI_API_KEY: "", TAILOR_RATE_PER_MIN: "1000", TAILOR_RATE_PER_DAY: "100000" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
