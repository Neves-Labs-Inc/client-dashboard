import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the React Router plugin isn't meant to run
// under Vitest.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/global-setup.ts"],
  },
});
