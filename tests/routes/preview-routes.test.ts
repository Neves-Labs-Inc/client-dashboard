import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access, AccessResult, Auth, Team } from "@/lib/auth/auth";
import type {
  ClientProjects,
  ProjectSummary,
  ProjectView,
} from "@/lib/client-projects/client-projects";
import type {
  InvoiceDetail,
  InvoiceRow,
  Invoices,
} from "@/lib/invoices/invoices";
import type {
  RequestDetail,
  Requests,
  RequestRow,
} from "@/lib/requests/requests";
import {
  action as invoiceAction,
  headers as invoiceHeaders,
  loader as invoiceLoader,
  meta as invoiceMeta,
} from "@/routes/preview/invoice";
import {
  action as invoicesAction,
  headers as invoicesHeaders,
  loader as invoicesLoader,
} from "@/routes/preview/invoices";
import {
  action as layoutAction,
  headers as layoutHeaders,
  loader as layoutLoader,
} from "@/routes/preview/layout";
import {
  action as overviewAction,
  headers as overviewHeaders,
  loader as overviewLoader,
} from "@/routes/preview/overview";
import {
  action as projectAction,
  headers as projectHeaders,
  loader as projectLoader,
  meta as projectMeta,
} from "@/routes/preview/project";
import {
  action as requestAction,
  headers as requestHeaders,
  loader as requestLoader,
  meta as requestMeta,
} from "@/routes/preview/request";
import {
  action as requestsAction,
  headers as requestsHeaders,
  loader as requestsLoader,
} from "@/routes/preview/requests";
import {
  action as projectsAction,
  headers as projectsHeaders,
  loader as projectsLoader,
} from "@/routes/preview/projects";

// The session store and the Better Auth Client lookup are the boundary: a
// fake getAccess answers as a slid session would, with a renewed cookie.
const RENEWED_COOKIE = "better-auth.session_token=renewed; Path=/; HttpOnly";
const getAccess = vi.fn<(request: Request) => Promise<AccessResult>>();
const getTeam = vi.fn<Auth["getTeam"]>();

vi.mock("@/lib/auth/auth.server", () => ({
  auth: {
    getAccess: (request: Request) => getAccess(request),
    getTeam: (clientId: string) => getTeam(clientId),
  },
}));

const listProjects = vi.fn<ClientProjects["listProjects"]>();
const countActiveProjects = vi.fn<ClientProjects["countActiveProjects"]>();
const getProject = vi.fn<ClientProjects["getProject"]>();

vi.mock("@/lib/client-projects/client-projects.server", () => ({
  clientProjects: {
    listProjects: (...args: Parameters<ClientProjects["listProjects"]>) =>
      listProjects(...args),
    countActiveProjects: (
      ...args: Parameters<ClientProjects["countActiveProjects"]>
    ) => countActiveProjects(...args),
    getProject: (...args: Parameters<ClientProjects["getProject"]>) =>
      getProject(...args),
  },
}));

const countNewRequests = vi.fn<Requests["countNewRequests"]>();
const listRequests = vi.fn<Requests["listRequests"]>();
const getRequest = vi.fn<Requests["getRequest"]>();
const listProjectOptions = vi.fn<Requests["listProjectOptions"]>();
const submitRequest = vi.fn<Requests["submitRequest"]>();
const editRequest = vi.fn<Requests["editRequest"]>();
const withdrawRequest = vi.fn<Requests["withdrawRequest"]>();

vi.mock("@/lib/requests/requests.server", () => ({
  requests: {
    getRequest: (...args: Parameters<Requests["getRequest"]>) =>
      getRequest(...args),
    listProjectOptions: (...args: Parameters<Requests["listProjectOptions"]>) =>
      listProjectOptions(...args),
    submitRequest: (...args: Parameters<Requests["submitRequest"]>) =>
      submitRequest(...args),
    editRequest: (...args: Parameters<Requests["editRequest"]>) =>
      editRequest(...args),
    withdrawRequest: (...args: Parameters<Requests["withdrawRequest"]>) =>
      withdrawRequest(...args),
    countNewRequests: (...args: Parameters<Requests["countNewRequests"]>) =>
      countNewRequests(...args),
    listRequests: (...args: Parameters<Requests["listRequests"]>) =>
      listRequests(...args),
  },
}));

