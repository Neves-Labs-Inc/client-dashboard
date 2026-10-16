import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth } from "@/lib/auth/auth";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import {
  action as invitationAction,
  clientAction as invitationClientAction,
  headers as invitationHeaders,
  loader as invitationLoader,
  shouldRevalidate as invitationShouldRevalidate,
} from "@/routes/auth/invitation";
import { loader as signInLoader } from "@/routes/auth/sign-in";
import { loader as indexLoader } from "@/routes/index";
import { action as signOutAction } from "@/routes/sign-out";

// The session store is the boundary: a fake getAccess answers as a slid
// session would, with a renewed cookie on the way out.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const CLEARED_COOKIE = "better-auth.session_token=; Max-Age=0; Path=/";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const joinInvitation = vi.fn<Auth["joinInvitation"]>();
const getLiveInvitation = vi.fn<Auth["getLiveInvitation"]>();
const requestInvitationLink = vi.fn<Auth["requestInvitationLink"]>();
const listSocialProviders = vi.fn<Auth["listSocialProviders"]>();
const signOut = vi.fn<Auth["signOut"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    joinInvitation: (request: Request, id: string | null) =>
      joinInvitation(request, id),
    getLiveInvitation: (id: string) => getLiveInvitation(id),
    requestInvitationLink: (request: Request, id: string) =>
      requestInvitationLink(request, id),
    listSocialProviders: () => listSocialProviders(),
    signOut: (request: Request) => signOut(request),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const INVITATION_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const INVITATION_PATH = `/invitations/${INVITATION_ID}`;
const INVITED_EMAIL = "leo@acme.test";
const CLIENT_NAME = "Acme Holdings";
const LIVE = { email: INVITED_EMAIL, clientName: CLIENT_NAME };
const JOINED = { clientId: CLIENT_ID, clientName: CLIENT_NAME };

const ANONYMOUS: Access = { kind: "anonymous" };
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const ADMIN_NEEDS_PASSKEY: Access = {
  kind: "admin-needs-passkey",
  email: "admin@test.local",
};
const INVITEE: Access = { kind: "invitee", userId: "u3", email: INVITED_EMAIL };
const OTHER_CLIENT_USER: Access = {
  kind: "client",
  userId: "u9",
  email: "maya@other.test",
  name: "Maya",
  clientId: "0199d0a4-5b6c-7d8e-9f01-23456789ffff",
  clientName: "Other",
  role: "owner",
};
const ARCHIVED: Access = { kind: "no-access", reason: "archived" };

function argsFor<Args>(
  path: string,
  options: {
    method?: string;
    origin?: string;
    body?: FormData;
    params?: Record<string, string>;
  } = {},
): Args {
  const { method = "GET", origin = PORTAL_ORIGIN, body, params = {} } = options;
  const request = new Request(`${PORTAL_ORIGIN}${path}`, {
    method,
    body,
    headers: { origin },
  });
  // Loaders read only the request and params; the rest are unused here.
  return { request, params, context: {} } as Args;
}

function pageArgs<Args>(
  options: { method?: string; origin?: string; id?: string } = {},
): Args {
  const { id = INVITATION_ID, ...rest } = options;
  return argsFor<Args>(`/invitations/${id}`, {
    ...rest,
    body: rest.method === "POST" ? new FormData() : undefined,
    params: { invitationId: id },
  });
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

// What a loader or action returned or threw: a Response, or a data() result.
async function settle(run: () => Promise<unknown>): Promise<{
  headers: Headers;
  status: number;
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
    return { headers: outcome.headers, status: outcome.status, data: null };
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit };
  return {
    headers: new Headers(result.init?.headers),
    status: result.init?.status ?? 200,
    data: result.data,
  };
}

beforeEach(() => {
  getAccess.mockReset();
  joinInvitation.mockReset();
  joinInvitation.mockResolvedValue({ value: JOINED, error: null, status: 201 });
  getLiveInvitation.mockReset();
  getLiveInvitation.mockResolvedValue(LIVE);
  requestInvitationLink.mockReset();
  requestInvitationLink.mockResolvedValue({
    value: null,
    error: null,
    status: 200,
  });
  listSocialProviders.mockReset();
  listSocialProviders.mockReturnValue(["google"]);
  signOut.mockReset();
  signOut.mockResolvedValue(new Headers({ "set-cookie": CLEARED_COOKIE }));
});

describe("the / redirect for an invitee", () => {
  it("joins the newest live Invitation and lands on /overview with the welcome flag", async () => {
    answerAs(INVITEE);

    const { headers } = await settle(() => indexLoader(argsFor("/")));

    expect(joinInvitation).toHaveBeenCalledWith(expect.any(Request), null);
    expect(headers.get("location")).toBe("/overview?welcome");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("lands on /overview without the flag when the join was already done", async () => {
    answerAs(INVITEE);
    joinInvitation.mockResolvedValue({
      value: JOINED,
      error: null,
      status: 200,
    });

    const { headers } = await settle(() => indexLoader(argsFor("/")));

    expect(headers.get("location")).toBe("/overview");
  });

  const refusals: [string, string][] = [
    ["archived", "/no-access?reason=archived"],
    ["not-found", "/no-access?reason=not-invited"],
    ["ineligible", "/no-access?reason=not-invited"],
  ];

  for (const [error, home] of refusals) {
    it(`sends a refused join (${error}) to ${home}`, async () => {
      answerAs(INVITEE);
      joinInvitation.mockResolvedValue({
        value: null,
        error: error as "archived",
        status: 403,
      });

      const { headers } = await settle(() => indexLoader(argsFor("/")));

      expect(headers.get("location")).toBe(home);
    });
  }

  it("joins nothing for any other access", async () => {
    for (const access of [ANONYMOUS, ADMIN, OTHER_CLIENT_USER, ARCHIVED]) {
      answerAs(access);
      await settle(() => indexLoader(argsFor("/")));
    }

    expect(joinInvitation).not.toHaveBeenCalled();
  });
});

describe("the Invitation page", () => {
  it("shows a visitor a live Invitation's Client, email and Google, without joining", async () => {
    answerAs(ANONYMOUS);

    const { data, headers, status } = await settle(() =>
      invitationLoader(pageArgs()),
    );

    expect(status).toBe(200);
    expect(data).toEqual({
      kind: "live",
      invitationId: INVITATION_ID,
      email: INVITED_EMAIL,
      clientName: CLIENT_NAME,
      isGoogleEnabled: true,
    });
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    expect(joinInvitation).not.toHaveBeenCalled();
  });

  it("leaves Google out when it isn't configured", async () => {
    answerAs(ANONYMOUS);
    listSocialProviders.mockReturnValue([]);

    const { data } = await settle(() => invitationLoader(pageArgs()));

    expect(data).toMatchObject({ kind: "live", isGoogleEnabled: false });
  });

  it("shows a dead Invitation as not valid, with no email or Client", async () => {
    answerAs(ANONYMOUS);
    getLiveInvitation.mockResolvedValue(null);

    const { data } = await settle(() =>
      invitationLoader(pageArgs({ id: "not-a-uuid" })),
    );

    expect(data).toEqual({ kind: "not-valid" });
  });

  it("joins an invitee and sends them to /overview with the welcome flag", async () => {
    answerAs(INVITEE);

    const { headers } = await settle(() => invitationLoader(pageArgs()));

    expect(joinInvitation).toHaveBeenCalledWith(
      expect.any(Request),
      INVITATION_ID,
    );
    expect(headers.get("location")).toBe("/overview?welcome");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("sends a member re-opening their accepted link to /overview, no toast", async () => {
    answerAs({ ...OTHER_CLIENT_USER, clientId: CLIENT_ID });
    joinInvitation.mockResolvedValue({
      value: JOINED,
      error: null,
      status: 200,
    });

    const { headers } = await settle(() => invitationLoader(pageArgs()));

    expect(headers.get("location")).toBe("/overview");
  });

  it("sends a join refused as archived to the No access page", async () => {
    answerAs(INVITEE);
    joinInvitation.mockResolvedValue({
      value: null,
      error: "archived",
      status: 403,
    });

    const { headers } = await settle(() => invitationLoader(pageArgs()));

    expect(headers.get("location")).toBe("/no-access?reason=archived");
  });

  const refusedStates: [string, Access, string, unknown, number][] = [
    [
      "an invitee with another email",
      INVITEE,
      "email-mismatch",
      {
        kind: "mismatch",
        invitationId: INVITATION_ID,
        email: INVITED_EMAIL,
        clientName: CLIENT_NAME,
      },
      403,
    ],
    [
      "another Client's user invited here",
      OTHER_CLIENT_USER,
      "ineligible",
      { kind: "ineligible", clientName: CLIENT_NAME },
      403,
    ],
    [
      "an invitee on a dead link",
      INVITEE,
      "not-found",
      { kind: "not-valid" },
      404,
    ],
  ];

  for (const [who, access, error, state, expectedStatus] of refusedStates) {
    it(`shows ${who} the ${error} state, as HTTP ${expectedStatus}`, async () => {
      answerAs(access);
      joinInvitation.mockResolvedValue({
        value: null,
        error: error as "not-found",
        status: 404,
      });

      const { data, status } = await settle(() => invitationLoader(pageArgs()));

      expect(data).toEqual(state);
      expect(status).toBe(expectedStatus);
    });
  }

  it("shows the not-valid state when a refused Invitation died meanwhile", async () => {
    answerAs(INVITEE);
    joinInvitation.mockResolvedValue({
      value: null,
      error: "email-mismatch",
      status: 403,
    });
    getLiveInvitation.mockResolvedValue(null);

    const { data } = await settle(() => invitationLoader(pageArgs()));

    expect(data).toEqual({ kind: "not-valid" });
  });

  it("shows the Admin the mismatch state without joining, and not-valid for a dead id", async () => {
    answerAs(ADMIN);
    const live = await settle(() => invitationLoader(pageArgs()));
    answerAs(ADMIN_NEEDS_PASSKEY);
    getLiveInvitation.mockResolvedValue(null);
    const dead = await settle(() => invitationLoader(pageArgs()));

    expect(live.data).toEqual({
      kind: "mismatch",
      invitationId: INVITATION_ID,
      email: INVITED_EMAIL,
      clientName: CLIENT_NAME,
    });
    expect(dead.data).toEqual({ kind: "not-valid" });
    expect([live.status, dead.status]).toEqual([403, 404]);
    expect(joinInvitation).not.toHaveBeenCalled();
  });

  it("is never cached and revalidates as every route does", () => {
    expect(invitationHeaders).toBe(getNoStoreHeaders);
    expect(invitationShouldRevalidate).toBeDefined();
    const args = {
      formAction: "/theme",
      actionResult: { ok: false },
      defaultShouldRevalidate: true,
    } as Parameters<typeof revalidateUnlessThemeFailed>[0];
    expect(invitationShouldRevalidate(args)).toBe(false);
  });
});

describe("the Invitation page's email link", () => {
  it("sends the link and moves on to the check-email screen", async () => {
    answerAs(ANONYMOUS);

    const { headers, status } = await settle(() =>
      invitationAction(pageArgs({ method: "POST" })),
    );

    expect(requestInvitationLink).toHaveBeenCalledWith(
      expect.any(Request),
      INVITATION_ID,
    );
    expect(status).toBe(303);
    expect(headers.get("location")).toBe("/sign-in/check-email");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("answers a refused send with its outcome and status", async () => {
    answerAs(ANONYMOUS);
    requestInvitationLink.mockResolvedValue({
      value: null,
      error: "rate-limited",
      status: 429,
    });

    const { data, status } = await settle(() =>
      invitationAction(pageArgs({ method: "POST" })),
    );

    expect(data).toEqual({ error: "rate-limited" });
    expect(status).toBe(429);
  });

  it("reloads the page when the Invitation died since it loaded", async () => {
    answerAs(ANONYMOUS);
    requestInvitationLink.mockResolvedValue({
      value: null,
      error: "not-found",
      status: 404,
    });

    const { headers, status } = await settle(() =>
      invitationAction(pageArgs({ method: "POST" })),
    );

    expect(status).toBe(303);
    expect(headers.get("location")).toBe(INVITATION_PATH);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("refuses a cross-origin POST before sending anything", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    answerAs(ANONYMOUS);

    const { status } = await settle(() =>
      invitationAction(
        pageArgs({ method: "POST", origin: "https://evil.example" }),
      ),
    );

    expect(status).toBe(403);
    expect(requestInvitationLink).not.toHaveBeenCalled();
    expect(getAccess).not.toHaveBeenCalled();
  });

  it("sends a signed-in browser back to the page instead of mailing", async () => {
    answerAs(INVITEE);

    const { headers } = await settle(() =>
      invitationAction(pageArgs({ method: "POST" })),
    );

    expect(headers.get("location")).toBe(INVITATION_PATH);
    expect(requestInvitationLink).not.toHaveBeenCalled();
  });
});

describe("the Invitation page's email link, with JS", () => {
  type ClientActionArgs = Parameters<typeof invitationClientAction>[0];

  function runWith(serverAction: () => Promise<unknown>) {
    return invitationClientAction({ serverAction } as ClientActionArgs);
  }

  it("turns a network failure into the failed banner instead of an error page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { data, status } = await settle(() =>
      runWith(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    expect(data).toEqual({ error: "failed" });
    expect(status).toBe(503);
  });

  it("keeps a refused send's outcome and status", async () => {
    const { data, status } = await settle(() =>
      runWith(async () => ({ error: "rate-limited" })),
    );

    expect(data).toEqual({ error: "rate-limited" });
    expect(status).toBe(429);
  });

  it("lets the server's redirect through", async () => {
    const sent = new Response(null, {
      status: 302,
      headers: { location: "/sign-in/check-email" },
    });

    await expect(runWith(() => Promise.reject(sent))).rejects.toBe(sent);
  });

  it("doesn't revalidate the page after a failed send, but does otherwise", () => {
    type Args = Parameters<typeof invitationShouldRevalidate>[0];
    const send = {
      formMethod: "POST",
      formAction: `${INVITATION_PATH}?utm_source=mail`,
      currentUrl: new URL(`${PORTAL_ORIGIN}${INVITATION_PATH}?utm_source=mail`),
      defaultShouldRevalidate: true,
    };

    const afterFailure = invitationShouldRevalidate({
      ...send,
      actionResult: { error: "failed" },
    } as unknown as Args);
    const afterSignOut = invitationShouldRevalidate({
      ...send,
      formAction: "/sign-out",
      actionResult: undefined,
    } as unknown as Args);

    expect(afterFailure).toBe(false);
    expect(afterSignOut).toBe(true);
  });
});

describe("the sign-in screen", () => {
  it("offers Google only when it is configured", async () => {
    answerAs(ANONYMOUS);
    const withGoogle = await settle(() => signInLoader(argsFor("/sign-in")));
    listSocialProviders.mockReturnValue([]);
    const without = await settle(() => signInLoader(argsFor("/sign-in")));

    expect(withGoogle.data).toMatchObject({ isGoogleEnabled: true });
    expect(without.data).toMatchObject({ isGoogleEnabled: false });
  });

  it("shows the Google banner after a failed Google callback", async () => {
    answerAs(ANONYMOUS);

    const { data } = await settle(() =>
      signInLoader(argsFor("/sign-in?google&error=state_mismatch")),
    );

    expect(data).toMatchObject({ banner: "google-failed" });
  });

  it("flags a visit right after leaving a Client, and only exactly then", async () => {
    answerAs(ANONYMOUS);

    const left = await settle(() => signInLoader(argsFor("/sign-in?left=1")));
    const other = await settle(() => signInLoader(argsFor("/sign-in?left=2")));
    const plain = await settle(() => signInLoader(argsFor("/sign-in")));

    expect(left.data).toMatchObject({ hasLeft: true });
    expect(other.data).toMatchObject({ hasLeft: false });
    expect(plain.data).toMatchObject({ hasLeft: false });
  });
});

describe("signing out", () => {
  function signOutArgs<Args>(returnTo: string | null): Args {
    const body = new FormData();
    if (returnTo !== null) body.set("returnTo", returnTo);
    return argsFor<Args>("/sign-out", { method: "POST", body });
  }

  it("returns to the Invitation page it was asked to", async () => {
    const { headers } = await settle(() =>
      signOutAction(signOutArgs(INVITATION_PATH)),
    );

    expect(headers.get("location")).toBe(INVITATION_PATH);
    expect(headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
  });

  it("goes to /sign-in without a return, or with anything but an Invitation page", async () => {
    const returns = [
      null,
      "//evil.example",
      "https://evil.example/x",
      "/\\evil.example",
      "/admin",
      "/api/auth/sign-out",
      "/invitations/not-a-uuid",
      `${INVITATION_PATH}?next=/admin`,
      `${INVITATION_PATH}/extra`,
    ];
    const locations: (string | null)[] = [];
    for (const returnTo of returns) {
      const { headers } = await settle(() =>
        signOutAction(signOutArgs(returnTo)),
      );
      locations.push(headers.get("location"));
    }

    expect(locations).toEqual(returns.map(() => "/sign-in"));
  });
});
