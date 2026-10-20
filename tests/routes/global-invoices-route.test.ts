import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Access,
  AccessResult,
  ArchivedClient,
  ClientSummary,
} from "@/lib/auth/auth";
import type { AdminInvoiceRow, Invoices } from "@/lib/invoices/invoices";
import type { Requests } from "@/lib/requests/requests";
import {
  action as createAction,
  clientAction as createClientAction,
  headers as listHeaders,
  loader as listLoader,
  meta as listMeta,
  shouldRevalidate as listShouldRevalidate,
} from "@/routes/admin/invoices";

// The session store and the Invoices module are the boundaries: the
// module's own tests cover the filter against the database.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const listClients = vi.fn<() => Promise<ClientSummary[]>>();
const listArchivedClients = vi.fn<() => Promise<ArchivedClient[]>>();
const listAdminInvoices = vi.fn<Invoices["listAdminInvoices"]>();
const listIssueYears = vi.fn<Invoices["listIssueYears"]>();
const createInvoice = vi.fn<Invoices["createInvoice"]>();
const listProjectOptionsByClient =
  vi.fn<Requests["listProjectOptionsByClient"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    listClients: () => listClients(),
    listArchivedClients: () => listArchivedClients(),
  },
}));

vi.mock("@/lib/invoices/invoices.server", () => ({
  invoices: {
    listAdminInvoices: (...args: Parameters<Invoices["listAdminInvoices"]>) =>
      listAdminInvoices(...args),
    listIssueYears: () => listIssueYears(),
    getToday: () => "2026-10-19",
    createInvoice: (...args: Parameters<Invoices["createInvoice"]>) =>
      createInvoice(...args),
  },
}));

