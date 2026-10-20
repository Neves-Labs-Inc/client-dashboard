import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Access,
  AccessResult,
  ArchivedClient,
  ClientSummary,
} from "@/lib/auth/auth";
import type { AdminInvoiceRow, Invoices } from "@/lib/invoices/invoices";
import {
  headers as listHeaders,
  loader as listLoader,
  meta as listMeta,
} from "@/routes/admin/invoices";

// The session store and the Invoices module are the boundaries: the
// module's own tests cover the filter against the database.
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const listClients = vi.fn<() => Promise<ClientSummary[]>>();
const listArchivedClients = vi.fn<() => Promise<ArchivedClient[]>>();
const listAdminInvoices = vi.fn<Invoices["listAdminInvoices"]>();
const listIssueYears = vi.fn<Invoices["listIssueYears"]>();

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
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const ACTIVE_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const ARCHIVED_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abce";
const UNKNOWN_ID = "0199d0a4-5b6c-7d8e-9f01-23456789ffff";

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
    });
  }
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
      },
    });
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

  it("still loads, with no Client or year options, when they can't", async () => {
    answerAs(ADMIN);
    vi.spyOn(console, "error").mockImplementation(() => {});
    listClients.mockRejectedValue(new Error("connection lost"));
    listArchivedClients.mockRejectedValue(new Error("connection lost"));
    listIssueYears.mockRejectedValue(new Error("connection lost"));

    const outcome = await listLoader(argsFor());

    expect(outcome).toMatchObject({
      data: { clients: { active: [], archived: [] }, years: [], rows: [ROW] },
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
