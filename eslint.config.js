import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["build/", ".react-router/", ".scratch/"]),
  tseslint.configs.recommended,
);