vi.mock("@/lib/requests/requests.server", () => ({
  requests: {
    listProjectOptionsByClient: () => listProjectOptionsByClient(),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const ACTIVE_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const ARCHIVED_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const UNKNOWN_ID = "0199d0a4-5b6c-7d8e-9f01-23456789ffff";
const NEW_INVOICE_ID = "0199d0a4-5b6c-7d8e-9f01-2345678900bb";
const PROJECT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abd0";
const FOREIGN_ORIGIN = "http://www.localhost:5173";
const PROJECT_OPTIONS = {
  [ACTIVE_ID]: [{ id: PROJECT_ID, name: "Website", isPast: false }],
};
const DRAFT_FIELDS: [string, string][] = [
  ["issueDate", "2026-10-19"],
  ["dueDate", "2026-11-18"],
  ["projectId", PROJECT_ID],
  ["memo", "Thanks!"],
  ["description", "Discovery workshop"],
  ["amount", "1,000.00"],
];

const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const ANONYMOUS: Access = { kind: "anonymous" };
const CLIENT_USER: Access = {
  kind: "client",
  userId: "user-1",
  email: "owner@acme.test",
  name: "Olivia",
  clientId: ACTIVE_ID,
  clientName: "Acme",
  role: "owner",
};

const ACTIVE: ClientSummary = {
  id: ACTIVE_ID,
  name: "Acme",
  createdAt: new Date("2026-01-01"),
  userCount: 2,
  owner: null,
};
const ARCHIVED: ArchivedClient = {
  id: ARCHIVED_ID,
  name: "Old Co",
  archivedAt: new Date("2026-02-01"),
};
const ROW: AdminInvoiceRow = {
  id: "0199d0a4-5b6c-7d8e-9f01-2345678900aa",
  number: "NL-0042-2026",
  issueDate: "2026-10-19",
  dueDate: "2026-11-18",
  totalCents: 125_000,
  status: "OPEN",
  client: { id: ACTIVE_ID, name: "Acme", isArchived: false },
};

type LoaderArgs = Parameters<typeof listLoader>[0];
type ActionArgs = Parameters<typeof createAction>[0];

function postNew(
  fields: [string, string][] = [["clientId", ACTIVE_ID], ...DRAFT_FIELDS],
  origin = PORTAL_ORIGIN,
): ActionArgs {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  const request = new Request(`${PORTAL_ORIGIN}/admin/invoices?status=open`, {
    method: "POST",
    body,
    headers: { origin },
  });
  return { request, params: {}, context: {} } as ActionArgs;
}

function toUrl(path: string): URL {
  return new URL(`${PORTAL_ORIGIN}${path}`);
}

function argsFor(search = ""): LoaderArgs {
  // The loader reads only the request.
  return {
    request: new Request(`${PORTAL_ORIGIN}/admin/invoices${search}`),
    params: {},
    context: {},
  } as LoaderArgs;
}

function answerAs(access: Access): void {
  getAccess.mockResolvedValue({ access, headers: new Headers() });
}

// What a loader returned or threw, unwrapped.
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
  listClients.mockReset();
  listClients.mockResolvedValue([ACTIVE]);
  listArchivedClients.mockReset();
  listArchivedClients.mockResolvedValue([ARCHIVED]);
  listAdminInvoices.mockReset();
  listAdminInvoices.mockResolvedValue([ROW]);
  listIssueYears.mockReset();
  listIssueYears.mockResolvedValue([2026, 2025]);
  createInvoice.mockReset();
  createInvoice.mockResolvedValue({
    value: { id: NEW_INVOICE_ID, number: "NL-0043-2026" },
    error: null,
    status: 201,
    fieldErrors: {},
  });
  listProjectOptionsByClient.mockReset();
  listProjectOptionsByClient.mockResolvedValue(PROJECT_OPTIONS);
});

describe("the global Invoices loader's Admin guard", () => {
  for (const [access, home] of [
    [CLIENT_USER, "/overview"],
    [ANONYMOUS, "/sign-in"],
  ] as const) {
    it(`sends a ${access.kind} visitor to ${home}, reading nothing`, async () => {
      answerAs(access);

      const outcome = await catchOutcome(() => listLoader(argsFor()));

      expect(outcome).toBeInstanceOf(Response);
      expect((outcome as Response).headers.get("location")).toBe(home);
      expect(listAdminInvoices).not.toHaveBeenCalled();
      expect(listIssueYears).not.toHaveBeenCalled();
      expect(listClients).not.toHaveBeenCalled();
      expect(listArchivedClients).not.toHaveBeenCalled();
      expect(listProjectOptionsByClient).not.toHaveBeenCalled();
    });

    it(`sends a ${access.kind} visitor from the New invoice action to ${home}, creating nothing`, async () => {
      answerAs(access);

      const outcome = await catchOutcome(() => createAction(postNew()));

      expect(outcome).toBeInstanceOf(Response);
      expect((outcome as Response).headers.get("location")).toBe(home);
      expect(createInvoice).not.toHaveBeenCalled();
    });
  }

  it("refuses a cross-origin New invoice with 403 before the body is read", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = postNew(undefined, FOREIGN_ORIGIN);

    const thrown = await catchOutcome(() => createAction(post));

    expect(thrown).toMatchObject({ init: { status: 403 } });
    expect(post.request.bodyUsed).toBe(false);
    expect(createInvoice).not.toHaveBeenCalled();
  });
});

describe("the global Invoices loader", () => {
  it("lists every Invoice with no filter, with the Clients and years for the controls", async () => {
    answerAs(ADMIN);

    const outcome = await listLoader(argsFor());

    expect(listAdminInvoices).toHaveBeenCalledWith({});
    expect(outcome).toMatchObject({
      data: {
        clients: {
          active: [{ id: ACTIVE_ID, name: "Acme" }],
          archived: [{ id: ARCHIVED_ID, name: "Old Co" }],
        },
        years: [2026, 2025],
        form: {
          status: "all",
          clientId: null,
          issued: "any",
          from: "",
          to: "",
          q: "",
        },
        rangeError: null,
        rows: [ROW],
        projectOptionsByClient: PROJECT_OPTIONS,
        today: "2026-10-19",
      },
    });
  });

  it("gives the drawer null Project options, logged, when they can't load", async () => {
    answerAs(ADMIN);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    listProjectOptionsByClient.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor());

    expect(outcome).toMatchObject({
      data: { projectOptionsByClient: null, rows: [ROW] },
    });
    expect(logged).toHaveBeenCalled();
  });

  it("doesn't reload when the drawer only opens or closes", () => {
    const toggle = {
      currentUrl: toUrl("/admin/invoices?status=open"),
      nextUrl: toUrl("/admin/invoices?status=open&new=invoice"),
      defaultShouldRevalidate: true,
    } as Parameters<typeof listShouldRevalidate>[0];

    expect(listShouldRevalidate(toggle)).toBe(false);
    expect(
      listShouldRevalidate({
        ...toggle,
        nextUrl: toUrl("/admin/invoices?status=paid"),
      }),
    ).toBe(true);
  });

  it("applies the URL's status, Client, year and number together", async () => {
    answerAs(ADMIN);

    await listLoader(
      argsFor(`?status=open&client=${ARCHIVED_ID}&issued=2025&q=nl-0042`),
    );

    expect(listAdminInvoices).toHaveBeenCalledWith({
      status: "OPEN",
      clientId: ARCHIVED_ID,
      issuedFrom: "2025-01-01",
      issuedTo: "2025-12-31",
      numberQuery: "nl-0042",
    });
  });

  it("ignores malformed and unknown params, showing them unset", async () => {
    answerAs(ADMIN);

    const outcome = await listLoader(
      argsFor(`?status=late&client=${UNKNOWN_ID}&issued=1999`),
    );

    expect(listAdminInvoices).toHaveBeenCalledWith({});
    expect(outcome).toMatchObject({
      data: { form: { status: "all", clientId: null, issued: "any" } },
    });
  });

  it("drops a From after To, with the range error, keeping the other filters", async () => {
    answerAs(ADMIN);

    const outcome = await listLoader(
      argsFor("?status=paid&issued=custom&from=2026-05-01&to=2026-04-01"),
    );

    expect(listAdminInvoices).toHaveBeenCalledWith({ status: "PAID" });
    expect(outcome).toMatchObject({
      data: {
        form: { issued: "custom", from: "2026-05-01", to: "2026-04-01" },
        rangeError: "From must be on or before To.",
      },
    });
  });

  it("gives the panel null when the list can't load, logging the filter but not the message", async () => {
    answerAs(ADMIN);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    listAdminInvoices.mockRejectedValue(new Error("password=hunter2"));

    const outcome = await listLoader(argsFor("?status=void"));

    expect(outcome).toMatchObject({ data: { rows: null } });
    expect(logged).toHaveBeenCalledWith(expect.any(String), {
      filter: { status: "VOID" },
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("hunter2");
  });

  it("still loads when the options can't, flagging the Clients and years as failed, not empty", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listClients.mockRejectedValue(new Error("connection lost"));
    listArchivedClients.mockRejectedValue(new Error("connection lost"));
    listIssueYears.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor());

    expect(outcome).toMatchObject({
      data: { clients: null, years: null, rows: [ROW] },
    });
  });

  it("shows the list's error, not a wider list, when a Client filter's options can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listArchivedClients.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor(`?client=${ACTIVE_ID}`));

    expect(outcome).toMatchObject({ data: { rows: null } });
    expect(listAdminInvoices).not.toHaveBeenCalled();
  });

  it("shows the list's error, not a wider list, when a year filter's options can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listIssueYears.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor("?issued=2025"));

    expect(outcome).toMatchObject({ data: { rows: null } });
    expect(listAdminInvoices).not.toHaveBeenCalled();
  });

  it("still applies a custom range when the years can't load", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listIssueYears.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor("?issued=custom&from=2026-01-01"));

    expect(listAdminInvoices).toHaveBeenCalledWith({
      issuedFrom: "2026-01-01",
    });
    expect(outcome).toMatchObject({ data: { rows: [ROW] } });
  });

  it("is no-store", () => {
    const sent = listHeaders({
      loaderHeaders: new Headers(),
      parentHeaders: new Headers(),
    } as Parameters<typeof listHeaders>[0]);

    expect(new Headers(sent).get("cache-control")).toContain("no-store");
  });

  it("is titled for the Admin", () => {
    expect(listMeta()).toEqual([{ title: "Invoices · Neves Labs Admin" }]);
  });
});

