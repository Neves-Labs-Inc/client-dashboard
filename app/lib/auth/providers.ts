import type { SignInMethod } from "@/lib/db/schema";
import type { AppEnv } from "@/lib/env";

// The social providers the portal can offer, keyed by Better Auth's built-in
// provider id: where each one's credentials come from and the sign-in method
// its sessions record. Adding Microsoft later is one entry here, its two env
// vars in lib/env.ts and its value in the session_sign_in_method check.
const SOCIAL_PROVIDERS = {
  google: {
    signInMethod: "google",
    getCredentials: (env: AppEnv): Credentials | null =>
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : null,
  },
} as const satisfies Record<string, SocialProviderDefinition>;

export type BuiltInProviderId = keyof typeof SOCIAL_PROVIDERS;

type Credentials = { clientId: string; clientSecret: string };

type SocialProviderDefinition = {
  signInMethod: SignInMethod;
  getCredentials: (env: AppEnv) => Credentials | null;
};

// What a provider's own OAuth server answers, for a provider Better Auth
// doesn't build in. Only tests use one: a fake that never leaves the process.
export type CustomOAuth = {
  authorizationUrl: string;
  // The authorization code swapped for an access token.
  getToken: (code: string) => Promise<{ accessToken: string }>;
  // The profile behind that token, or null when there is none.
  getProfile: (accessToken: string) => Promise<OAuthProfile | null>;
};

export type OAuthProfile = {
  // The provider's stable subject id.
  id: string;
  email: string;
  // Whether the provider says it verified `email`. Unverified is refused.
  isEmailVerified: boolean;
  name: string;
};

export type RegisteredProvider = Credentials & {
  signInMethod: SignInMethod;
  // Absent: Better Auth's built-in provider of the same id. Set: this code,
  // run through Better Auth's generic OAuth.
  custom?: CustomOAuth;
};

// The enabled providers by id. An absent id is off: no sign-in, no callback.
export type ProviderRegistry = Readonly<Record<string, RegisteredProvider>>;

// The providers whose env vars are set. Empty when none are (CI and tests).
export function getProviderRegistry(env: AppEnv): ProviderRegistry {
  const entries = Object.entries(SOCIAL_PROVIDERS).flatMap(
    ([id, definition]) => {
      const credentials = definition.getCredentials(env);
      return credentials
        ? [[id, { ...credentials, signInMethod: definition.signInMethod }]]
        : [];
    },
  );
  return Object.fromEntries(entries);
}

export function isBuiltInProviderId(id: string): id is BuiltInProviderId {
  return Object.hasOwn(SOCIAL_PROVIDERS, id);
}