const listInvoices = vi.fn<Invoices["listInvoices"]>();
const getInvoice = vi.fn<Invoices["getInvoice"]>();
const getInvoiceSummary = vi.fn<Invoices["getInvoiceSummary"]>();

vi.mock("@/lib/invoices/invoices.server", () => ({
  invoices: {
    listInvoices: (...args: Parameters<Invoices["listInvoices"]>) =>
      listInvoices(...args),
    getInvoice: (...args: Parameters<Invoices["getInvoice"]>) =>
      getInvoice(...args),
    getInvoiceSummary: (clientId: string) => getInvoiceSummary(clientId),
  },
}));

const PORTAL_ORIGIN = "http://localhost:5173";
const CLIENT_ID = "0199d0a4-5b6c-7d8e-9f01-23456789abcd";
const PROJECT_ID = "0199d0a4-5b6c-7d8e-9f01-2345678900aa";
const REQUEST_ID = "0199d0a4-5b6c-7d8e-9f01-2345678900bb";
const INVOICE_ID = "0199d0a4-5b6c-7d8e-9f01-2345678900cc";
const PREVIEW_PATH = `/admin/clients/${CLIENT_ID}/preview`;
const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;
// The Overview shows five Requests and asks for one more.
const OVERVIEW_REQUEST_ASK = 6;

const TEAM: Team = {
  clientId: CLIENT_ID,
  name: "Acme",
  archivedAt: null,
  members: [],
  pendingInvitations: [],
  canInviteFirstOwner: true,
};

const ADMIN: Access = { kind: "admin", email: "admin@test.local" };
const OWNER: Access = {
  kind: "client",
  userId: "u1",
  email: "maya@acme.test",
  name: "Maya Chen",
  clientId: CLIENT_ID,
  clientName: "Acme",
  role: "owner",
};

const SUMMARY: ProjectSummary = {
  id: PROJECT_ID,
  name: "Website",
  isPast: false,
  health: null,
  latestUpdateAt: null,
  latestNote: null,
  currentMilestone: null,
  taskCounts: { UP_NEXT: 0, IN_PROGRESS: 0, DONE: 0 },
};

const VIEW: ProjectView = {
  id: PROJECT_ID,
  name: "Website",
  isPast: false,
  latest: null,
  earlier: [],
  milestones: [],
  otherWork: null,
};

const REQUEST_ROW: RequestRow = {
  id: "r1",
  kind: "BUG",
  title: "Broken link",
  status: "NEW",
  submitterName: "Maya Chen",
  createdAt: new Date("2026-10-07"),
};

type Params = {
  clientId: string;
  projectId?: string;
  requestId?: string;
  invoiceId?: string;
};

function argsFor<Args>(path: string, params: Params, method = "GET"): Args {
  const request = new Request(`${PORTAL_ORIGIN}${path}`, {
    method,
    headers: { origin: PORTAL_ORIGIN },
  });
  // Loaders and actions read only the request and params.
  return { request, params, context: {} } as Args;
}

function answerAs(access: Access): void {
  const headers = new Headers();
  headers.append("set-cookie", RENEWED_COOKIE);
  getAccess.mockResolvedValue({ access, headers });
}

type Settled = { status: number; headers: Headers; data: unknown };

// What a loader or action returned or threw: a Response, or a data() result.
async function settle(run: () => Promise<unknown>): Promise<Settled> {
  let outcome: unknown;
  try {
    outcome = await run();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    outcome = thrown;
  }
  if (outcome instanceof Response) {
    return { status: outcome.status, headers: outcome.headers, data: null };
  }
  // data() returns a plain { data, init } object (a library return value).
  const result = outcome as { data: unknown; init?: ResponseInit | null };
  return {
    status: result.init?.status ?? 200,
    headers: new Headers(result.init?.headers),
    data: result.data,
  };
}

const PARAMS: Params = { clientId: CLIENT_ID };
const PROJECT_PARAMS: Params = { clientId: CLIENT_ID, projectId: PROJECT_ID };
const REQUEST_PARAMS: Params = { clientId: CLIENT_ID, requestId: REQUEST_ID };
const INVOICE_PARAMS: Params = { clientId: CLIENT_ID, invoiceId: INVOICE_ID };

