import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// ADR 0001: the auth module (app/lib/auth/) is the only server code that
// calls Better Auth. The browser client entry points stay open for the UI's
// WebAuthn ceremonies and magic-link request.
const BETTER_AUTH_SERVER_IMPORTS = {
  regex:
    "^(better-auth(?!/(client|react)(/|$))|@better-auth/(?!passkey/client$)).*",
  message:
    "Only app/lib/auth/ may import Better Auth on the server (ADR 0001). Use the auth module.",
};

export default defineConfig(
  globalIgnores(["build/", ".react-router/", ".scratch/"]),
  tseslint.configs.recommended,
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/lib/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BETTER_AUTH_SERVER_IMPORTS] },
      ],
    },
  },
);
