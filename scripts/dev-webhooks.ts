import { spawn } from "node:child_process";
import { getDevWebhooksEnv } from "../app/lib/env.ts";

// `pnpm dev:webhooks`: forwards the dev GitHub App's smee channel to the dev
// server, so webhook deliveries reach a local machine. Local only.
const WEBHOOK_TARGET = "http://localhost:5173/webhooks/github";

try {
  const { SMEE_URL: smeeUrl } = getDevWebhooksEnv();
  // pnpm puts node_modules/.bin (smee-client's `smee`) on PATH.
  const smee = spawn("smee", ["--url", smeeUrl, "--target", WEBHOOK_TARGET], {
    stdio: "inherit",
  });
  smee.on("error", (error) => {
    console.error(`dev:webhooks: could not start smee: ${error.message}`);
    process.exitCode = 1;
  });
  smee.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
