import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import type { InvoiceDetail, Invoices } from "@/lib/invoices/invoices";
import {
  action as detailAction,
  clientAction as detailClientAction,
  loader as detailLoader,
} from "@/routes/admin/client-invoice";

// The session store and the Invoices module are the boundaries: the
// module's own tests cover the transitions against the database.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const getAdminInvoice = vi.fn<Invoices["getAdminInvoice"]>();
const markPaid = vi.fn<Invoices["markPaid"]>();
const revertPaid = vi.fn<Invoices["revertPaid"]>();
const voidInvoice = vi.fn<Invoices["voidInvoice"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
  },
}));

vi.mock("@/lib/invoices/invoices.server", () => ({
  invoices: {
    getToday: () => "2026-10-19",
    getAdminInvoice: (...args: Parameters<Invoices["getAdminInvoice"]>) =>
      getAdminInvoice(...args),
    markPaid: (...args: Parameters<Invoices["markPaid"]>) => markPaid(...args),
    revertPaid: (...args: Parameters<Invoices["revertPaid"]>) =>
      revertPaid(...args),
    voidInvoice: (...args: Parameters<Invoices["voidInvoice"]>) =>
      voidInvoice(...args),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const FOREIGN_ORIGIN = "http://www.localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const INVOICE_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const DETAIL_PATH = `/admin/clients/${CLIENT_ID}/invoices/${INVOICE_ID}`;
const PARAMS = { clientId: CLIENT_ID, invoiceId: INVOICE_ID };

const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const ANONYMOUS: Access = { kind: "anonymous" };
const CLIENT_USER: Access = {
  kind: "client",
  userId: "user-1",
  email: "owner@acme.test",
  name: "Olivia",
  clientId: CLIENT_ID,
  clientName: "Acme",
  role: "owner",
};
const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [],
  pendingInvitations: [],
  canInviteFirstOwner: false,
};
const DETAIL: InvoiceDetail = {
  id: INVOICE_ID,
  number: "NL-0007-2026",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  totalCents: 125_000,
  status: "OPEN",
  memo: null,
  paidDate: null,
  statusChangedAt: new Date("2026-10-01T14:00:00Z"),
  project: null,
  lineItems: [{ id: "line-1", description: "Workshop", amountCents: 125_000 }],
};

type ActionArgs = Parameters<typeof detailAction>[0];
type LoaderArgs = Parameters<typeof detailLoader>[0];

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

function post(
  fields: Record<string, string>,
  origin = PORTAL_ORIGIN,
): ActionArgs {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  const request = new Request(`${PORTAL_ORIGIN}${DETAIL_PATH}`, {
    method: "POST",
    body,
    headers: { origin },
  });
  return { request, params: PARAMS, context: {} } as ActionArgs;
}

const MARK_PAID = { intent: "paid", paidDate: "2026-10-15" };
const REVERT = { intent: "revert" };
const VOID = { intent: "void" };

// What the action returned or threw, unwrapped.
async function catchOutcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    return thrown;
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  getAccess.mockReset();
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  getAdminInvoice.mockReset();
  getAdminInvoice.mockResolvedValue(DETAIL);
  markPaid.mockReset();
  markPaid.mockResolvedValue({
    value: null,
    error: null,
    status: 200,
    fieldErrors: {},
  });
  revertPaid.mockReset();
  revertPaid.mockResolvedValue({ value: null, error: null, status: 200 });
  voidInvoice.mockReset();
  voidInvoice.mockResolvedValue({ value: null, error: null, status: 200 });
});

describe("the Invoice status action's guard", () => {
  for (const [access, home] of [
    [CLIENT_USER, "/overview"],
    [ANONYMOUS, "/sign-in"],
  ] as const) {
    it(`sends a ${access.kind} visitor to ${home} and changes nothing`, async () => {
      answerAs(access);

      for (const fields of [MARK_PAID, REVERT, VOID]) {
        const outcome = await catchOutcome(() => detailAction(post(fields)));

        expect(outcome).toBeInstanceOf(Response);
        expect((outcome as Response).headers.get("location")).toBe(home);
      }
      expect(markPaid).not.toHaveBeenCalled();
      expect(revertPaid).not.toHaveBeenCalled();
      expect(voidInvoice).not.toHaveBeenCalled();
    });
  }

  it("refuses a cross-origin post with 403 before the body is read", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const forged = post(VOID, FOREIGN_ORIGIN);

    const thrown = await catchOutcome(() => detailAction(forged));

    expect(thrown).toMatchObject({ init: { status: 403 } });
    expect(forged.request.bodyUsed).toBe(false);
    expect(voidInvoice).not.toHaveBeenCalled();
  });

  it("refuses an unknown intent with 400 and changes nothing", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcome = await detailAction(post({ intent: "delete" }));

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 400 },
    });
    expect(markPaid).not.toHaveBeenCalled();
    expect(revertPaid).not.toHaveBeenCalled();
    expect(voidInvoice).not.toHaveBeenCalled();
  });
});

