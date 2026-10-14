import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import { requireClientMutation } from "@/lib/auth/require-access.server";
import { loader as adminLoader } from "@/routes/admin/layout";
import {
  headers as clientLayoutHeaders,
  loader as clientLayoutLoader,
  shouldRevalidate as clientLayoutShouldRevalidate,
} from "@/routes/client/layout";
import {
  action as teamAction,
  clientAction as teamClientAction,
  headers as teamHeaders,
  loader as teamLoader,
  shouldRevalidate as teamShouldRevalidate,
} from "@/routes/client/team";
import type { InvitationOutcome } from "@/lib/team-invitations";
import {
  headers as noAccessHeaders,
  loader as noAccessLoader,
  shouldRevalidate as noAccessShouldRevalidate,
} from "@/routes/auth/no-access";
import { loader as indexLoader } from "@/routes/index";

// The session store is the boundary: a fake getAccess answers as a slid
// session would, with a renewed cookie on the way out.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const listClients = vi.fn<Auth["listClients"]>();
const inviteMember = vi.fn<Auth["inviteMember"]>();
const resendMemberInvitation = vi.fn<Auth["resendMemberInvitation"]>();
const revokeMemberInvitation = vi.fn<Auth["revokeMemberInvitation"]>();
const changeRole = vi.fn<Auth["changeRole"]>();
const removeMember = vi.fn<Auth["removeMember"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
    listClients: () => listClients(),
    inviteMember: (...args: Parameters<Auth["inviteMember"]>) =>
      inviteMember(...args),
    resendMemberInvitation: (
      ...args: Parameters<Auth["resendMemberInvitation"]>
    ) => resendMemberInvitation(...args),
    revokeMemberInvitation: (
      ...args: Parameters<Auth["revokeMemberInvitation"]>
    ) => revokeMemberInvitation(...args),
    changeRole: (...args: Parameters<Auth["changeRole"]>) =>
      changeRole(...args),
    removeMember: (...args: Parameters<Auth["removeMember"]>) =>
      removeMember(...args),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const OTHER_CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789ffff";
const INVITEE_EMAIL = "pending.invitee@acme.test";
const INVITATION_ID = "0199d0a4-5b6c-7d8e-9f01-23456789eeee";
const ADMIN_SENT_EMAIL = "first.owner@acme.test";

const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [
    { userId: "u1", email: "maya@acme.test", name: "Maya Chen", role: "owner" },
    { userId: "u2", email: "jo@acme.test", name: "", role: "member" },
  ],
  pendingInvitations: [
    {
      id: "i1",
      email: INVITEE_EMAIL,
      sentAt: new Date("2026-10-12"),
      role: "member",
    },
    // The Admin's: never on the client page.
    {
      id: "i0",
      email: ADMIN_SENT_EMAIL,
      sentAt: new Date("2026-10-11"),
      role: "owner",
    },
  ],
  canInviteFirstOwner: false,
};

const ANONYMOUS: Access = { kind: "anonymous" };
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const ADMIN_NEEDS_PASSKEY: Access = {
  kind: "admin-needs-passkey",
  email: "admin@test.local",
};
const OWNER: Access = {
  kind: "client",
  userId: "u1",
  email: "maya@acme.test",
  name: "Maya Chen",
  clientId: CLIENT_ID,
  clientName: "Acme",
  role: "owner",
};
const MEMBER: Access = { ...OWNER, userId: "u2", name: "", role: "member" };
const INVITEE: Access = {
  kind: "invitee",
  userId: "u3",
  email: "new@acme.test",
};
const ARCHIVED: Access = { kind: "no-access", reason: "archived" };
const NOT_INVITED: Access = { kind: "no-access", reason: "not-invited" };

