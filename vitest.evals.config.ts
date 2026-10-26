import { defineConfig } from "vitest/config";
import path from "node:path";

// Live evals: call the real model. Run with `npm run evals` (needs GEMINI_API_KEY).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["evals/**/*.eval.ts"], environment: "node", testTimeout: 120_000, hookTimeout: 120_000 },
});