describe("the Invoice status action", () => {
  it("marks the URL's Invoice paid on the posted date", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(MARK_PAID));

    expect(markPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID, "2026-10-15");
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "paid" },
      init: { status: 200 },
    });
  });

  it("reads a forged post's missing paid date as empty", async () => {
    answerAs(ADMIN);

    await detailAction(post({ intent: "paid" }));

    expect(markPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID, "");
  });

  it("maps an invalid paid date to its field copy with 422", async () => {
    answerAs(ADMIN);
    const fieldErrors = { paidDate: "The paid date can't be in the future." };
    markPaid.mockResolvedValue({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors,
    });

    const outcome = await detailAction(post(MARK_PAID));

    expect(outcome).toMatchObject({
      data: { kind: "invalid", fieldErrors },
      init: { status: 422 },
    });
  });

  it("reverts the URL's Invoice to Open", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(REVERT));

    expect(revertPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "revert" },
      init: { status: 200 },
    });
  });

  it("voids the URL's Invoice", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(VOID));

    expect(voidInvoice).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "void" },
      init: { status: 200 },
    });
  });

  const refusals = [
    ["paid", MARK_PAID, "not-open"],
    ["paid", MARK_PAID, "archived"],
    ["revert", REVERT, "not-paid"],
    ["revert", REVERT, "archived"],
    ["void", VOID, "not-open"],
    ["void", VOID, "archived"],
  ] as const;

  for (const [intent, fields, error] of refusals) {
    it(`maps a stale ${intent} refused as ${error} with 409`, async () => {
      answerAs(ADMIN);
      const refused = { value: null, error, status: 409 };
      markPaid.mockResolvedValue({ ...refused, fieldErrors: {} } as never);
      revertPaid.mockResolvedValue(refused as never);
      voidInvoice.mockResolvedValue(refused as never);

      const outcome = await detailAction(post(fields));

      expect(outcome).toMatchObject({
        data: { kind: "refused", intent, error },
        init: { status: 409 },
      });
    });
  }

  for (const fields of [MARK_PAID, REVERT, VOID]) {
    it(`is a 404 when the ${fields.intent} finds no such Invoice`, async () => {
      answerAs(ADMIN);
      const missing = { value: null, error: "not-found", status: 404 };
      markPaid.mockResolvedValue({ ...missing, fieldErrors: {} } as never);
      revertPaid.mockResolvedValue(missing as never);
      voidInvoice.mockResolvedValue(missing as never);

      const thrown = await catchOutcome(() => detailAction(post(fields)));

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });
  }

  it("answers a crash with a failure, not the error page", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    voidInvoice.mockRejectedValue(new Error("connection refused"));

    const outcome = await detailAction(post(VOID));

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
  });
});

describe("the Invoice status clientAction", () => {
  type ClientArgs = Parameters<typeof detailClientAction>[0];
  const run = (serverAction: () => Promise<unknown>) =>
    detailClientAction({ serverAction } as ClientArgs);

  it("passes a change through as plain data", async () => {
    const changed = { kind: "changed", intent: "void" };

    expect(await run(async () => changed)).toEqual(changed);
  });

  it("keeps a refusal's 409, so nothing revalidates on it", async () => {
    const refused = { kind: "refused", intent: "void", error: "not-open" };

    expect(await run(async () => refused)).toMatchObject({
      data: refused,
      init: { status: 409 },
    });
  });

  it("turns a network failure into the failed outcome", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await run(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 503 },
    });
  });

  it("lets the route's 404 through", async () => {
    const notFound = new Response(null, { status: 404 });

    await expect(
      run(async () => {
        throw notFound;
      }),
    ).rejects.toBe(notFound);
  });
});

describe("the Invoice detail loader", () => {
  it("carries today, the paid date's default and upper bound", async () => {
    answerAs(ADMIN);
    const args = {
      request: new Request(`${PORTAL_ORIGIN}${DETAIL_PATH}`),
      params: PARAMS,
      context: {},
    } as LoaderArgs;

    const outcome = await detailLoader(args);

    expect(outcome).toMatchObject({
      data: { invoice: DETAIL, today: "2026-10-19" },
    });
  });
});
