import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import type {
  InvoiceDetail,
  InvoiceRow,
  Invoices,
} from "@/lib/invoices/invoices";
import type { Requests } from "@/lib/requests/requests";
import {
  loader as detailLoader,
  shouldRevalidate as detailShouldRevalidate,
} from "@/routes/admin/client-invoice";
import {
  action as tabAction,
  clientAction as tabClientAction,
  headers as tabHeaders,
  loader as tabLoader,
  shouldRevalidate as tabShouldRevalidate,
} from "@/routes/admin/client-invoices";

// The session store and the Invoices module are the boundaries: the
// module's own tests cover its rules against the database.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();
const listClientInvoices = vi.fn<Invoices["listClientInvoices"]>();
const getAdminInvoice = vi.fn<Invoices["getAdminInvoice"]>();
const createInvoice = vi.fn<Invoices["createInvoice"]>();
const listProjectOptions = vi.fn<Requests["listProjectOptions"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
  },
}));

vi.mock("@/lib/invoices/invoices.server", () => ({
  invoices: {
    getToday: () => "2026-10-19",
    listClientInvoices: (clientId: string) => listClientInvoices(clientId),
    getAdminInvoice: (clientId: string, invoiceId: string) =>
      getAdminInvoice(clientId, invoiceId),
    createInvoice: (...args: Parameters<Invoices["createInvoice"]>) =>
      createInvoice(...args),
  },
}));

