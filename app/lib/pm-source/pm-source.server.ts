import { getAppEnv, type AppEnv } from "@/lib/env";
import { createGithubPmSource } from "@/lib/pm-source/github-pm-source";
import type { PmSource } from "@/lib/pm-source/pm-source";

// The app's one PmSource. Server-only: it holds the GitHub App's private key.
// null when GitHub is off (no GITHUB_* vars: CI, tests, a fresh checkout).
export const pmSource: PmSource | null = createPmSourceFromEnv(getAppEnv());

// Env validation guarantees all GitHub vars or none.
function createPmSourceFromEnv(env: AppEnv): PmSource | null {
  const {
    GITHUB_APP_ID: appId,
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_APP_INSTALLATION_ID: installationId,
    GITHUB_ORG: org,
  } = env;
  const isGithubOff =
    appId === undefined ||
    privateKey === undefined ||
    installationId === undefined ||
    org === undefined;
  if (isGithubOff) return null;

  return createGithubPmSource({ appId, privateKey, installationId, org });
}