const INVOICE_ROW: InvoiceRow = {
  id: INVOICE_ID,
  number: "NL-0007-2026",
  issueDate: "2026-09-01",
  dueDate: "2026-10-01",
  totalCents: 125_000,
  status: "OVERDUE",
};

const INVOICE_DETAIL: InvoiceDetail = {
  ...INVOICE_ROW,
  memo: null,
  paidDate: null,
  statusChangedAt: new Date("2026-09-01T15:00:00Z"),
  project: null,
  lineItems: [{ id: "l1", description: "Design", amountCents: 125_000 }],
};

const REQUEST_DETAIL: RequestDetail = {
  ...REQUEST_ROW,
  id: REQUEST_ID,
  description: "The footer link 404s.",
  statusChangedAt: new Date("2026-10-08"),
  responseNote: null,
  project: null,
  task: null,
  // The real read model says true for the submitter; the preview never
  // acts as one.
  canChange: true,
};

// Each preview page's loader, run for a Client id (and the Project's).
const LOADERS: Record<string, (params: Params) => Promise<unknown>> = {
  "preview layout": (params) => layoutLoader(argsFor(PREVIEW_PATH, params)),
  "preview Overview": (params) => overviewLoader(argsFor(PREVIEW_PATH, params)),
  "preview Projects": (params) =>
    projectsLoader(argsFor(`${PREVIEW_PATH}/projects`, params)),
  "preview Requests": (params) =>
    requestsLoader(argsFor(`${PREVIEW_PATH}/requests`, params)),
  "preview Request detail": (params) =>
    requestLoader(
      argsFor(`${PREVIEW_PATH}/requests/${REQUEST_ID}`, {
        requestId: REQUEST_ID,
        ...params,
      }),
    ),
  "preview Project view": (params) =>
    projectLoader(
      argsFor(`${PREVIEW_PATH}/projects/${PROJECT_ID}`, {
        projectId: PROJECT_ID,
        ...params,
      }),
    ),
  "preview Invoices": (params) =>
    invoicesLoader(argsFor(`${PREVIEW_PATH}/invoices`, params)),
  "preview Invoice detail": (params) =>
    invoiceLoader(
      argsFor(`${PREVIEW_PATH}/invoices/${INVOICE_ID}`, {
        invoiceId: INVOICE_ID,
        ...params,
      }),
    ),
};

const ACTIONS: Record<string, () => Promise<unknown>> = {
  "preview layout": () => layoutAction(argsFor(PREVIEW_PATH, PARAMS, "POST")),
  "preview Overview": () =>
    overviewAction(argsFor(`${PREVIEW_PATH}?index`, PARAMS, "POST")),
  "preview Projects": () =>
    projectsAction(argsFor(`${PREVIEW_PATH}/projects`, PARAMS, "POST")),
  "preview Requests": () =>
    requestsAction(argsFor(`${PREVIEW_PATH}/requests`, PARAMS, "POST")),
  "preview Request detail": () =>
    requestAction(
      argsFor(`${PREVIEW_PATH}/requests/${REQUEST_ID}`, REQUEST_PARAMS, "POST"),
    ),
  "preview Project view": () =>
    projectAction(
      argsFor(`${PREVIEW_PATH}/projects/${PROJECT_ID}`, PROJECT_PARAMS, "POST"),
    ),
  "preview Invoices": () =>
    invoicesAction(argsFor(`${PREVIEW_PATH}/invoices`, PARAMS, "POST")),
  "preview Invoice detail": () =>
    invoiceAction(
      argsFor(`${PREVIEW_PATH}/invoices/${INVOICE_ID}`, INVOICE_PARAMS, "POST"),
    ),
};

function expectNoReadModelCalls(): void {
  expect(listProjects).not.toHaveBeenCalled();
  expect(countActiveProjects).not.toHaveBeenCalled();
  expect(getProject).not.toHaveBeenCalled();
  expect(countNewRequests).not.toHaveBeenCalled();
  expect(listRequests).not.toHaveBeenCalled();
  expect(getRequest).not.toHaveBeenCalled();
  expect(listProjectOptions).not.toHaveBeenCalled();
  expect(submitRequest).not.toHaveBeenCalled();
  expect(editRequest).not.toHaveBeenCalled();
  expect(withdrawRequest).not.toHaveBeenCalled();
  expect(listInvoices).not.toHaveBeenCalled();
  expect(getInvoice).not.toHaveBeenCalled();
  expect(getInvoiceSummary).not.toHaveBeenCalled();
}

