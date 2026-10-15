import { createAppAuth } from "@octokit/auth-app";
import { GraphqlResponseError, graphql } from "@octokit/graphql";
import type { GraphqlTransport } from "@/lib/pm-source/github-pm-source";

type InstallationConfig = {
  appId: string;
  privateKey: string;
  installationId: number;
};

// The real transport: GitHub's GraphQL API as the App's installation.
// auth-app signs the App JWT and caches the installation token, renewing it
// before it expires.
export function createInstallationGraphql(
  config: InstallationConfig,
): GraphqlTransport {
  const auth = createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: config.installationId,
  });
  const client = graphql.defaults({ request: { hook: auth.hook } });

  return async (query, variables) => {
    try {
      const data = await client(query, variables);
      return { data };
    } catch (error) {
      // octokit throws on any GraphQL error; the adapter wants the raw body
      // (a missing board is a NOT_FOUND error next to a null node).
      if (!(error instanceof GraphqlResponseError)) throw error;
      return { data: error.data, errors: error.errors };
    }
  };
}