vi.mock("@/lib/requests/requests.server", () => ({
  requests: {
    listProjectOptions: (clientId: string) => listProjectOptions(clientId),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const FOREIGN_ORIGIN = "http://www.localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const INVOICE_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const PROJECT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abd0";
const TAB_PATH = `/admin/clients/${CLIENT_ID}/invoices`;
const DETAIL_PATH = `${TAB_PATH}/${INVOICE_ID}`;
const TAB_PARAMS = { clientId: CLIENT_ID };
const DETAIL_PARAMS = { clientId: CLIENT_ID, invoiceId: INVOICE_ID };

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
const ROW: InvoiceRow = {
  id: INVOICE_ID,
  number: "NL-0007-2026",
  issueDate: "2026-10-19",
  dueDate: "2026-11-18",
  totalCents: 125_000,
  status: "OPEN",
};
const DETAIL: InvoiceDetail = {
  ...ROW,
  memo: "Thanks!",
  paidDate: null,
  statusChangedAt: new Date("2026-10-19T14:00:00Z"),
  project: null,
  lineItems: [{ id: "line-1", description: "Workshop", amountCents: 125_000 }],
};
const PROJECT_OPTIONS = [{ id: PROJECT_ID, name: "Website", isPast: false }];
const DRAFT_FIELDS: [string, string][] = [
  ["issueDate", "2026-10-19"],
  ["dueDate", "2026-11-18"],
  ["projectId", PROJECT_ID],
  ["memo", "Thanks!"],
  ["description", "Discovery workshop"],
  ["amount", "1,000.00"],
  ["description", "Travel"],
  ["amount", "250"],
];

type TabLoaderArgs = Parameters<typeof tabLoader>[0];
type TabActionArgs = Parameters<typeof tabAction>[0];
type DetailLoaderArgs = Parameters<typeof detailLoader>[0];

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

function getArgs<Args>(path: string, params: Record<string, string>): Args {
  // Loaders read only the request and params.
  return {
    request: new Request(`${PORTAL_ORIGIN}${path}`),
    params,
    context: {},
  } as Args;
}

function postTab(
  fields: [string, string][] = DRAFT_FIELDS,
  origin = PORTAL_ORIGIN,
): TabActionArgs {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  const request = new Request(`${PORTAL_ORIGIN}${TAB_PATH}`, {
    method: "POST",
    body,
    headers: { origin },
  });
  return { request, params: TAB_PARAMS, context: {} } as TabActionArgs;
}

const tabArgs = (): TabLoaderArgs => getArgs(TAB_PATH, TAB_PARAMS);
const detailArgs = (
  params: Record<string, string> = DETAIL_PARAMS,
): DetailLoaderArgs => getArgs(`${TAB_PATH}/${params.invoiceId}`, params);

// What a loader or action returned or threw, unwrapped.
async function catchOutcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    return thrown;
  }
}

function toUrl(path: string): URL {
  return new URL(`${PORTAL_ORIGIN}${path}`);
}

beforeEach(() => {
  vi.restoreAllMocks();
  getAccess.mockReset();
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  listClientInvoices.mockReset();
  listClientInvoices.mockResolvedValue([ROW]);
  getAdminInvoice.mockReset();
  getAdminInvoice.mockResolvedValue(DETAIL);
  createInvoice.mockReset();
  createInvoice.mockResolvedValue({
    value: { id: INVOICE_ID, number: "NL-0007-2026" },
    error: null,
    status: 201,
    fieldErrors: {},
  });
  listProjectOptions.mockReset();
  listProjectOptions.mockResolvedValue(PROJECT_OPTIONS);
});

describe("the Invoices routes' Admin guard", () => {
  const guarded = {
    "tab loader": () => tabLoader(tabArgs()),
    "detail loader": () => detailLoader(detailArgs()),
    "New invoice action": () => tabAction(postTab()),
  };

  for (const [access, home] of [
    [CLIENT_USER, "/overview"],
    [ANONYMOUS, "/sign-in"],
  ] as const) {
    for (const [use, run] of Object.entries(guarded)) {
      it(`sends a ${access.kind} visitor from the ${use} to ${home}`, async () => {
        answerAs(access);

        const outcome = await catchOutcome(run);

        expect(outcome).toBeInstanceOf(Response);
        expect((outcome as Response).headers.get("location")).toBe(home);
      });
    }
  }

  it("reads and creates nothing for a non-Admin", async () => {
    answerAs(CLIENT_USER);

    for (const run of Object.values(guarded)) await catchOutcome(run);

    expect(listClientInvoices).not.toHaveBeenCalled();
    expect(getAdminInvoice).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin New invoice with 403 before the body is read", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = postTab(DRAFT_FIELDS, FOREIGN_ORIGIN);

    const thrown = await catchOutcome(() => tabAction(post));

    expect(thrown).toMatchObject({ init: { status: 403 } });
    expect(post.request.bodyUsed).toBe(false);
    expect(createInvoice).not.toHaveBeenCalled();
  });
});

describe("the Invoices tab loader", () => {
  it("lists the URL's Client's Invoices with today and the Project options", async () => {
    answerAs(ADMIN);

    const outcome = await tabLoader(tabArgs());

    expect(listClientInvoices).toHaveBeenCalledWith(CLIENT_ID);
    expect(listProjectOptions).toHaveBeenCalledWith(CLIENT_ID);
    expect(outcome).toMatchObject({
      data: {
        client: { clientId: CLIENT_ID, name: "Acme", archivedAt: null },
        invoices: [ROW],
        projectOptions: PROJECT_OPTIONS,
        today: "2026-10-19",
      },
    });
  });

  it("is a 404 for an unknown Client", async () => {
    answerAs(ADMIN);
    getTeam.mockResolvedValue(null);

    const thrown = await catchOutcome(() => tabLoader(tabArgs()));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("gives the page null, not an error, when the list or options can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listClientInvoices.mockRejectedValue(new Error("connection refused"));
    listProjectOptions.mockRejectedValue(new Error("connection refused"));

    const outcome = await tabLoader(tabArgs());

    expect(outcome).toMatchObject({
      data: { invoices: null, projectOptions: null },
    });
  });

  it("is no-store", () => {
    const sent = tabHeaders({
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
    } as Parameters<typeof tabHeaders>[0]);

    expect(new Headers(sent).get("cache-control")).toContain("no-store");
  });

  it("doesn't reload when the drawer only opens or closes", () => {
    const toggle = {
      currentUrl: toUrl(TAB_PATH),
      nextUrl: toUrl(`${TAB_PATH}?new=invoice`),
      defaultShouldRevalidate: true,
    } as Parameters<typeof tabShouldRevalidate>[0];

    expect(tabShouldRevalidate(toggle)).toBe(false);
    expect(
      tabShouldRevalidate({ ...toggle, nextUrl: toUrl(`${TAB_PATH}?x=1`) }),
    ).toBe(true);
  });
});

describe("the New invoice action", () => {
  it("creates the Invoice from the posted draft, Line Items in order", async () => {
    answerAs(ADMIN);

    const outcome = await tabAction(postTab());

    expect(createInvoice).toHaveBeenCalledWith(CLIENT_ID, {
      issueDate: "2026-10-19",
      dueDate: "2026-11-18",
      projectId: PROJECT_ID,
      memo: "Thanks!",
      lineItems: [
        { description: "Discovery workshop", amount: "1,000.00" },
        { description: "Travel", amount: "250" },
      ],
    });
    expect(outcome).toMatchObject({
      data: {
        kind: "created",
        invoiceId: INVOICE_ID,
        number: "NL-0007-2026",
      },
      init: { status: 201 },
    });
  });

  it("reads a forged post's missing fields as empty and stops one past the cap", async () => {
    answerAs(ADMIN);
    const lines = Array.from({ length: 80 }, (): [string, string] => [
      "description",
      "Line",
    ]);

    await tabAction(postTab([["amount", "5"], ...lines]));

    const [, draft] = createInvoice.mock.calls[0];
    expect(draft).toMatchObject({ issueDate: "", dueDate: "", memo: "" });
    expect(draft.lineItems).toHaveLength(51);
    expect(draft.lineItems[1]).toEqual({ description: "Line", amount: "" });
  });

  it("maps invalid to its field copy with 422", async () => {
    answerAs(ADMIN);
    const fieldErrors = { "lineItems.1.amount": "Enter an amount." };
    createInvoice.mockResolvedValue({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors,
    });

    const outcome = await tabAction(postTab());

    expect(outcome).toMatchObject({
      data: { kind: "invalid", fieldErrors },
      init: { status: 422 },
    });
  });

  for (const [error, status] of [
    ["archived", 409],
    ["not-found", 404],
  ] as const) {
    it(`maps the module's ${error} refusal`, async () => {
      answerAs(ADMIN);
      createInvoice.mockResolvedValue({
        value: null,
        error,
        status,
        fieldErrors: {},
      });

      const outcome = await tabAction(postTab());

      expect(outcome).toMatchObject({
        data: { kind: "refused", error },
        init: { status },
      });
    });
  }

  it("answers a crash with a failure, not the error page", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    createInvoice.mockRejectedValue(new Error("connection refused"));

    const outcome = await tabAction(postTab());

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
  });
});

describe("the New invoice clientAction", () => {
  type ClientArgs = Parameters<typeof tabClientAction>[0];
  const run = (serverAction: () => Promise<unknown>) =>
    tabClientAction({ serverAction } as ClientArgs);

  it("passes a success through as plain data", async () => {
    const created = { kind: "created", invoiceId: INVOICE_ID, number: "N" };

    expect(await run(async () => created)).toEqual(created);
  });

  it("keeps a refusal's 4xx status, so nothing revalidates on it", async () => {
    const outcome = await run(async () => ({
      kind: "refused",
      error: "archived",
    }));

    expect(outcome).toMatchObject({ init: { status: 409 } });
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

  it("lets a redirect through", async () => {
    const redirect = new Response(null, { status: 302 });

    const thrown = await catchOutcome(() =>
      run(async () => {
        throw redirect;
      }),
    );

    expect(thrown).toBe(redirect);
  });
});

describe("the Invoice detail loader", () => {
  it("loads the URL's Client's Invoice", async () => {
    answerAs(ADMIN);

    const outcome = await detailLoader(detailArgs());

    expect(getAdminInvoice).toHaveBeenCalledWith(CLIENT_ID, INVOICE_ID);
    expect(outcome).toMatchObject({
      data: { client: { clientId: CLIENT_ID }, invoice: DETAIL },
    });
  });

  it("is a 404 for another Client's Invoice", async () => {
    answerAs(ADMIN);
    // The module answers null unless the Invoice is that Client's.
    getAdminInvoice.mockResolvedValue(null);

    const thrown = await catchOutcome(() => detailLoader(detailArgs()));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  for (const invoiceId of [
    "0199d0a4-5b6c-7d8e-9f01-000000000000",
    "not-a-uuid",
  ]) {
    it(`is a 404 for the id ${invoiceId}`, async () => {
      answerAs(ADMIN);
      getAdminInvoice.mockResolvedValue(null);

      const thrown = await catchOutcome(() =>
        detailLoader(detailArgs({ clientId: CLIENT_ID, invoiceId })),
      );

      expect(thrown).toMatchObject({ init: { status: 404 } });
    });
  }

  it("is a 404 for an unknown Client", async () => {
    answerAs(ADMIN);
    getTeam.mockResolvedValue(null);

    const thrown = await catchOutcome(() => detailLoader(detailArgs()));

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("gives the page null, not an error, when the Invoice can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAdminInvoice.mockRejectedValue(new Error("connection refused"));

    const outcome = await detailLoader(detailArgs());

    expect(outcome).toMatchObject({ data: { invoice: null } });
  });

  it("revalidates as the theme rule says", () => {
    const args = {
      currentUrl: toUrl(DETAIL_PATH),
      nextUrl: toUrl(DETAIL_PATH),
      defaultShouldRevalidate: true,
    } as Parameters<typeof detailShouldRevalidate>[0];

    expect(detailShouldRevalidate(args)).toBe(true);
  });
});
