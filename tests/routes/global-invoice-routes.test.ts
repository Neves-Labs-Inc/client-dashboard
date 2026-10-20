import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult } from "@/lib/auth/auth";
import type { AdminInvoiceDetail, Invoices } from "@/lib/invoices/invoices";
import {
  action as detailAction,
  loader as detailLoader,
} from "@/routes/admin/invoice";

// The session store and the Invoices module are the boundaries: the
// module's own tests cover the reads and transitions against the database.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getAdminInvoiceById = vi.fn<Invoices["getAdminInvoiceById"]>();
const markPaid = vi.fn<Invoices["markPaid"]>();
const revertPaid = vi.fn<Invoices["revertPaid"]>();
const voidInvoice = vi.fn<Invoices["voidInvoice"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: { getAccess: (request: Request) => getAccess(request) },
}));

vi.mock("@/lib/invoices/invoices.server", () => ({
  invoices: {
    getToday: () => "2026-10-19",
    getAdminInvoiceById: (
      ...args: Parameters<Invoices["getAdminInvoiceById"]>
    ) => getAdminInvoiceById(...args),
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
const OTHER_CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789ffff";
const INVOICE_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";

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
const DETAIL: AdminInvoiceDetail = {
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
  client: { id: CLIENT_ID, name: "Acme", isArchived: false },
};

type ActionArgs = Parameters<typeof detailAction>[0];
type LoaderArgs = Parameters<typeof detailLoader>[0];

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

function post(
  fields: Record<string, string>,
  origin = PORTAL_ORIGIN,
  invoiceId = INVOICE_ID,
): ActionArgs {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  const request = new Request(`${PORTAL_ORIGIN}/admin/invoices/${invoiceId}`, {
    method: "POST",
    body,
    headers: { origin },
  });
  return { request, params: { invoiceId }, context: {} } as ActionArgs;
}

function get(invoiceId = INVOICE_ID): LoaderArgs {
  return {
    request: new Request(`${PORTAL_ORIGIN}/admin/invoices/${invoiceId}`),
    params: { invoiceId },
    context: {},
  } as LoaderArgs;
}

const MARK_PAID = { intent: "paid", paidDate: "2026-10-15" };
const REVERT = { intent: "revert" };
const VOID = { intent: "void" };

// What the route returned or threw, unwrapped.
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
  getAdminInvoiceById.mockReset();
  getAdminInvoiceById.mockResolvedValue(DETAIL);
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

describe("the global Invoice detail loader", () => {
  for (const [access, home] of [
    [CLIENT_USER, "/overview"],
    [ANONYMOUS, "/sign-in"],
  ] as const) {
    it(`sends a ${access.kind} visitor to ${home} without reading the Invoice`, async () => {
      answerAs(access);

      const outcome = await catchOutcome(() => detailLoader(get()));

      expect(outcome).toBeInstanceOf(Response);
      expect((outcome as Response).headers.get("location")).toBe(home);
      expect(getAdminInvoiceById).not.toHaveBeenCalled();
    });
  }

  it("loads any Client's Invoice with today", async () => {
    answerAs(ADMIN);

    const outcome = await detailLoader(get());

    expect(getAdminInvoiceById).toHaveBeenCalledWith(INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { invoice: DETAIL, today: "2026-10-19" },
    });
  });

  it("loads an archived Client's Void Invoice", async () => {
    answerAs(ADMIN);
    const archivedVoid: AdminInvoiceDetail = {
      ...DETAIL,
      status: "VOID",
      client: { ...DETAIL.client, isArchived: true },
    };
    getAdminInvoiceById.mockResolvedValue(archivedVoid);

    const outcome = await detailLoader(get());

    expect(outcome).toMatchObject({ data: { invoice: archivedVoid } });
  });

  for (const [label, invoiceId] of [
    ["an unknown", INVOICE_ID],
    ["a non-UUID", "not-a-uuid"],
  ] as const) {
    it(`is a 404 for ${label} id`, async () => {
      answerAs(ADMIN);
      // The module answers null for both.
      getAdminInvoiceById.mockResolvedValue(null);

      const thrown = await catchOutcome(() => detailLoader(get(invoiceId)));

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });
  }

  it("resolves a failed load to null, the page's error state", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAdminInvoiceById.mockRejectedValue(new Error("connection refused"));

    const outcome = await detailLoader(get());

    expect(outcome).toMatchObject({ data: { invoice: null } });
  });
});

describe("the global Invoice status action's guard", () => {
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
    expect(getAdminInvoiceById).not.toHaveBeenCalled();
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

describe("the global Invoice status action", () => {
  it("marks the Invoice paid under its own Client", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(MARK_PAID));

    expect(markPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID, "2026-10-15");
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "paid" },
      init: { status: 200 },
    });
  });

  it("reverts the Invoice to Open under its own Client", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(REVERT));

    expect(revertPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "revert" },
      init: { status: 200 },
    });
  });

  it("voids the Invoice under its own Client", async () => {
    answerAs(ADMIN);

    const outcome = await detailAction(post(VOID));

    expect(voidInvoice).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { kind: "changed", intent: "void" },
      init: { status: 200 },
    });
  });

  it("ignores a forged clientId field", async () => {
    answerAs(ADMIN);

    for (const fields of [MARK_PAID, REVERT, VOID]) {
      await detailAction(post({ ...fields, clientId: OTHER_CLIENT_ID }));
    }

    expect(markPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID, "2026-10-15");
    expect(revertPaid).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(voidInvoice).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
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

  for (const [label, invoiceId] of [
    ["an unknown", INVOICE_ID],
    ["a non-UUID", "not-a-uuid"],
  ] as const) {
    it(`is a 404 for ${label} Invoice and changes nothing`, async () => {
      answerAs(ADMIN);
      getAdminInvoiceById.mockResolvedValue(null);

      for (const fields of [MARK_PAID, REVERT, VOID]) {
        const thrown = await catchOutcome(() =>
          detailAction(post(fields, PORTAL_ORIGIN, invoiceId)),
        );

        expect(thrown).toMatchObject({ init: { status: 404 } });
      }
      expect(markPaid).not.toHaveBeenCalled();
      expect(revertPaid).not.toHaveBeenCalled();
      expect(voidInvoice).not.toHaveBeenCalled();
    });
  }

  it("is a 404 when the change finds the Invoice gone", async () => {
    answerAs(ADMIN);
    voidInvoice.mockResolvedValue({
      value: null,
      error: "not-found",
      status: 404,
    });

    const thrown = await catchOutcome(() => detailAction(post(VOID)));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("answers a failed lookup with a failure, not the error page", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAdminInvoiceById.mockRejectedValue(new Error("connection refused"));

    const outcome = await detailAction(post(VOID));

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(voidInvoice).not.toHaveBeenCalled();
  });

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
