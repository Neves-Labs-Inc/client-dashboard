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
    route("invitations/:invitationId", "routes/auth/invitation.tsx"),
  ]),
  layout("routes/client/layout.tsx", [
    route("overview", "routes/client/overview.tsx"),
    route("projects", "routes/client/projects.tsx"),
    route("projects/:projectId", "routes/client/project.tsx"),
    route("team", "routes/client/team.tsx"),
    route("profile", "routes/client/profile.tsx"),
  ]),
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/index.tsx"),
    route("clients/:clientId", "routes/admin/client.tsx"),
    route("clients/:clientId/team", "routes/admin/client-team.tsx"),
    route("clients/:clientId/projects", "routes/admin/client-projects.tsx"),
    route(
      "clients/:clientId/projects/:projectId",
      "routes/admin/client-board.tsx",
    ),
    route("boards/:nodeId/link-draft", "routes/admin/link-draft.ts"),
  ]),
  route("sign-out", "routes/sign-out.ts"),
  route("healthz", "routes/healthz.ts"),
  route("webhooks/github", "routes/webhooks.github.ts"),
  route("jobs/reconcile", "routes/jobs.reconcile.ts"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("theme", "routes/theme.tsx"),
  ...(isProduction
    ? []
    : [route("dev/components", "routes/dev.components.tsx")]),
] satisfies RouteConfig;
