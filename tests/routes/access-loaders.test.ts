import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, ClientSummary } from "@/lib/auth/auth";
import {
  action as adminIndexAction,
  loader as adminIndexLoader,
} from "@/routes/admin/index";
import {
  action as adminAction,
  loader as adminLoader,
} from "@/routes/admin/layout";
import { loader as checkEmailLoader } from "@/routes/auth/check-email";
import { loader as passkeyLoader } from "@/routes/auth/passkey";
import { loader as signInLoader } from "@/routes/auth/sign-in";
import { loader as indexLoader } from "@/routes/index";

// The session store is the boundary: a fake getAccess answers as a slid
// session would, with a renewed cookie on the way out.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const listClients = vi.fn<() => Promise<ClientSummary[]>>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    listClients: () => listClients(),
  },
}));

const ADMIN_NEEDS_PASSKEY: Access = {
  kind: "admin-needs-passkey",
  email: "admin@test.local",
};
const ANONYMOUS: Access = { kind: "anonymous" };
const ADMIN: Access = { kind: "admin", email: "admin@test.local" };

// Typed by the call site, so it fits each route's own loader or action args.
function argsFor<Args>(path: string, method = "GET"): Args {
  const request = new Request(`http://localhost:5173${path}`, { method });
  // Loaders read only the request; the rest of the args are unused here.
  return { request, params: {}, context: {} } as Args;
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
});

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
    "index action": () => adminIndexAction(argsFor("/admin?index", "POST")),
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

    expect(result.data).toEqual({ email: "admin@test.local", clients: null });
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
