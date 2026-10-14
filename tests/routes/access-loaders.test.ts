import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Access,
  AccessResult,
  Auth,
  ClientSummary,
  Team,
} from "@/lib/auth/auth";
import { loader as clientLoader } from "@/routes/admin/client";
import {
  action as teamAction,
  clientAction as teamClientAction,
  loader as teamLoader,
  shouldRevalidate as teamShouldRevalidate,
} from "@/routes/admin/client-team";
import {
  action as adminIndexAction,
  clientAction as adminIndexClientAction,
  loader as adminIndexLoader,
  shouldRevalidate as adminIndexShouldRevalidate,
} from "@/routes/admin/index";
import {
  action as adminAction,
  loader as adminLoader,
  shouldRevalidate as adminShouldRevalidate,
} from "@/routes/admin/layout";
import type { CreateClientOutcome } from "@/lib/new-client";
import type { InvitationOutcome } from "@/lib/team-invitations";
import { loader as checkEmailLoader } from "@/routes/auth/check-email";
import { loader as passkeyLoader } from "@/routes/auth/passkey";
import { loader as signInLoader } from "@/routes/auth/sign-in";
import { loader as indexLoader } from "@/routes/index";

// The session store is the boundary: a fake getAccess answers as a slid
// session would, with a renewed cookie on the way out.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const listClients = vi.fn<() => Promise<ClientSummary[]>>();
const createClient = vi.fn<Auth["createClient"]>();
const getTeam = vi.fn<Auth["getTeam"]>();
const inviteFirstOwner = vi.fn<Auth["inviteFirstOwner"]>();
const resendInvitation = vi.fn<Auth["resendInvitation"]>();
const revokeInvitation = vi.fn<Auth["revokeInvitation"]>();
const changeRole = vi.fn<Auth["changeRole"]>();
const removeMember = vi.fn<Auth["removeMember"]>();
const archiveClient = vi.fn<Auth["archiveClient"]>();
const unarchiveClient = vi.fn<Auth["unarchiveClient"]>();
const listArchivedClients = vi.fn<Auth["listArchivedClients"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    listClients: () => listClients(),
    createClient: (name: string) => createClient(name),
    getTeam: (clientId: string) => getTeam(clientId),
    inviteFirstOwner: (clientId: string, email: string) =>
      inviteFirstOwner(clientId, email),
    resendInvitation: (clientId: string, invitationId: string) =>
      resendInvitation(clientId, invitationId),
    revokeInvitation: (clientId: string, invitationId: string) =>
      revokeInvitation(clientId, invitationId),
    changeRole: (...args: Parameters<Auth["changeRole"]>) =>
      changeRole(...args),
    removeMember: (...args: Parameters<Auth["removeMember"]>) =>
      removeMember(...args),
    archiveClient: (clientId: string) => archiveClient(clientId),
    unarchiveClient: (clientId: string) => unarchiveClient(clientId),
    listArchivedClients: () => listArchivedClients(),
    listSocialProviders: () => [],
  },
}));

const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [],
  pendingInvitations: [],
  canInviteFirstOwner: true,
};

const INVITATION_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const INVITATION = {
  id: INVITATION_ID,
  email: "maya@example.test",
  sentAt: new Date("2026-10-12"),
};

const ADMIN_NEEDS_PASSKEY: Access = {
  kind: "admin-needs-passkey",
  email: "admin@test.local",
};
const ANONYMOUS: Access = { kind: "anonymous" };
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };

// Typed by the call site, so it fits each route's own loader or action args.
const PORTAL_ORIGIN = "http://localhost:5173";

function argsFor<Args>(
  path: string,
  method = "GET",
  params: Record<string, string> = {},
  body?: FormData,
  origin: string = PORTAL_ORIGIN,
): Args {
  const request = new Request(`${PORTAL_ORIGIN}${path}`, {
    method,
    body,
    headers: { origin },
  });
  // Loaders read only the request and params; the rest are unused here.
  return { request, params, context: {} } as Args;
}

