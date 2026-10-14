import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGithubPmSource,
  type GraphqlTransport,
} from "@/lib/pm-source/github-pm-source";
import { PmSourceError } from "@/lib/pm-source/pm-source";

const FIXTURES_DIR = join(import.meta.dirname, "../../fixtures/github");
const BOARD_ID = "PVT_kwDOBoard0001";
const CLOSED_BOARD_ID = "PVT_kwDOBoard0002";
const ITEMS_PAGE_2_CURSOR = "Y3Vyc29yOnYyOpMA";
const UPDATES_PAGE_2_CURSOR = "Y3Vyc29yOnN1OjE";
const BOARDS_PAGE_2_CURSOR = "Y3Vyc29yOnYyOpHO";
// Shape only; never sent anywhere (the transport is faked).
const FAKE_PRIVATE_KEY =
  "-----BEGIN RSA PRIVATE KEY-----\nnot-a-key\n-----END RSA PRIVATE KEY-----";

type Call = { operation: string; variables: Record<string, unknown> };

afterEach(() => {
  vi.restoreAllMocks();
});

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf8"));
}

// Answers each request with the recorded response for its operation and page
// cursor (`Operation` for the first page, `Operation@cursor` after), and
// records every request.
function createFakeGraphql(responses: Record<string, string>): {
  graphql: GraphqlTransport;
  calls: Call[];
} {
  const calls: Call[] = [];
  const graphql: GraphqlTransport = async (query, variables) => {
    const operation = /query (\w+)/.exec(query)?.[1] ?? "unnamed";
    calls.push({ operation, variables });
    const after = variables.after;
    const key = typeof after === "string" ? `${operation}@${after}` : operation;
    const fixture = responses[key];
    if (fixture === undefined) throw new Error(`No fixture for ${key}`);
    return loadFixture(fixture);
  };
  return { graphql, calls };
}

function createSource(graphql: GraphqlTransport) {
  return createGithubPmSource({
    appId: "123456",
    privateKey: FAKE_PRIVATE_KEY,
    installationId: 987654,
    org: "Example-Org",
    graphql,
  });
}

const OPEN_BOARD_RESPONSES = {
  PmBoardFields: "board-fields",
  PmBoardItems: "board-items-page-1",
  [`PmBoardItems@${ITEMS_PAGE_2_CURSOR}`]: "board-items-page-2",
  PmBoardStatusUpdates: "board-status-updates-page-1",
  [`PmBoardStatusUpdates@${UPDATES_PAGE_2_CURSOR}`]:
    "board-status-updates-page-2",
};

const CLOSED_BOARD_RESPONSES = {
  PmBoardFields: "board-fields-closed",
  PmBoardItems: "board-items-wrong-types",
  PmBoardStatusUpdates: "board-status-updates-empty",
};

