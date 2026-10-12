import { defineConfig } from "drizzle-kit";

// Only `generate` uses this; migrations are applied by `pnpm db:migrate`, so
// no connection URL is needed here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
});
