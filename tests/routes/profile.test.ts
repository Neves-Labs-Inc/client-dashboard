import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Access,
  AccessResult,
  Auth,
  ClientAccess,
  Profile,
} from "@/lib/auth/auth";
import type { ProfileOutcome } from "@/lib/profile";
import {
  action,
  clientAction,
  headers as profileHeaders,
  loader,
  shouldRevalidate,
} from "@/routes/client/profile";

const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getProfile = vi.fn<Auth["getProfile"]>();
const updateDisplayName = vi.fn<Auth["updateDisplayName"]>();
const leaveClient = vi.fn<Auth["leaveClient"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getProfile: (...args: Parameters<Auth["getProfile"]>) =>
      getProfile(...args),
    updateDisplayName: (...args: Parameters<Auth["updateDisplayName"]>) =>
      updateDisplayName(...args),
    leaveClient: (...args: Parameters<Auth["leaveClient"]>) =>
      leaveClient(...args),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const OWNER: ClientAccess = {
  kind: "client",
  userId: "u1",
  email: "maya@acme.test",
  name: "Maya Chen",
  clientId: CLIENT_ID,
  clientName: "Acme",
  role: "owner",
};
const PROFILE: Profile = {
  name: "Maya Chen",
  email: "maya@acme.test",
  role: "owner",
  clientName: "Acme",
  isGoogleLinked: false,
  canLeave: "last-owner",
};
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const ANONYMOUS: Access = { kind: "anonymous" };

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

function post(
  fields: Record<string, string>,
  origin: string = PORTAL_ORIGIN,
): Parameters<typeof action>[0] {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  const request = new Request(`${PORTAL_ORIGIN}/profile`, {
    method: "POST",
    body,
    headers: { origin },
  });
  return { request, params: {}, context: {} } as Parameters<typeof action>[0];
}

function get(): Parameters<typeof loader>[0] {
  const request = new Request(`${PORTAL_ORIGIN}/profile`);
  return { request, params: {}, context: {} } as Parameters<typeof loader>[0];
}

beforeEach(() => {
  getAccess.mockReset();
  getProfile.mockReset();
  getProfile.mockResolvedValue(PROFILE);
  updateDisplayName.mockReset();
  updateDisplayName.mockResolvedValue({
    value: null,
    error: null,
    status: 200,
  });
  leaveClient.mockReset();
  leaveClient.mockResolvedValue({ value: null, error: null, status: 200 });
});

describe("the Profile loader", () => {
  it("gives a Client User their own profile, with the session's cookie", async () => {
    answerAs(OWNER);

    const result = (await loader(get())) as {
      data: unknown;
      init: { headers: Headers };
    };

    expect(getProfile).toHaveBeenCalledWith(OWNER);
    expect(result.data).toEqual({ profile: PROFILE });
    expect(result.init.headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it.each([
    ["the Admin", ADMIN, "/admin"],
    ["a visitor", ANONYMOUS, "/sign-in"],
  ])("sends %s to %s without reading a profile", async (_, access, home) => {
    answerAs(access);

    const thrown = await loader(get()).catch((error: unknown) => error);

    expect((thrown as Response).headers.get("location")).toBe(home);
    expect(getProfile).not.toHaveBeenCalled();
  });
});

describe("the Profile actions", () => {
  const posts = [
    { intent: "rename", name: "Maya" },
    { intent: "leave" },
  ] as const;

  it("refuses a cross-origin POST with 403 before the body is read", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const fields of posts) {
      const args = post(fields, "http://www.localhost:5173");
      const thrown = await action(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status: 403 } });
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(updateDisplayName).not.toHaveBeenCalled();
    expect(leaveClient).not.toHaveBeenCalled();
  });

  it("sends the Admin and visitors away before the body is read", async () => {
    for (const [access, home] of [
      [ADMIN, "/admin"],
      [ANONYMOUS, "/sign-in"],
    ] as const) {
      answerAs(access);
      const args = post({ intent: "leave" });

      const thrown = await action(args).catch((error: unknown) => error);

      expect((thrown as Response).headers.get("location")).toBe(home);
      expect(args.request.bodyUsed).toBe(false);
    }
    expect(leaveClient).not.toHaveBeenCalled();
  });

  it("renames the caller with the posted name and answers 200", async () => {
    answerAs(OWNER);

    const result = await action(post({ intent: "rename", name: " Maya C " }));

    expect(updateDisplayName).toHaveBeenCalledWith(OWNER, " Maya C ");
    expect(result).toMatchObject({
      data: { kind: "renamed" },
      init: { status: 200 },
    });
  });

  it("passes a refused name on as its code with 422", async () => {
    answerAs(OWNER);
    updateDisplayName.mockResolvedValue({
      value: null,
      error: "invalid-name",
      status: 422,
    });

    const result = await action(post({ intent: "rename", name: "" }));

    expect(result).toMatchObject({
      data: { kind: "refused", error: "invalid-name" },
      init: { status: 422 },
    });
  });

  it("leaves as the caller, then redirects to the sign-in banner with the cookie", async () => {
    answerAs(OWNER);

    const result = (await action(post({ intent: "leave" }))) as Response;

    expect(leaveClient).toHaveBeenCalledWith(OWNER);
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/sign-in?left=1");
    expect(result.headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });

  it("refuses a forged leave by the last Owner as last-owner with 409", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    leaveClient.mockResolvedValue({
      value: null,
      error: "last-owner",
      status: 409,
    });

    const result = await action(post({ intent: "leave" }));

    expect(result).toMatchObject({
      data: { kind: "refused", error: "last-owner" },
      init: { status: 409 },
    });
  });

  it("answers an unknown intent with 400, running nothing", async () => {
    answerAs(OWNER);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await action(post({ intent: "delete" }));

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
    expect(updateDisplayName).not.toHaveBeenCalled();
    expect(leaveClient).not.toHaveBeenCalled();
  });

  it("answers a crash without its details, and logs no name", async () => {
    answerAs(OWNER);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    updateDisplayName.mockRejectedValue(new Error("params: Secret Name"));

    const result = await action(
      post({ intent: "rename", name: "Secret Name" }),
    );

    expect(result).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Secret");
  });
});

describe("the Profile clientAction", () => {
  type ClientActionArgs = Parameters<typeof clientAction>[0];

  function runWith(serverAction: () => Promise<ProfileOutcome>) {
    return clientAction({ serverAction } as ClientActionArgs);
  }

  it("passes a success through as plain data", async () => {
    expect(await runWith(async () => ({ kind: "renamed" }))).toEqual({
      kind: "renamed",
    });
  });

  it("gives a refusal a 4xx status and a failure a 5xx", async () => {
    const invalid = await runWith(async () => ({
      kind: "refused",
      error: "invalid-name",
    }));
    const stale = await runWith(async () => ({
      kind: "refused",
      error: "last-owner",
    }));
    const failed = await runWith(async () => ({ kind: "failed" }));

    expect(invalid).toMatchObject({ init: { status: 422 } });
    expect(stale).toMatchObject({ init: { status: 409 } });
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

  it("lets a redirect through, as after leaving", async () => {
    const redirect = new Response(null, {
      status: 303,
      headers: { location: "/sign-in?left=1" },
    });

    await expect(
      runWith(async () => {
        throw redirect;
      }),
    ).rejects.toBe(redirect);
  });
});

describe("the Profile route", () => {
  type RevalidateArgs = Parameters<typeof shouldRevalidate>[0];
  type HeadersArgs = Parameters<typeof profileHeaders>[0];

  it("keeps its loader still after a failed theme change", () => {
    const args = {
      currentUrl: new URL("/profile", PORTAL_ORIGIN),
      nextUrl: new URL("/profile", PORTAL_ORIGIN),
      formAction: "/theme",
      actionResult: { ok: false },
      defaultShouldRevalidate: true,
    } as RevalidateArgs;

    expect(shouldRevalidate(args)).toBe(false);
  });

  it("is no-store and keeps the session's cookie", () => {
    const loaderHeaders = new Headers();
    loaderHeaders.append("set-cookie", RENEWED_COOKIE);

    const headers = new Headers(
      profileHeaders({
        loaderHeaders,
        parentHeaders: new Headers(),
      } as HeadersArgs),
    );

    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});