beforeEach(() => {
  getAccess.mockReset();
  answerAs(ADMIN);
  getTeam.mockReset();
  getTeam.mockResolvedValue(TEAM);
  listProjects.mockReset();
  listProjects.mockResolvedValue([SUMMARY]);
  countActiveProjects.mockReset();
  countActiveProjects.mockResolvedValue(3);
  getProject.mockReset();
  getProject.mockResolvedValue(VIEW);
  countNewRequests.mockReset();
  countNewRequests.mockResolvedValue(2);
  listRequests.mockReset();
  listRequests.mockResolvedValue([REQUEST_ROW]);
  getRequest.mockReset();
  getRequest.mockResolvedValue(REQUEST_DETAIL);
  listProjectOptions.mockReset();
  submitRequest.mockReset();
  editRequest.mockReset();
  withdrawRequest.mockReset();
  listInvoices.mockReset();
  listInvoices.mockResolvedValue([INVOICE_ROW]);
  getInvoice.mockReset();
  getInvoice.mockResolvedValue(INVOICE_DETAIL);
  getInvoiceSummary.mockReset();
  getInvoiceSummary.mockResolvedValue({
    openCount: 4,
    openBalanceCents: 425_000,
    overdueCount: 1,
  });
});

describe("the preview guard", () => {
  const turnedAway: [string, Access, string][] = [
    ["a visitor", { kind: "anonymous" }, "/sign-in"],
    [
      "a magic-link Admin",
      { kind: "admin-needs-passkey", email: "admin@test.local" },
      "/passkey",
    ],
    ["a Client User", OWNER, "/overview"],
  ];

  for (const [page, run] of Object.entries(LOADERS)) {
    for (const [who, access, home] of turnedAway) {
      it(`sends ${who} from the ${page} to ${home}, reading nothing`, async () => {
        answerAs(access);

        const { headers } = await settle(() => run(PARAMS));

        expect(headers.get("location")).toBe(home);
        expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
        expect(getTeam).not.toHaveBeenCalled();
        expectNoReadModelCalls();
      });
    }

    it(`answers 404 from the ${page} for an unknown Client, reading nothing`, async () => {
      getTeam.mockResolvedValue(null);

      const { status, headers } = await settle(() => run(PARAMS));

      expect(status).toBe(NOT_FOUND);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      expectNoReadModelCalls();
    });

    it(`answers 404 from the ${page} for a malformed Client id`, async () => {
      // The real getTeam reads a non-UUID as no Client.
      getTeam.mockResolvedValue(null);

      const { status } = await settle(() => run({ clientId: "not-a-uuid" }));

      expect(status).toBe(NOT_FOUND);
      expect(getTeam).toHaveBeenCalledWith("not-a-uuid");
      expectNoReadModelCalls();
    });
  }

  for (const [page, run] of Object.entries(ACTIONS)) {
    it(`refuses a POST to the ${page} with 405, reading nothing`, async () => {
      const { status, headers } = await settle(run);

      expect(status).toBe(METHOD_NOT_ALLOWED);
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
      expect(getTeam).not.toHaveBeenCalled();
      expectNoReadModelCalls();
    });

    it(`sends a Client User's POST to the ${page} to /overview`, async () => {
      answerAs(OWNER);

      const { headers } = await settle(run);

      expect(headers.get("location")).toBe("/overview");
      expectNoReadModelCalls();
    });
  }
});