function argsFor<Args>(
  path: string,
  method = "GET",
  origin: string = PORTAL_ORIGIN,
  body?: FormData,
): Args {
  const request = new Request(`${PORTAL_ORIGIN}${path}`, {
    method,
    body,
    headers: { origin },
  });
  // Loaders read only the request and params; the rest are unused here.
  return { request, params: {}, context: {} } as Args;
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

// What a loader returned or threw: a redirect Response, or a data() result.
async function settle(run: () => Promise<unknown>): Promise<{
  headers: Headers;
  data: unknown;
}> {
  let outcome: unknown;
  try {
    outcome = await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  if (outcome instanceof Response) {
    return { headers: outcome.headers, data: null };
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit };
  return { headers: new Headers(result.init?.headers), data: result.data };
}

beforeEach(() => {
  getAccess.mockReset();
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  listClients.mockReset();
  listClients.mockResolvedValue([]);
  inviteMember.mockReset();
  inviteMember.mockResolvedValue({
    value: { id: INVITATION_ID, email: "leo@acme.test", sentAt: new Date() },
    error: null,
    status: 201,
  });
  resendMemberInvitation.mockReset();
  resendMemberInvitation.mockResolvedValue({
    value: { id: INVITATION_ID, email: "leo@acme.test", sentAt: new Date() },
    error: null,
    status: 200,
  });
  revokeMemberInvitation.mockReset();
  revokeMemberInvitation.mockResolvedValue({
    value: null,
    error: null,
    status: 200,
  });
  changeRole.mockReset();
  changeRole.mockResolvedValue({ value: null, error: null, status: 200 });
  removeMember.mockReset();
  removeMember.mockResolvedValue({ value: null, error: null, status: 200 });
});

describe("the / redirect", () => {
  const homes: [string, Access, string][] = [
    ["a Client User", OWNER, "/team"],
    ["a no-access session", ARCHIVED, "/no-access"],
    ["a visitor", ANONYMOUS, "/sign-in"],
  ];

  for (const [who, access, home] of homes) {
    it(`sends ${who} to ${home}, with the session's cookie`, async () => {
      answerAs(access);

      const { headers } = await settle(() => indexLoader(argsFor("/")));

      expect(headers.get("location")).toBe(home);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });
  }
});

describe("the client guard", () => {
  const guarded = {
    "client layout": () => clientLayoutLoader(argsFor("/team")),
    "Team loader": () => teamLoader(argsFor("/team")),
  };
  const turnedAway: [string, Access, string][] = [
    ["the Admin", ADMIN, "/admin"],
    ["a magic-link Admin", ADMIN_NEEDS_PASSKEY, "/passkey"],
    ["a visitor", ANONYMOUS, "/sign-in"],
    ["an invitee", INVITEE, "/"],
    ["a no-access session", ARCHIVED, "/no-access"],
  ];

  for (const [use, run] of Object.entries(guarded)) {
    for (const [who, access, home] of turnedAway) {
      it(`sends ${who} from the ${use} to ${home}`, async () => {
        answerAs(access);

        const { headers } = await settle(run);

        expect(headers.get("location")).toBe(home);
        expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      });
    }

    it(`lets a Client User through the ${use}, with the session's cookie`, async () => {
      answerAs(MEMBER);

      const { headers } = await settle(run);

      expect(headers.get("location")).toBeNull();
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });
  }

  it("gives the shell the viewer's name, email, role and Client", async () => {
    answerAs(OWNER);

    const { data } = await settle(() => clientLayoutLoader(argsFor("/team")));

    expect(data).toEqual({
      clientName: "Acme",
      name: "Maya Chen",
      email: "maya@acme.test",
      role: "owner",
    });
  });

  it("sends a Client User away from /admin to /team", async () => {
    answerAs(OWNER);

    const { headers } = await settle(() => adminLoader(argsFor("/admin")));

    expect(headers.get("location")).toBe("/team");
    expect(listClients).not.toHaveBeenCalled();
  });
});

describe("the Team loader", () => {
  it("loads the viewer's own Client, whatever the URL says", async () => {
    answerAs(MEMBER);

    await teamLoader(argsFor(`/team?clientId=${OTHER_CLIENT_ID}`));

    expect(getTeam).toHaveBeenCalledWith(CLIENT_ID);
  });

  it("gives an Owner the roster and only the pending Member invitations", async () => {
    answerAs(OWNER);

    const { data } = await settle(() => teamLoader(argsFor("/team")));

    expect(data).toEqual({
      clientName: "Acme",
      role: "owner",
      userId: "u1",
      team: {
        members: TEAM.members,
        pendingInvitations: [TEAM.pendingInvitations[0]],
      },
    });
    expect(JSON.stringify(data)).not.toContain(ADMIN_SENT_EMAIL);
  });

  it("never sends a Member the pending invitations", async () => {
    answerAs(MEMBER);

    const { data } = await settle(() => teamLoader(argsFor("/team")));

    expect(data).toEqual({
      clientName: "Acme",
      role: "member",
      userId: "u2",
      team: { members: TEAM.members },
    });
    expect(JSON.stringify(data)).not.toContain(INVITEE_EMAIL);
  });

  it("gives the page null, not the error, when the team can't load", async () => {
    answerAs(OWNER);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    getTeam.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => teamLoader(argsFor("/team")));

    expect(data).toEqual({
      clientName: "Acme",
      role: "owner",
      userId: "u1",
      team: null,
    });
    expect(errorLog).toHaveBeenCalled();
  });

  it("gives the page null when the Client has gone", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getTeam.mockResolvedValue(null);

    const { data } = await settle(() => teamLoader(argsFor("/team")));

    expect(data).toEqual({
      clientName: "Acme",
      role: "owner",
      userId: "u1",
      team: null,
    });
  });
});

