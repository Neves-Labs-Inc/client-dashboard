import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

// The component gallery exists in dev only, so a production build has no
// /dev/components route at all (it 404s).
const isProduction = process.env.NODE_ENV === "production";

export default [
  index("routes/index.ts"),
  layout("routes/auth/layout.tsx", [
    route("sign-in", "routes/auth/sign-in.tsx"),
    route("sign-in/check-email", "routes/auth/check-email.tsx"),
    route("passkey", "routes/auth/passkey.tsx"),
    route("no-access", "routes/auth/no-access.tsx"),
  ]),
  layout("routes/client/layout.tsx", [route("team", "routes/client/team.tsx")]),
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/index.tsx"),
    route("clients/:clientId", "routes/admin/client.tsx"),
    route("clients/:clientId/team", "routes/admin/client-team.tsx"),
  ]),
  route("sign-out", "routes/sign-out.ts"),
  route("healthz", "routes/healthz.ts"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("theme", "routes/theme.tsx"),
  ...(isProduction
    ? []
    : [route("dev/components", "routes/dev.components.tsx")]),
] satisfies RouteConfig;
