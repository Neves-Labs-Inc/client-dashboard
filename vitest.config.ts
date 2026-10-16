import { configDefaults, defineConfig } from "vitest/config";

// Suites that read or write org-wide state (every github_boards row, every
// linked Project, every `user` row) would race the other files, so they run
// alone, after them. The auth suite deletes every user, which other files'
// Request submitters would block or vanish under.
const ORG_WIDE_TESTS = [
  "tests/lib/board-sync/board-sync-org-wide.test.ts",
  "tests/lib/auth/auth.test.ts",
];

// Separate from vite.config.ts: the React Router plugin isn't meant to run
// under Vitest.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globalSetup: ["tests/global-setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "default",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...ORG_WIDE_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "org-wide",
          include: ORG_WIDE_TESTS,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