describe("GitHub PmSource", () => {
  describe("listBoards", () => {
    it("returns the org's open and closed boards across pages, in order", async () => {
      const { graphql, calls } = createFakeGraphql({
        PmOrgBoards: "org-boards-page-1",
        [`PmOrgBoards@${BOARDS_PAGE_2_CURSOR}`]: "org-boards-page-2",
      });

      const boards = await createSource(graphql).listBoards();

      expect(boards).toEqual([
        {
          nodeId: BOARD_ID,
          number: 7,
          title: "Acme website",
          url: "https://github.com/orgs/Example-Org/projects/7",
          closed: false,
          updatedAt: new Date("2026-10-01T12:30:00Z"),
        },
        {
          nodeId: CLOSED_BOARD_ID,
          number: 3,
          title: "Old intranet",
          url: "https://github.com/orgs/Example-Org/projects/3",
          closed: true,
          updatedAt: new Date("2025-06-15T08:00:00Z"),
        },
        {
          nodeId: "PVT_kwDOBoard0003",
          number: 9,
          title: "Mobile app",
          url: "https://github.com/orgs/Example-Org/projects/9",
          closed: false,
          updatedAt: new Date("2026-10-10T10:00:00Z"),
        },
      ]);
      expect(calls.map((call) => call.variables.org)).toEqual([
        "Example-Org",
        "Example-Org",
      ]);
    });
  });

  describe("getBoard", () => {
    it("returns the board's header, Status options and required-field flags", async () => {
      const { graphql } = createFakeGraphql(OPEN_BOARD_RESPONSES);

      const board = await createSource(graphql).getBoard(BOARD_ID);

      expect(board).toMatchObject({
        nodeId: BOARD_ID,
        number: 7,
        title: "Acme website",
        url: "https://github.com/orgs/Example-Org/projects/7",
        closed: false,
        updatedAt: new Date("2026-10-01T12:30:00Z"),
        statusOptions: [
          { id: "f75ad846", name: "Todo" },
          { id: "47fc9ee4", name: "In progress" },
          { id: "98236657", name: "Done" },
        ],
        fields: { clientVisibility: true, clientNote: true, targetDate: true },
      });
    });

    it("returns both pages' items in order, one of each kind", async () => {
      const { graphql, calls } = createFakeGraphql(OPEN_BOARD_RESPONSES);

      const board = await createSource(graphql).getBoard(BOARD_ID);

      expect(board?.items).toEqual([
        {
          kind: "issue",
          itemNodeId: "PVTI_item0001",
          issueNodeId: "I_kwDOIssue0001",
          repositoryNodeId: "R_kgDORepo0001",
          title: "Design the home page",
          closedAt: null,
          milestone: { title: "Launch", dueOn: "2026-11-30" },
          visibility: "Visible",
          statusOptionId: "47fc9ee4",
          clientNote: "Waiting on the final logo",
          targetDate: "2026-11-15",
        },
        { kind: "other", itemNodeId: "PVTI_item0002" },
        { kind: "other", itemNodeId: "PVTI_item0003" },
        {
          kind: "issue",
          itemNodeId: "PVTI_item0004",
          issueNodeId: "I_kwDOIssue0002",
          repositoryNodeId: "R_kgDORepo0002",
          title: "Set up analytics",
          closedAt: new Date("2026-09-20T16:45:00Z"),
          milestone: { title: "Analytics", dueOn: null },
          visibility: "Internal",
          statusOptionId: null,
          clientNote: null,
          targetDate: null,
        },
        {
          kind: "issue",
          itemNodeId: "PVTI_item0005",
          issueNodeId: "I_kwDOIssue0003",
          repositoryNodeId: "R_kgDORepo0001",
          title: "Write the privacy page",
          closedAt: null,
          milestone: null,
          visibility: null,
          statusOptionId: null,
          clientNote: null,
          targetDate: null,
        },
        { kind: "unreadable", itemNodeId: "PVTI_item0006" },
      ]);
      const itemPageSizes = calls
        .filter((call) => call.operation === "PmBoardItems")
        .map((call) => call.variables.first);
      expect(itemPageSizes).toEqual([100, 100]);
    });

    it("returns every status update across pages, keeping a null health and turning a null body into ''", async () => {
      const { graphql } = createFakeGraphql(OPEN_BOARD_RESPONSES);

      const board = await createSource(graphql).getBoard(BOARD_ID);

      expect(board?.statusUpdates).toEqual([
        {
          nodeId: "PVTSU_update0001",
          health: "AT_RISK",
          startDate: "2026-09-01",
          targetDate: "2026-12-01",
          body: "Logo is late.\n\n- Waiting on the client",
          createdAt: new Date("2026-10-01T09:00:00Z"),
        },
        {
          nodeId: "PVTSU_update0002",
          health: null,
          startDate: null,
          targetDate: null,
          body: "",
          createdAt: new Date("2026-09-01T09:00:00Z"),
        },
      ]);
    });

    it("reads a closed board with no Status field and missing or wrong-typed required fields", async () => {
      const { graphql } = createFakeGraphql(CLOSED_BOARD_RESPONSES);

      const board = await createSource(graphql).getBoard(CLOSED_BOARD_ID);

      expect(board).toMatchObject({
        nodeId: CLOSED_BOARD_ID,
        closed: true,
        statusOptions: [],
        // "Client visibility" is text, "client note" has the wrong case.
        fields: {
          clientVisibility: false,
          clientNote: false,
          targetDate: true,
        },
        statusUpdates: [],
      });
      expect(board?.items).toEqual([
        {
          kind: "issue",
          itemNodeId: "PVTI_item0101",
          issueNodeId: "I_kwDOIssue0101",
          repositoryNodeId: "R_kgDORepo0001",
          title: "Archive old pages",
          closedAt: null,
          milestone: null,
          visibility: null,
          statusOptionId: null,
          clientNote: null,
          targetDate: "2025-07-01",
        },
      ]);
    });

    it("returns null when the board doesn't exist", async () => {
      const { graphql } = createFakeGraphql({ PmBoardFields: "not-found" });

      const board = await createSource(graphql).getBoard("PVT_kwDOMissing");

      expect(board).toBeNull();
    });

    it("reads an issue GitHub forbids the App to see as unreadable, keeping its siblings", async () => {
      const { graphql } = createFakeGraphql({
        ...CLOSED_BOARD_RESPONSES,
        PmBoardItems: "board-items-forbidden-content",
      });

      const board = await createSource(graphql).getBoard(CLOSED_BOARD_ID);

      expect(board?.items).toEqual([
        { kind: "unreadable", itemNodeId: "PVTI_item0201" },
        {
          kind: "issue",
          itemNodeId: "PVTI_item0202",
          issueNodeId: "I_kwDOIssue0202",
          repositoryNodeId: "R_kgDORepo0001",
          title: "Readable sibling",
          closedAt: null,
          milestone: null,
          visibility: null,
          statusOptionId: null,
          clientNote: null,
          targetDate: null,
        },
      ]);
    });
  });

  describe("getStatusOptions", () => {
    it("returns the Status field's options without fetching items", async () => {
      const { graphql, calls } = createFakeGraphql(OPEN_BOARD_RESPONSES);

      const options = await createSource(graphql).getStatusOptions(BOARD_ID);

      expect(options).toEqual([
        { id: "f75ad846", name: "Todo" },
        { id: "47fc9ee4", name: "In progress" },
        { id: "98236657", name: "Done" },
      ]);
      expect(calls.map((call) => call.operation)).toEqual(["PmBoardFields"]);
    });

    it("returns [] for a board with no Status field", async () => {
      const { graphql } = createFakeGraphql(CLOSED_BOARD_RESPONSES);

      const options =
        await createSource(graphql).getStatusOptions(CLOSED_BOARD_ID);

      expect(options).toEqual([]);
    });

    it("returns null when the board doesn't exist", async () => {
      const { graphql } = createFakeGraphql({ PmBoardFields: "not-found" });

      const options =
        await createSource(graphql).getStatusOptions("PVT_kwDOMissing");

      expect(options).toBeNull();
    });
  });

  describe("infra failures", () => {
    // Throws unless `run` rejects with a PmSourceError whose message is exactly
    // `message`, and checks the cause was logged.
    async function expectPmSourceError(
      run: () => Promise<unknown>,
      message: string,
    ): Promise<void> {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});

      const error = await run().then(
        () => null,
        (rejection: unknown) => rejection,
      );

      expect(error).toBeInstanceOf(PmSourceError);
      expect((error as PmSourceError).message).toBe(message);
      expect(logged).toHaveBeenCalled();
    }

    it("turns a network failure into a safe PmSourceError", async () => {
      const graphql: GraphqlTransport = async () => {
        throw new TypeError("fetch failed: token ghs_secret123");
      };

      await expectPmSourceError(
        () => createSource(graphql).getBoard(BOARD_ID),
        "GitHub request failed",
      );
    });

    it("names the HTTP status of a 5xx, never the payload", async () => {
      const graphql: GraphqlTransport = async () => {
        throw Object.assign(
          new Error("Bad gateway <html>ghs_secret123</html>"),
          {
            status: 502,
          },
        );
      };

      await expectPmSourceError(
        () => createSource(graphql).listBoards(),
        "GitHub request failed (502)",
      );
    });

    it("reports rejected App credentials", async () => {
      const graphql: GraphqlTransport = async () => {
        throw Object.assign(new Error("Bad credentials"), { status: 401 });
      };

      await expectPmSourceError(
        () => createSource(graphql).getStatusOptions(BOARD_ID),
        "GitHub rejected the App's credentials",
      );
    });

    it("reports a rate limit, by HTTP status or GraphQL error", async () => {
      const throttled: GraphqlTransport = async () => {
        throw Object.assign(new Error("API rate limit exceeded"), {
          status: 403,
        });
      };
      await expectPmSourceError(
        () => createSource(throttled).listBoards(),
        "GitHub rate limit reached",
      );

      const { graphql } = createFakeGraphql({ PmBoardFields: "rate-limited" });
      await expectPmSourceError(
        () => createSource(graphql).getBoard(BOARD_ID),
        "GitHub rate limit reached",
      );
    });

    it("rejects a malformed response", async () => {
      const graphql: GraphqlTransport = async () => ({
        data: { node: { __typename: "ProjectV2", id: BOARD_ID } },
      });

      await expectPmSourceError(
        () => createSource(graphql).getBoard(BOARD_ID),
        "GitHub returned an unexpected response",
      );
    });

    it("rejects a board url that isn't an https GitHub URL", async () => {
      const page = loadFixture("org-boards-page-2") as {
        data: { organization: { projectsV2: { nodes: { url: string }[] } } };
      };
      page.data.organization.projectsV2.nodes[0].url = "javascript:alert(1)";
      const graphql: GraphqlTransport = async () => page;

      await expectPmSourceError(
        () => createSource(graphql).listBoards(),
        "GitHub returned an unexpected response",
      );
    });
  });
});