describe("the No access loader", () => {
  async function loadNoAccess(path: string) {
    return settle(() => noAccessLoader(argsFor(path)));
  }

  it("shows a visitor the reason in the URL", async () => {
    answerAs(ANONYMOUS);

    const archived = await loadNoAccess("/no-access?reason=archived");
    const notInvited = await loadNoAccess("/no-access?reason=not-invited");

    expect(archived.data).toEqual({ reason: "archived", hasSession: false });
    expect(notInvited.data).toEqual({
      reason: "not-invited",
      hasSession: false,
    });
    expect(archived.headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("falls back to not-invited for a missing or unknown reason, never echoing it", async () => {
    answerAs(ANONYMOUS);

    const missing = await loadNoAccess("/no-access");
    const unknown = await loadNoAccess("/no-access?reason=%3Cscript%3E");

    expect(missing.data).toEqual({ reason: "not-invited", hasSession: false });
    expect(unknown.data).toEqual({ reason: "not-invited", hasSession: false });
  });

  it("shows a no-access session its own reason, over the URL's", async () => {
    answerAs(ARCHIVED);
    const archived = await loadNoAccess("/no-access?reason=not-invited");
    answerAs(NOT_INVITED);
    const notInvited = await loadNoAccess("/no-access?reason=archived");

    expect(archived.data).toEqual({ reason: "archived", hasSession: true });
    expect(notInvited.data).toEqual({
      reason: "not-invited",
      hasSession: true,
    });
  });

  it("offers an invitee the sign out", async () => {
    answerAs(INVITEE);

    const { data } = await loadNoAccess("/no-access?reason=not-invited");

    expect(data).toEqual({ reason: "not-invited", hasSession: true });
  });

  const sentHome: [string, Access, string][] = [
    ["a Client User", OWNER, "/team"],
    ["the Admin", ADMIN, "/admin"],
    ["a magic-link Admin", ADMIN_NEEDS_PASSKEY, "/passkey"],
  ];

  for (const [who, access, home] of sentHome) {
    it(`sends ${who} home to ${home}`, async () => {
      answerAs(access);

      const { headers } = await loadNoAccess("/no-access?reason=archived");

      expect(headers.get("location")).toBe(home);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });
  }
});

describe("requireClientMutation", () => {
  function postFrom(origin: string): Request {
    const body = new FormData();
    body.set("intent", "invite");
    return new Request(`${PORTAL_ORIGIN}/team`, {
      method: "POST",
      body,
      headers: { origin },
    });
  }

  it("refuses a cross-origin POST with 403 before the body is read", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = postFrom("http://www.localhost:5173");

    const thrown = await requireClientMutation(request).catch(
      (error: unknown) => error,
    );

    expect(thrown).toMatchObject({ init: { status: 403 } });
    const { headers } = await settle(() => Promise.reject(thrown));
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(request.bodyUsed).toBe(false);
  });

  it("lets a same-origin POST from a Client User through", async () => {
    answerAs(MEMBER);

    const result = await requireClientMutation(postFrom(PORTAL_ORIGIN));

    expect(result.access).toEqual(MEMBER);
    expect(result.headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("redirects anyone else home, whatever the origin", async () => {
    answerAs(ADMIN);

    const { headers } = await settle(() =>
      requireClientMutation(postFrom("http://evil.test")),
    );

    expect(headers.get("location")).toBe("/admin");
  });
});

describe("the Team's invitation actions", () => {
  function post(
    fields: Record<string, string>,
    origin: string = PORTAL_ORIGIN,
  ): Parameters<typeof teamAction>[0] {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    return argsFor("/team", "POST", origin, body);
  }

  const posts: Record<string, string>[] = [
    { intent: "invite", email: "leo@acme.test" },
    { intent: "resend", invitationId: INVITATION_ID },
    { intent: "revoke", invitationId: INVITATION_ID },
  ];

  function expectNothingRan(): void {
    expect(inviteMember).not.toHaveBeenCalled();
    expect(resendMemberInvitation).not.toHaveBeenCalled();
    expect(revokeMemberInvitation).not.toHaveBeenCalled();
  }

  it("refuses a cross-origin POST with 403 before the body is read", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of posts) {
      const args = post(fields, "http://www.localhost:5173");
      const thrown = await teamAction(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
      expect(args.request.bodyUsed).toBe(false);
    }
    expectNothingRan();
  });

  it("refuses a Member's POST as forbidden with 403, running nothing", async () => {
    answerAs(MEMBER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of posts) {
      const args = post(fields);
      const { data, headers } = await settle(() => teamAction(args));
      expect(data).toEqual({ kind: "refused", error: "forbidden" });
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      expect(args.request.bodyUsed).toBe(false);
    }
    const result = await teamAction(post(posts[0]));
    expect(result).toMatchObject({ init: { status: 403 } });
    expectNothingRan();
  });

  it("sends an anonymous POST to sign in", async () => {
    answerAs(ANONYMOUS);

    const { headers } = await settle(() => teamAction(post(posts[0])));

    expect(headers.get("location")).toBe("/sign-in");
    expectNothingRan();
  });

  it("invites the posted email as the Owner and answers 201", async () => {
    answerAs(OWNER);

    const result = await teamAction(post(posts[0]));

    expect(inviteMember).toHaveBeenCalledWith(OWNER, "leo@acme.test");
    expect(result).toMatchObject({
      data: { kind: "sent", invitationId: INVITATION_ID },
      init: { status: 201 },
    });
  });

  it("passes a refusal on as its code and status", async () => {
    answerAs(OWNER);
    inviteMember.mockResolvedValue({
      value: null,
      error: "too-many-for-client",
      status: 429,
    });

    const result = await teamAction(post(posts[0]));

    expect(result).toMatchObject({
      data: { kind: "refused", error: "too-many-for-client" },
      init: { status: 429 },
    });
  });

  it("resends and revokes the posted invitation as the Owner", async () => {
    answerAs(OWNER);
    revokeMemberInvitation.mockResolvedValue({
      value: null,
      error: "not-found",
      status: 404,
    });

    const resent = await teamAction(post(posts[1]));
    const revoked = await teamAction(post(posts[2]));

    expect(resendMemberInvitation).toHaveBeenCalledWith(OWNER, INVITATION_ID);
    expect(revokeMemberInvitation).toHaveBeenCalledWith(OWNER, INVITATION_ID);
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
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await teamAction(post({ intent: "promote" }));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
  });

  it("answers a failure without its details, and logs no invitee email", async () => {
    answerAs(OWNER);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    inviteMember.mockRejectedValue(
      new Error("Failed query: insert into invitation\nparams: leo@acme.test"),
    );

    const result = await teamAction(post(posts[0]));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("leo");
  });
});

describe("the Team's roster actions", () => {
  function post(
    fields: Record<string, string>,
    origin: string = PORTAL_ORIGIN,
  ): Parameters<typeof teamAction>[0] {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) body.set(name, value);
    return argsFor("/team", "POST", origin, body);
  }

  const posts: Record<string, string>[] = [
    { intent: "make-owner", userId: "u2" },
    { intent: "make-member", userId: "u2" },
    { intent: "remove", userId: "u2" },
  ];

  it("refuses a cross-origin POST with 403 before the body is read", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of posts) {
      const args = post(fields, "http://www.localhost:5173");
      const thrown = await teamAction(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(changeRole).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("refuses a Member's POST as forbidden with 403, running nothing", async () => {
    answerAs(MEMBER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of posts) {
      const args = post(fields);
      const result = await teamAction(args);
      expect(result).toMatchObject({
        data: { kind: "refused", error: "forbidden" },
        init: { status: 403 },
      });
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(changeRole).not.toHaveBeenCalled();
    expect(removeMember).not.toHaveBeenCalled();
  });

  it("changes the posted user's role in the Owner's own Client", async () => {
    answerAs(OWNER);

    const promoted = await teamAction(post(posts[0]));
    const demoted = await teamAction(post(posts[1]));

    expect(changeRole.mock.calls).toEqual([
      [OWNER, CLIENT_ID, "u2", "owner"],
      [OWNER, CLIENT_ID, "u2", "member"],
    ]);
    for (const result of [promoted, demoted]) {
      expect(result).toMatchObject({
        data: { kind: "role-changed" },
        init: { status: 200 },
      });
    }
  });

  it("answers a role someone already set as a role change", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    changeRole.mockResolvedValue({
      value: null,
      error: "no-change",
      status: 409,
    });

    const result = await teamAction(post(posts[0]));

    expect(result).toMatchObject({
      data: { kind: "role-changed" },
      init: { status: 200 },
    });
  });

  it("removes the posted user from the Owner's own Client", async () => {
    answerAs(OWNER);

    const result = await teamAction(post(posts[2]));

    expect(removeMember).toHaveBeenCalledWith(OWNER, CLIENT_ID, "u2");
    expect(result).toMatchObject({
      data: { kind: "removed" },
      init: { status: 200 },
    });
  });

  it("passes a forged self-targeting POST's refusal on with its 4xx", async () => {
    answerAs(OWNER);
    removeMember.mockResolvedValue({ value: null, error: "self", status: 422 });

    const result = await teamAction(post({ intent: "remove", userId: "u1" }));

    expect(removeMember).toHaveBeenCalledWith(OWNER, CLIENT_ID, "u1");
    expect(result).toMatchObject({
      data: { kind: "refused", error: "self" },
      init: { status: 422 },
    });
  });

  it("answers a failure without its details", async () => {
    answerAs(OWNER);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    removeMember.mockRejectedValue(
      new Error("Failed query: delete from member\nparams: jo@acme.test"),
    );

    const result = await teamAction(post(posts[2]));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("jo@");
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
      error: "forbidden",
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
      headers: { location: "/sign-in" },
    });

    await expect(
      runWith(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});

describe("every new route", () => {
  type RevalidateArgs = Parameters<typeof teamShouldRevalidate>[0];
  type HeadersArgs = Parameters<typeof teamHeaders>[0];

  const routes = {
    "client layout": {
      shouldRevalidate: clientLayoutShouldRevalidate,
      headers: clientLayoutHeaders,
    },
    Team: { shouldRevalidate: teamShouldRevalidate, headers: teamHeaders },
    "No access": {
      shouldRevalidate: noAccessShouldRevalidate,
      headers: noAccessHeaders,
    },
  };

  for (const [name, route] of Object.entries(routes)) {
    it(`keeps the ${name} loader still after a failed theme change`, () => {
      const args = {
        currentUrl: new URL("/team", PORTAL_ORIGIN),
        nextUrl: new URL("/team", PORTAL_ORIGIN),
        formAction: "/theme",
        actionResult: { ok: false },
        defaultShouldRevalidate: true,
      } as RevalidateArgs;

      expect(route.shouldRevalidate(args)).toBe(false);
    });

    it(`marks the ${name} page no-store and keeps the session's cookie`, () => {
      const loaderHeaders = new Headers();
      loaderHeaders.append("set-cookie", RENEWED_COOKIE);

      const headers = new Headers(
        route.headers({
          loaderHeaders,
          parentHeaders: new Headers(),
        } as HeadersArgs),
      );

      expect(headers.get("cache-control")).toBe("private, no-store");
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });
  }
});