function createArgs<Args>(name: string, origin = PORTAL_ORIGIN): Args {
  const body = new FormData();
  body.set("name", name);
  return argsFor<Args>("/admin?index", "POST", {}, body, origin);
}

function teamArgs<Args>(
  fields: Record<string, string>,
  origin = PORTAL_ORIGIN,
): Args {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return argsFor<Args>(
    `/admin/clients/${CLIENT_ID}/team`,
    "POST",
    { clientId: CLIENT_ID },
    body,
    origin,
  );
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

// The headers of what a loader or action returned or threw: a Response, or
// a data() result's init.
async function getResponseHeaders(
  run: () => Promise<unknown>,
): Promise<Headers> {
  let outcome: unknown;
  try {
    outcome = await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  // data() returns a plain { data, init } object (a library return value).
  return outcome instanceof Response
    ? outcome.headers
    : new Headers((outcome as { init?: ResponseInit }).init?.headers);
}

beforeEach(() => {
  getAccess.mockReset();
  listClients.mockReset();
  listClients.mockResolvedValue([]);
  createClient.mockReset();
  createClient.mockResolvedValue({
    value: { clientId: CLIENT_ID },
    error: null,
    status: 201,
  });
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  inviteFirstOwner.mockReset();
  inviteFirstOwner.mockResolvedValue({
    value: INVITATION,
    error: null,
    status: 201,
  });
  resendInvitation.mockReset();
  resendInvitation.mockResolvedValue({
    value: INVITATION,
    error: null,
    status: 200,
  });
  revokeInvitation.mockReset();
  revokeInvitation.mockResolvedValue({ value: null, error: null, status: 200 });
  changeRole.mockReset();
  changeRole.mockResolvedValue({ value: null, error: null, status: 200 });
  removeMember.mockReset();
  removeMember.mockResolvedValue({ value: null, error: null, status: 200 });
  archiveClient.mockReset();
  archiveClient.mockResolvedValue({ value: null, error: null, status: 200 });
  unarchiveClient.mockReset();
  unarchiveClient.mockResolvedValue({ value: null, error: null, status: 200 });
  listArchivedClients.mockReset();
  listArchivedClients.mockResolvedValue([]);
});

const MEMBER_USER_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcf";
const ROSTER_POSTS: Record<string, string>[] = [
  { intent: "make-owner", userId: MEMBER_USER_ID },
  { intent: "make-member", userId: MEMBER_USER_ID },
  { intent: "remove", userId: MEMBER_USER_ID },
];

describe("access loaders forward the session's Set-Cookie", () => {
  it("on a page the access may see", async () => {
    answerAs(ANONYMOUS);
    const signIn = await getResponseHeaders(() =>
      signInLoader(argsFor("/sign-in")),
    );
    const checkEmail = await getResponseHeaders(() =>
      checkEmailLoader(argsFor("/sign-in/check-email")),
    );
    answerAs(ADMIN_NEEDS_PASSKEY);
    const passkey = await getResponseHeaders(() =>
      passkeyLoader(argsFor("/passkey")),
    );

    expect(signIn.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(checkEmail.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(passkey.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("on the redirect away from a page it may not see", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    const headers = await getResponseHeaders(() =>
      signInLoader(argsFor("/sign-in")),
    );

    expect(headers.get("location")).toBe("/passkey");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("on the / redirect", async () => {
    answerAs(ANONYMOUS);

    const headers = await getResponseHeaders(() => indexLoader(argsFor("/")));

    expect(headers.get("location")).toBe("/sign-in");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});

describe("the Admin guard", () => {
  const guarded = {
    loader: () => adminLoader(argsFor("/admin")),
    "index loader": () => adminIndexLoader(argsFor("/admin?_data=index")),
    action: () => adminAction(argsFor("/admin", "POST")),
    "index action": () => adminIndexAction(createArgs("Acme")),
    "Team loader": () =>
      teamLoader(
        argsFor(`/admin/clients/${CLIENT_ID}/team`, "GET", {
          clientId: CLIENT_ID,
        }),
      ),
    "Team action": () =>
      teamAction(
        argsFor(`/admin/clients/${CLIENT_ID}/team`, "POST", {
          clientId: CLIENT_ID,
        }),
      ),
    "Team invite action": () =>
      teamAction(teamArgs({ intent: "invite", email: "maya@example.test" })),
  };

  for (const [use, run] of Object.entries(guarded)) {
    it(`lets a passkey session through the ${use}`, async () => {
      answerAs(ADMIN);

      const headers = await getResponseHeaders(run);

      expect(headers.get("location")).toBeNull();
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });

    it(`sends a magic-link session from the ${use} to /passkey`, async () => {
      answerAs(ADMIN_NEEDS_PASSKEY);

      const headers = await getResponseHeaders(run);

      expect(headers.get("location")).toBe("/passkey");
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });

    it(`sends a visitor without a session from the ${use} to /sign-in`, async () => {
      answerAs(ANONYMOUS);

      const headers = await getResponseHeaders(run);

      expect(headers.get("location")).toBe("/sign-in");
    });
  }

  it("creates nothing for a magic-link session", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    const headers = await getResponseHeaders(() =>
      adminIndexAction(createArgs("Acme")),
    );

    expect(headers.get("location")).toBe("/passkey");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("invites, resends and revokes nothing for a magic-link session", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    const posts: Record<string, string>[] = [
      { intent: "invite", email: "maya@example.test" },
      { intent: "resend", invitationId: INVITATION_ID },
      { intent: "revoke", invitationId: INVITATION_ID },
    ];
    for (const fields of posts) {
      const headers = await getResponseHeaders(() =>
        teamAction(teamArgs(fields)),
      );
      expect(headers.get("location")).toBe("/passkey");
    }
    expect(inviteFirstOwner).not.toHaveBeenCalled();
    expect(resendInvitation).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
  });

  it("sends a passkey session from /sign-in and /passkey to /admin", async () => {
    answerAs(ADMIN);

    const signIn = await getResponseHeaders(() =>
      signInLoader(argsFor("/sign-in")),
    );
    const passkey = await getResponseHeaders(() =>
      passkeyLoader(argsFor("/passkey")),
    );

    expect(signIn.get("location")).toBe("/admin");
    expect(passkey.get("location")).toBe("/admin");
  });
});

describe("when the roster can't load", () => {
  beforeEach(() => {
    answerAs(ADMIN);
    listClients.mockRejectedValue(new Error("connection lost"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("the layout still loads, with no Clients for the sidebar", async () => {
    const result = (await adminLoader(argsFor("/admin"))) as unknown as {
      data: { email: string; clients: null };
    };

    expect(result.data).toEqual({
      email: "admin@test.local",
      clients: null,
      archivedClients: [],
    });
  });

  it("the layout still loads when the archived Clients can't, with null for them", async () => {
    listClients.mockResolvedValue([]);
    listArchivedClients.mockRejectedValue(new Error("connection lost"));

    const result = (await adminLoader(argsFor("/admin"))) as unknown as {
      data: { clients: []; archivedClients: null };
    };

    expect(result.data).toMatchObject({ clients: [], archivedClients: null });
  });

  it("the Home loader returns, and the panel gets null, not a rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const result = (await adminIndexLoader(argsFor("/admin"))) as unknown as {
      data: { clients: Promise<ClientSummary[] | null> };
    };
    // Let Node's unhandled-rejection check run before anything awaits it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    // The panel shows its error state; the real error stays on the server.
    await expect(result.data.clients).resolves.toBeNull();
  });
});

describe("creating a Client", () => {
  beforeEach(() => {
    answerAs(ADMIN);
  });

  type Outcome = { data: unknown; init: ResponseInit | null };

  async function create(name: string): Promise<Outcome> {
    return (await adminIndexAction(createArgs(name))) as unknown as Outcome;
  }

  it("answers 201 with the new Client's id", async () => {
    const result = await create("  Acme ");

    expect(createClient).toHaveBeenCalledWith("  Acme ");
    expect(result.data).toEqual({ kind: "created", clientId: CLIENT_ID });
    expect(result.init?.status).toBe(201);
  });

  it("turns a duplicate into the field's copy", async () => {
    createClient.mockResolvedValue({
      value: null,
      error: "duplicate-name",
      status: 409,
    });

    const result = await create("acme");

    expect(result.data).toEqual({
      kind: "invalid",
      fieldError: "A Client with this name already exists.",
    });
    expect(result.init?.status).toBe(409);
  });

  it("names the bound a refused name broke", async () => {
    createClient.mockResolvedValue({
      value: null,
      error: "invalid-name",
      status: 422,
    });

    const blank = await create("  ");
    const long = await create("x".repeat(101));

    expect(blank.data).toEqual({
      kind: "invalid",
      fieldError: "Enter a name.",
    });
    expect(long.data).toEqual({
      kind: "invalid",
      fieldError: "Use 100 characters or fewer.",
    });
  });

  it("answers a failure without its details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createClient.mockRejectedValue(new Error("insert into organization ..."));

    const result = await create("Acme");

    expect(result.data).toEqual({ kind: "failed" });
    expect(result.init?.status).toBe(500);
  });
});

describe("the Team loader", () => {
  beforeEach(() => {
    answerAs(ADMIN);
  });

  function loadTeam(clientId: string) {
    return teamLoader(
      argsFor(`/admin/clients/${clientId}/team`, "GET", { clientId }),
    );
  }

  it("is a 404 for an unknown or malformed Client", async () => {
    getTeam.mockResolvedValue(null);

    const thrown = await loadTeam("not-a-uuid").catch(
      (error: unknown) => error,
    );

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("gives the page null, not an error, when the team can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTeam.mockRejectedValue(new Error("connection lost"));

    const result = (await loadTeam(CLIENT_ID)) as unknown as {
      data: { team: Team | null };
    };

    expect(result.data.team).toBeNull();
  });

  it("redirects a Client's workspace to its Team tab", async () => {
    const headers = await getResponseHeaders(() =>
      clientLoader(
        argsFor(`/admin/clients/${CLIENT_ID}`, "GET", { clientId: CLIENT_ID }),
      ),
    );

    expect(headers.get("location")).toBe(`/admin/clients/${CLIENT_ID}/team`);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("guards the workspace redirect", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    const headers = await getResponseHeaders(() =>
      clientLoader(
        argsFor(`/admin/clients/${CLIENT_ID}`, "GET", { clientId: CLIENT_ID }),
      ),
    );

    expect(headers.get("location")).toBe("/passkey");
  });
});

describe("a cross-origin create", () => {
  it("is refused with 403 and creates nothing, even from a sibling subdomain", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const thrown = await adminIndexAction(
      createArgs("Acme", "http://www.localhost:5173"),
    ).catch((error: unknown) => error);

    expect(thrown).toMatchObject({ init: { status: 403 } });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("a cross-origin invitation action", () => {
  it("is refused with 403 before anything runs, even from a sibling subdomain", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const posts: Record<string, string>[] = [
      { intent: "invite", email: "maya@example.test" },
      { intent: "resend", invitationId: INVITATION_ID },
      { intent: "revoke", invitationId: INVITATION_ID },
    ];
    for (const fields of posts) {
      const thrown = await teamAction(
        teamArgs(fields, "http://www.localhost:5173"),
      ).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
    }
    expect(inviteFirstOwner).not.toHaveBeenCalled();
    expect(resendInvitation).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("the Team's invitation actions", () => {
  beforeEach(() => answerAs(ADMIN));

  it("invites the posted email to this Client and answers 201", async () => {
    const result = await teamAction(
      teamArgs({ intent: "invite", email: "maya@example.test" }),
    );

    expect(inviteFirstOwner).toHaveBeenCalledWith(
      CLIENT_ID,
      "maya@example.test",
    );
    expect(result).toMatchObject({
      data: { kind: "sent", invitationId: INVITATION_ID },
      init: { status: 201 },
    });
  });

  it("passes a refusal on as its code and status", async () => {
    inviteFirstOwner.mockResolvedValue({
      value: null,
      error: "pending-exists",
      status: 409,
    });

    const result = await teamAction(
      teamArgs({ intent: "invite", email: "maya@example.test" }),
    );

    expect(result).toMatchObject({
      data: { kind: "refused", error: "pending-exists" },
      init: { status: 409 },
    });
  });

  it("resends and revokes the posted invitation", async () => {
    revokeInvitation.mockResolvedValue({
      value: null,
      error: "not-found",
      status: 404,
    });

    const resent = await teamAction(
      teamArgs({ intent: "resend", invitationId: INVITATION_ID }),
    );
    const revoked = await teamAction(
      teamArgs({ intent: "revoke", invitationId: INVITATION_ID }),
    );

    expect(resendInvitation).toHaveBeenCalledWith(CLIENT_ID, INVITATION_ID);
    expect(revokeInvitation).toHaveBeenCalledWith(CLIENT_ID, INVITATION_ID);
    expect(resent).toMatchObject({
      data: { kind: "resent" },
      init: { status: 200 },
    });
    expect(revoked).toMatchObject({
      data: { kind: "refused", error: "not-found" },
      init: { status: 404 },
    });
  });

  it("answers an unknown intent with 400", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await teamAction(teamArgs({ intent: "delete" }));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
  });

  it("answers a failure without its details, and logs no invitee email", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    inviteFirstOwner.mockRejectedValue(
      new Error(
        "Failed query: insert into invitation\nparams: maya@example.test",
      ),
    );

    const result = await teamAction(
      teamArgs({ intent: "invite", email: "maya@example.test" }),
    );

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("maya");
  });
});

describe("the Team's clientAction", () => {
  type ClientActionArgs = Parameters<typeof teamClientAction>[0];

  function runWith(serverAction: () => Promise<InvitationOutcome>) {
    return teamClientAction({ serverAction } as ClientActionArgs);
  }

  it("passes a success through as plain data", async () => {
    const sent: InvitationOutcome = {
      kind: "sent",
      invitationId: INVITATION_ID,
    };

    expect(await runWith(async () => sent)).toEqual(sent);
  });

  it("gives a refusal a 4xx status and a failure a 5xx", async () => {
    const refused = await runWith(async () => ({
      kind: "refused",
      error: "not-found",
    }));
    const failed = await runWith(async () => ({ kind: "failed" }));

    expect(refused).toMatchObject({ init: { status: 422 } });
    expect(failed).toMatchObject({ init: { status: 500 } });
  });

  it("turns a network failure into the failed outcome with a 5xx status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWith(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 503 },
    });
  });

  it("lets the guard's redirect through", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "/passkey" },
    });

    await expect(
      runWith(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});

describe("the create's clientAction", () => {
  type ClientActionArgs = Parameters<typeof adminIndexClientAction>[0];

  function runWith(serverAction: () => Promise<CreateClientOutcome>) {
    return adminIndexClientAction({ serverAction } as ClientActionArgs);
  }

  it("passes a create through as plain data", async () => {
    const created: CreateClientOutcome = {
      kind: "created",
      clientId: CLIENT_ID,
    };

    expect(await runWith(async () => created)).toEqual(created);
  });

  // RR skips revalidation only for a >= 400 status; offline, a revalidation
  // would replace the page with the root error boundary.
  it("gives a refused name a 4xx status", async () => {
    const result = await runWith(async () => ({
      kind: "invalid",
      fieldError: "Enter a name.",
    }));

    expect(result).toMatchObject({
      data: { kind: "invalid" },
      init: { status: 422 },
    });
  });

  it("turns a network failure into the banner outcome with a 5xx status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runWith(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 503 },
    });
  });

  it("lets the guard's redirect through", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "/passkey" },
    });

    await expect(
      runWith(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});

describe("Admin revalidation", () => {
  type RevalidateArgs = Parameters<typeof adminShouldRevalidate>[0];

  function argsBetween(
    current: string,
    next: string,
    extra: Partial<RevalidateArgs> = {},
  ): RevalidateArgs {
    return {
      currentUrl: new URL(current, PORTAL_ORIGIN),
      nextUrl: new URL(next, PORTAL_ORIGIN),
      defaultShouldRevalidate: true,
      ...extra,
    } as RevalidateArgs;
  }

  const routes = {
    layout: adminShouldRevalidate,
    Home: adminIndexShouldRevalidate,
  };

  const teamPath = `/admin/clients/${CLIENT_ID}/team`;
  const teamRoutes = {
    layout: adminShouldRevalidate,
    Team: teamShouldRevalidate,
  };

  for (const [name, shouldRevalidate] of Object.entries(teamRoutes)) {
    it(`skips the ${name} loader when the Team tab drops its invite flag`, () => {
      expect(
        shouldRevalidate(argsBetween(`${teamPath}?invite=1`, teamPath)),
      ).toBe(false);
    });

    it(`runs the ${name} loader for any other Team navigation`, () => {
      expect(
        shouldRevalidate(argsBetween(teamPath, `${teamPath}?invite=1`)),
      ).toBe(true);
      expect(
        shouldRevalidate(argsBetween(`${teamPath}?invite=1`, "/admin")),
      ).toBe(true);
      expect(
        shouldRevalidate(
          argsBetween(teamPath, teamPath, {
            formMethod: "POST",
            formAction: teamPath,
          }),
        ),
      ).toBe(true);
    });
  }

  for (const [name, shouldRevalidate] of Object.entries(routes)) {
    it(`skips the ${name} loader when only the drawer opens or closes`, () => {
      expect(shouldRevalidate(argsBetween("/admin", "/admin?new=client"))).toBe(
        false,
      );
      expect(shouldRevalidate(argsBetween("/admin?new=client", "/admin"))).toBe(
        false,
      );
    });

    it(`runs the ${name} loader for any other navigation or a create`, () => {
      expect(
        shouldRevalidate(
          argsBetween("/admin/clients/x/team", "/admin?new=client"),
        ),
      ).toBe(true);
      expect(
        shouldRevalidate(argsBetween("/admin?new=client", "/admin?q=1")),
      ).toBe(true);
      expect(
        shouldRevalidate(
          argsBetween("/admin?new=client", "/admin?new=client", {
            formMethod: "POST",
            formAction: "/admin?index",
          }),
        ),
      ).toBe(true);
    });

    it(`keeps the ${name} loader still after a failed theme change`, () => {
      expect(
        shouldRevalidate(
          argsBetween("/admin", "/admin", {
            formAction: "/theme",
            actionResult: { ok: false },
          }),
        ),
      ).toBe(false);
    });
  }
});

describe("the Team's roster actions", () => {
  it("are refused with 403 before the body is read, even from a sibling subdomain", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of ROSTER_POSTS) {
      const args = teamArgs<Parameters<typeof teamAction>[0]>(
        fields,
        "http://www.localhost:5173",
      );
      const thrown = await teamAction(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(changeRole).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("change nothing for a magic-link session", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    for (const fields of ROSTER_POSTS) {
      const headers = await getResponseHeaders(() =>
        teamAction(teamArgs(fields)),
      );
      expect(headers.get("location")).toBe("/passkey");
    }
    expect(changeRole).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("change the posted user's role in this Client as the Admin", async () => {
    answerAs(ADMIN);

    const promoted = await teamAction(teamArgs(ROSTER_POSTS[0]));
    const demoted = await teamAction(teamArgs(ROSTER_POSTS[1]));

    expect(changeRole.mock.calls).toEqual([
      [{ kind: "admin" }, CLIENT_ID, MEMBER_USER_ID, "owner"],
      [{ kind: "admin" }, CLIENT_ID, MEMBER_USER_ID, "member"],
    ]);
    for (const result of [promoted, demoted]) {
      expect(result).toMatchObject({
        data: { kind: "role-changed" },
        init: { status: 200 },
      });
    }
  });

  it("remove the posted user from this Client as the Admin", async () => {
    answerAs(ADMIN);

    const result = await teamAction(teamArgs(ROSTER_POSTS[2]));

    expect(removeMember).toHaveBeenCalledWith(
      { kind: "admin" },
      CLIENT_ID,
      MEMBER_USER_ID,
    );
    expect(result).toMatchObject({
      data: { kind: "removed" },
      init: { status: 200 },
    });
  });

  it("pass a refusal on as its code and status", async () => {
    answerAs(ADMIN);
    removeMember.mockResolvedValue({
      value: null,
      error: "last-owner",
      status: 409,
    });

    const result = await teamAction(teamArgs(ROSTER_POSTS[2]));

    expect(result).toMatchObject({
      data: { kind: "refused", error: "last-owner" },
      init: { status: 409 },
    });
  });

  it("answer a failure without its details", async () => {
    answerAs(ADMIN);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    changeRole.mockRejectedValue(
      new Error("Failed query: update member\nparams: leo@acme.test"),
    );

    const result = await teamAction(teamArgs(ROSTER_POSTS[0]));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("leo");
  });
});

describe("the Team's archive actions", () => {
  const ARCHIVE_POSTS: Record<string, string>[] = [
    { intent: "archive" },
    { intent: "unarchive" },
  ];

  it("are refused with 403 before the body is read, even from a sibling subdomain", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of ARCHIVE_POSTS) {
      const args = teamArgs<Parameters<typeof teamAction>[0]>(
        fields,
        "http://www.localhost:5173",
      );
      const thrown = await teamAction(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(archiveClient).not.toHaveBeenCalled();
    expect(unarchiveClient).not.toHaveBeenCalled();
  });

  it("change nothing for a magic-link session", async () => {
    answerAs(ADMIN_NEEDS_PASSKEY);

    for (const fields of ARCHIVE_POSTS) {
      const headers = await getResponseHeaders(() =>
        teamAction(teamArgs(fields)),
      );
      expect(headers.get("location")).toBe("/passkey");
    }
    expect(archiveClient).not.toHaveBeenCalled();
    expect(unarchiveClient).not.toHaveBeenCalled();
  });

  it("archive and unarchive this Client", async () => {
    answerAs(ADMIN);

    const archived = await teamAction(teamArgs(ARCHIVE_POSTS[0]));
    const unarchived = await teamAction(teamArgs(ARCHIVE_POSTS[1]));

    expect(archiveClient).toHaveBeenCalledWith(CLIENT_ID);
    expect(unarchiveClient).toHaveBeenCalledWith(CLIENT_ID);
    expect(archived).toMatchObject({
      data: { kind: "archived" },
      init: { status: 200 },
    });
    expect(unarchived).toMatchObject({
      data: { kind: "unarchived" },
      init: { status: 200 },
    });
  });

  it("pass not-found on as a refusal with its status", async () => {
    answerAs(ADMIN);
    archiveClient.mockResolvedValue({
      value: null,
      error: "not-found",
      status: 404,
    });

    const result = await teamAction(teamArgs(ARCHIVE_POSTS[0]));

    expect(result).toMatchObject({
      data: { kind: "refused", error: "not-found" },
      init: { status: 404 },
    });
  });

  it("answer a failure with a 5xx", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    unarchiveClient.mockRejectedValue(new Error("connection lost"));

    const result = await teamAction(teamArgs(ARCHIVE_POSTS[1]));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
  });
});