describe("the global New invoice action", () => {
  it("creates the Invoice for the posted Client from the posted draft", async () => {
    answerAs(ADMIN);

    const outcome = await createAction(postNew());

    expect(createInvoice).toHaveBeenCalledWith(ACTIVE_ID, {
      issueDate: "2026-10-19",
      dueDate: "2026-11-18",
      projectId: PROJECT_ID,
      memo: "Thanks!",
      lineItems: [{ description: "Discovery workshop", amount: "1,000.00" }],
    });
    expect(outcome).toMatchObject({
      data: {
        kind: "created",
        invoiceId: NEW_INVOICE_ID,
        number: "NL-0043-2026",
      },
      init: { status: 201 },
    });
  });

  const NO_CLIENT_POSTS: [string, [string, string][]][] = [
    ["a missing", DRAFT_FIELDS],
    ["an empty", [["clientId", ""], ...DRAFT_FIELDS]],
    ["a non-UUID", [["clientId", "acme"], ...DRAFT_FIELDS]],
  ];
  for (const [label, fields] of NO_CLIENT_POSTS) {
    it(`answers ${label} Client with the field error and 422, reading nothing`, async () => {
      answerAs(ADMIN);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const outcome = await createAction(postNew(fields));

      expect(outcome).toMatchObject({
        data: {
          kind: "invalid",
          fieldErrors: { clientId: "Choose a client." },
        },
        init: { status: 422 },
      });
      expect(createInvoice).not.toHaveBeenCalled();
    });
  }

  it("maps the module's invalid draft to its field copy with 422", async () => {
    answerAs(ADMIN);
    const fieldErrors = { projectId: "Choose one of this Client's Projects." };
    createInvoice.mockResolvedValue({
      value: null,
      error: "invalid",
      status: 422,
      fieldErrors,
    });

    const outcome = await createAction(postNew());

    expect(outcome).toMatchObject({
      data: { kind: "invalid", fieldErrors },
      init: { status: 422 },
    });
  });

  for (const [error, status] of [
    ["archived", 409],
    ["not-found", 404],
  ] as const) {
    it(`maps the module's ${error} refusal with ${status}`, async () => {
      answerAs(ADMIN);
      createInvoice.mockResolvedValue({
        value: null,
        error,
        status,
        fieldErrors: {},
      });

      const outcome = await createAction(
        postNew([["clientId", UNKNOWN_ID], ...DRAFT_FIELDS]),
      );

      expect(createInvoice).toHaveBeenCalledWith(UNKNOWN_ID, expect.anything());
      expect(outcome).toMatchObject({
        data: { kind: "refused", error },
        init: { status },
      });
    });
  }

  it("answers a crash with a failure and 500, logging the Client but not the message", async () => {
    answerAs(ADMIN);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    createInvoice.mockRejectedValue(new Error("password=hunter2"));

    const outcome = await createAction(postNew());

    expect(outcome).toMatchObject({
      data: { kind: "failed" },
      init: { status: 500 },
    });
    expect(logged).toHaveBeenCalledWith(expect.any(String), {
      clientId: ACTIVE_ID,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("hunter2");
  });

  it("keeps a refusal's status in the clientAction, so nothing revalidates", async () => {
    type ClientArgs = Parameters<typeof createClientAction>[0];

    const outcome = await createClientAction({
      serverAction: async () => ({ kind: "refused", error: "archived" }),
    } as ClientArgs);

    expect(outcome).toMatchObject({ init: { status: 409 } });
  });
});