describe("the preview layout", () => {
  it("gives the shell the Client and its Owner's nav counts", async () => {
    const { data } = await settle(() => LOADERS["preview layout"](PARAMS));

    expect(data).toEqual({
      clientId: CLIENT_ID,
      clientName: "Acme",
      isArchived: false,
      activeProjectCount: 3,
      newRequestCount: 2,
      openInvoiceCount: 4,
    });
    expect(getTeam).toHaveBeenCalledWith(CLIENT_ID);
    expect(countActiveProjects.mock.calls).toEqual([[CLIENT_ID]]);
    expect(countNewRequests.mock.calls).toEqual([[CLIENT_ID]]);
    expect(getInvoiceSummary.mock.calls).toEqual([[CLIENT_ID]]);
  });

  it("still renders the shell, without the open Invoice count, when it fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    getInvoiceSummary.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview layout"](PARAMS));

    expect(data).toMatchObject({
      activeProjectCount: 3,
      newRequestCount: 2,
      openInvoiceCount: null,
    });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("flags an archived Client", async () => {
    getTeam.mockResolvedValue({ ...TEAM, archivedAt: new Date("2026-10-01") });

    const { data } = await settle(() => LOADERS["preview layout"](PARAMS));

    expect(data).toMatchObject({ isArchived: true });
  });

  it("still renders the shell, without a count, when a count fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    countNewRequests.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview layout"](PARAMS));

    expect(data).toMatchObject({
      activeProjectCount: 3,
      newRequestCount: null,
    });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("the preview Overview", () => {
  it("reads the URL's Client's Projects and Requests, never a user's", async () => {
    const { data } = await settle(() => LOADERS["preview Overview"](PARAMS));
    const page = data as {
      clientName: string;
      projects: Promise<ProjectSummary[] | null>;
      requests: Promise<RequestRow[] | null>;
    };

    expect(page.clientName).toBe("Acme");
    await expect(page.projects).resolves.toEqual([SUMMARY]);
    await expect(page.requests).resolves.toEqual([REQUEST_ROW]);
    expect(listProjects.mock.calls).toEqual([[CLIENT_ID]]);
    expect(listRequests.mock.calls).toEqual([
      [CLIENT_ID, { limit: OVERVIEW_REQUEST_ASK }],
    ]);
  });

  it("resolves a failed list to null, for the panel's error state", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    listRequests.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview Overview"](PARAMS));

    await expect(
      (data as { requests: Promise<unknown> }).requests,
    ).resolves.toBeNull();
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("the preview Projects", () => {
  it("reads the URL's Client's Projects", async () => {
    const { data } = await settle(() => LOADERS["preview Projects"](PARAMS));
    const page = data as {
      clientName: string;
      projects: Promise<ProjectSummary[] | null>;
    };

    expect(page.clientName).toBe("Acme");
    await expect(page.projects).resolves.toEqual([SUMMARY]);
    expect(listProjects.mock.calls).toEqual([[CLIENT_ID]]);
  });
});

describe("the preview Project view", () => {
  it("reads the URL's Client's Project", async () => {
    const { data } = await settle(() =>
      LOADERS["preview Project view"](PARAMS),
    );

    expect(data).toEqual({ clientName: "Acme", project: VIEW });
    expect(getProject.mock.calls).toEqual([[CLIENT_ID, PROJECT_ID]]);
  });

  it("answers 404 for a Project the Client can't see", async () => {
    getProject.mockResolvedValue(null);

    const { status, headers } = await settle(() =>
      LOADERS["preview Project view"](PARAMS),
    );

    expect(status).toBe(NOT_FOUND);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});

describe("the preview Requests", () => {
  it("reads the URL's Client's Requests, never a user's or the options", async () => {
    const { data } = await settle(() => LOADERS["preview Requests"](PARAMS));

    expect(data).toMatchObject({ clientName: "Acme", requests: [REQUEST_ROW] });
    expect(listRequests.mock.calls).toEqual([[CLIENT_ID]]);
    expect(listProjectOptions).not.toHaveBeenCalled();
  });

  it("gives the panel null, not a throw, when the list fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    listRequests.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview Requests"](PARAMS));

    expect(data).toMatchObject({ requests: null });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("the preview Request detail", () => {
  it("reads the Request for the URL's Client, as a viewer who isn't its submitter", async () => {
    const { data } = await settle(() =>
      LOADERS["preview Request detail"](REQUEST_PARAMS),
    );

    expect(data).toMatchObject({
      clientName: "Acme",
      detail: { id: REQUEST_ID, canChange: false },
    });
    expect(getRequest.mock.calls).toEqual([
      [{ clientId: CLIENT_ID, userId: "" }, REQUEST_ID],
    ]);
    expect(listProjectOptions).not.toHaveBeenCalled();
  });

  it("answers 404 for a Request the Client can't see", async () => {
    getRequest.mockResolvedValue(null);

    const { status, headers } = await settle(() =>
      LOADERS["preview Request detail"](REQUEST_PARAMS),
    );

    expect(status).toBe(NOT_FOUND);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});

describe("the preview Invoices", () => {
  it("reads the URL's Client's Invoices and open balance", async () => {
    const { data } = await settle(() => LOADERS["preview Invoices"](PARAMS));

    expect(data).toEqual({
      clientName: "Acme",
      invoices: [INVOICE_ROW],
      openBalanceCents: 425_000,
    });
    expect(listInvoices.mock.calls).toEqual([[CLIENT_ID]]);
    expect(getInvoiceSummary.mock.calls).toEqual([[CLIENT_ID]]);
  });

  it("gives the panel null, not a throw, when the list fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    listInvoices.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview Invoices"](PARAMS));

    expect(data).toMatchObject({ invoices: null, openBalanceCents: 425_000 });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it("keeps the list, without the open balance, when the summary fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    getInvoiceSummary.mockRejectedValue(new Error("connection lost"));

    const { data } = await settle(() => LOADERS["preview Invoices"](PARAMS));

    expect(data).toMatchObject({
      invoices: [INVOICE_ROW],
      openBalanceCents: null,
    });
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });
});

describe("the preview Invoice detail", () => {
  it("reads the Invoice for the URL's Client", async () => {
    const { data } = await settle(() =>
      LOADERS["preview Invoice detail"](INVOICE_PARAMS),
    );

    // The Admin's last status change never reaches the Client.
    const { statusChangedAt, ...shown } = INVOICE_DETAIL;
    expect(statusChangedAt).toBeInstanceOf(Date);
    expect(data).toEqual({ clientName: "Acme", detail: shown });
    expect(getInvoice.mock.calls).toEqual([[CLIENT_ID, INVOICE_ID]]);
  });

  it("answers 404 for an Invoice the Client can't see", async () => {
    getInvoice.mockResolvedValue(null);

    const { status, headers } = await settle(() =>
      LOADERS["preview Invoice detail"](INVOICE_PARAMS),
    );

    expect(status).toBe(NOT_FOUND);
    expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
  });
});

describe("the preview not-found titles", () => {
  // The shape React Router gives a thrown data(…, { status }).
  const notFound = {
    status: NOT_FOUND,
    statusText: "",
    internal: false,
    data: null,
  };
  const withLayout = [
    { id: "root", data: undefined },
    { id: "routes/preview/layout", data: { clientName: "Acme" } },
  ];
  const withoutLayout = [{ id: "root", data: undefined }];

  type LooseMeta = (args: unknown) => unknown;
  const titleOf = (descriptors: unknown): unknown =>
    (descriptors as { title: string }[])[0].title;

  const cases = [
    ["Request", requestMeta, "Request not found"],
    ["Project", projectMeta, "Project not found"],
    ["Invoice", invoiceMeta, "Invoice not found"],
  ] as const;

  for (const [what, meta, label] of cases) {
    it(`names the Client in the ${what} not-found title`, () => {
      const args = { error: notFound, matches: withLayout };

      expect(titleOf((meta as LooseMeta)(args))).toBe(
        `Preview · ${label} · Acme · Neves Labs`,
      );
    });

    it(`leaves the Client out of the ${what} not-found title without layout data`, () => {
      const args = { error: notFound, matches: withoutLayout };

      expect(titleOf((meta as LooseMeta)(args))).toBe(
        `Preview · ${label} · Neves Labs`,
      );
    });
  }
});

describe("the preview responses", () => {
  const routeHeaders = {
    "preview layout": layoutHeaders,
    "preview Overview": overviewHeaders,
    "preview Projects": projectsHeaders,
    "preview Project view": projectHeaders,
    "preview Requests": requestsHeaders,
    "preview Request detail": requestHeaders,
    "preview Invoices": invoicesHeaders,
    "preview Invoice detail": invoiceHeaders,
  };

  for (const [page, getHeaders] of Object.entries(routeHeaders)) {
    it(`makes the ${page} no-store and keeps the session's cookie`, () => {
      type HeadersArgs = Parameters<typeof getHeaders>[0];
      const loaderHeaders = new Headers();
      loaderHeaders.append("set-cookie", RENEWED_COOKIE);

      const headers = new Headers(
        getHeaders({
          loaderHeaders,
          parentHeaders: new Headers(),
        } as HeadersArgs),
      );

      expect(headers.get("cache-control")).toBe("private, no-store");
      expect(headers.getSetCookie()).toEqual([RENEWED_COOKIE]);
    });
  }
});
