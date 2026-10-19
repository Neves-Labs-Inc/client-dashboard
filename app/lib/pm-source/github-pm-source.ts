import { z } from "zod";
import { createInstallationGraphql } from "@/lib/pm-source/github-graphql";
import {
  PmSourceError,
  type PmBoard,
  type PmBoardSummary,
  type PmItem,
  type PmSource,
  type PmStatusOption,
  type PmStatusUpdate,
} from "@/lib/pm-source/pm-source";

// The transport seam. Resolves with GitHub's raw GraphQL response body
// (`{ data, errors? }`, GraphQL errors included). Rejects only on an infra
// failure; an HTTP failure carries its numeric `status`.
export type GraphqlTransport = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

export type GithubPmSourceConfig = {
  appId: string;
  privateKey: string;
  installationId: number;
  org: string;
  // Defaults to GitHub's API with the App's installation token.
  graphql?: GraphqlTransport;
};

// GitHub's maximum page size.
const PAGE_SIZE = 100;

// Board fields are matched by exact name and type.
const STATUS_FIELD = "Status";
const CLIENT_VISIBILITY_FIELD = "Client visibility";
const CLIENT_NOTE_FIELD = "Client note";
const TARGET_DATE_FIELD = "Target date";
const SINGLE_SELECT_TYPE = "SINGLE_SELECT";
const TEXT_TYPE = "TEXT";
const DATE_TYPE = "DATE";
const SINGLE_SELECT_VALUE = "ProjectV2ItemFieldSingleSelectValue";
const TEXT_VALUE = "ProjectV2ItemFieldTextValue";
const DATE_VALUE = "ProjectV2ItemFieldDateValue";
const VISIBILITIES = ["Visible", "Internal"] as const;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
// GitHub answers a primary or secondary rate limit with a 403 or 429.
const RATE_LIMIT_MESSAGE = /rate limit/i;

const MESSAGES = {
  requestFailed: "GitHub request failed",
  badCredentials: "GitHub rejected the App's credentials",
  rateLimited: "GitHub rate limit reached",
  graphqlError: "GitHub returned an error",
  malformed: "GitHub returned an unexpected response",
};

const ORG_BOARDS_QUERY = `
  query PmOrgBoards($org: String!, $first: Int!, $after: String) {
    organization(login: $org) {
      projectsV2(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id number title url closed updatedAt template }
      }
    }
  }
`;

const BOARD_FIELDS_QUERY = `
  query PmBoardFields($id: ID!) {
    node(id: $id) {
      ... on ProjectV2 {
        id number title url closed updatedAt
        fields(first: 100) {
          nodes {
            ... on ProjectV2FieldCommon { name dataType }
            ... on ProjectV2SingleSelectField { options { id name } }
          }
        }
      }
    }
  }
`;

const BOARD_ITEMS_QUERY = `
  query PmBoardItems($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on ProjectV2 {
        items(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            type
            content {
              ... on Issue {
                id title closedAt
                repository { id }
                milestone { title dueOn }
              }
            }
            fieldValues(first: 100) {
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId name
                  field { ... on ProjectV2FieldCommon { name } }
                }
                ... on ProjectV2ItemFieldTextValue {
                  text
                  field { ... on ProjectV2FieldCommon { name } }
                }
                ... on ProjectV2ItemFieldDateValue {
                  date
                  field { ... on ProjectV2FieldCommon { name } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const BOARD_STATUS_UPDATES_QUERY = `
  query PmBoardStatusUpdates($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on ProjectV2 {
        statusUpdates(first: $first, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id status startDate targetDate body createdAt }
        }
      }
    }
  }
`;

const isoDateTime = z.iso.datetime().transform((value) => new Date(value));
// `YYYY-MM-DD`, cut from a DateTime when GitHub sends one (milestone dueOn).
const plainDate = z.iso
  .date()
  .or(z.iso.datetime().transform((value) => value.slice(0, 10)));

const graphqlErrorSchema = z.object({
  type: z.string().optional(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
});

const responseSchema = z.object({
  data: z.unknown(),
  errors: z.array(graphqlErrorSchema).optional(),
});

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});

const boardSummaryFields = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  // Rendered as a link later, so only ever an https GitHub URL.
  url: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }),
  closed: z.boolean(),
  updatedAt: isoDateTime,
});

function toBoardSummary({
  id,
  ...summary
}: z.infer<typeof boardSummaryFields>): PmBoardSummary {
  return { nodeId: id, ...summary };
}

const boardSummarySchema = boardSummaryFields.transform(toBoardSummary);

// Only the org listing asks for `template`; getBoard never needs it.
const listedBoardSchema = boardSummaryFields
  .extend({ template: z.boolean() })
  .transform(({ template, ...fields }) => ({
    isTemplate: template,
    summary: toBoardSummary(fields),
  }));

const statusOptionSchema = z.object({ id: z.string(), name: z.string() });

const boardFieldSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  options: z.array(statusOptionSchema).optional(),
});

const boardHeaderSchema = boardSummarySchema.and(
  z.object({ fields: z.object({ nodes: z.array(boardFieldSchema) }) }),
);

const fieldValueSchema = z.object({
  __typename: z.string(),
  optionId: z.string().nullish(),
  name: z.string().nullish(),
  text: z.string().nullish(),
  date: plainDate.nullish(),
  field: z.object({ name: z.string() }).nullish(),
});

const issueContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  closedAt: isoDateTime.nullable(),
  repository: z.object({ id: z.string() }),
  milestone: z
    .object({ title: z.string(), dueOn: plainDate.nullable() })
    .nullable(),
});

type IssueContent = z.infer<typeof issueContentSchema>;
type FieldValue = z.infer<typeof fieldValueSchema>;

const itemSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    // A pull request or draft matches no fragment, so arrives as `{}`.
    content: z.union([issueContentSchema, z.strictObject({})]).nullable(),
    fieldValues: z.object({ nodes: z.array(fieldValueSchema) }),
  })
  .transform(toPmItem);

const statusUpdateSchema = z
  .object({
    id: z.string(),
    status: z
      .enum(["ON_TRACK", "AT_RISK", "OFF_TRACK", "COMPLETE", "INACTIVE"])
      .nullable(),
    startDate: plainDate.nullable(),
    targetDate: plainDate.nullable(),
    // null when the update was posted with only a health or dates.
    body: z
      .string()
      .nullable()
      .transform((body) => body ?? ""),
    createdAt: isoDateTime,
  })
  .transform(({ id, status, ...update }): PmStatusUpdate => ({
    nodeId: id,
    health: status,
    ...update,
  }));

function connectionSchema<T extends z.ZodType>(node: T) {
  return z.object({ pageInfo: pageInfoSchema, nodes: z.array(node) });
}

const orgBoardsDataSchema = z.object({
  organization: z.object({ projectsV2: connectionSchema(listedBoardSchema) }),
});
const boardHeaderDataSchema = z.object({ node: boardHeaderSchema.nullable() });
const boardItemsDataSchema = z.object({
  node: z.object({ items: connectionSchema(itemSchema) }).nullable(),
});
const boardStatusUpdatesDataSchema = z.object({
  node: z
    .object({ statusUpdates: connectionSchema(statusUpdateSchema) })
    .nullable(),
});

type Page<T> = { nodes: T[]; pageInfo: z.infer<typeof pageInfoSchema> };
type BoardHeader = z.infer<typeof boardHeaderSchema>;

export function createGithubPmSource(config: GithubPmSourceConfig): PmSource {
  const graphql =
    config.graphql ??
    createInstallationGraphql({
      appId: config.appId,
      privateKey: config.privateKey,
      installationId: config.installationId,
    });
  return new GithubPmSource({ graphql, org: config.org });
}

class GithubPmSource implements PmSource {
  private readonly graphql: GraphqlTransport;
  private readonly org: string;

  constructor(deps: { graphql: GraphqlTransport; org: string }) {
    this.graphql = deps.graphql;
    this.org = deps.org;
  }

  async listBoards(): Promise<PmBoardSummary[]> {
    const boards = await fetchAllPages(async (after) => {
      const data = await this.request(
        "PmOrgBoards",
        ORG_BOARDS_QUERY,
        { org: this.org, first: PAGE_SIZE, after },
        orgBoardsDataSchema,
      );
      return data.organization.projectsV2;
    });
    // The org always exists, so no page is ever null.
    // Templates are boards for copying from, never for linking.
    return (boards ?? [])
      .filter(({ isTemplate }) => !isTemplate)
      .map(({ summary }) => summary);
  }

  async getBoard(boardNodeId: string): Promise<PmBoard | null> {
    const header = await this.getBoardHeader(boardNodeId);
    if (header === null) return null;

    const items = await fetchAllPages(async (after) => {
      const data = await this.request(
        "PmBoardItems",
        BOARD_ITEMS_QUERY,
        { id: boardNodeId, first: PAGE_SIZE, after },
        boardItemsDataSchema,
      );
      return data.node?.items ?? null;
    });
    const statusUpdates = await fetchAllPages(async (after) => {
      const data = await this.request(
        "PmBoardStatusUpdates",
        BOARD_STATUS_UPDATES_QUERY,
        { id: boardNodeId, first: PAGE_SIZE, after },
        boardStatusUpdatesDataSchema,
      );
      return data.node?.statusUpdates ?? null;
    });
    // Deleted mid-read.
    if (items === null || statusUpdates === null) return null;

    const { fields, ...summary } = header;
    return {
      ...summary,
      statusOptions: findStatusOptions(fields.nodes),
      fields: {
        clientVisibility: hasField(
          fields.nodes,
          CLIENT_VISIBILITY_FIELD,
          SINGLE_SELECT_TYPE,
        ),
        clientNote: hasField(fields.nodes, CLIENT_NOTE_FIELD, TEXT_TYPE),
        targetDate: hasField(fields.nodes, TARGET_DATE_FIELD, DATE_TYPE),
      },
      items,
      statusUpdates,
    };
  }

  async getStatusOptions(
    boardNodeId: string,
  ): Promise<PmStatusOption[] | null> {
    const header = await this.getBoardHeader(boardNodeId);
    if (header === null) return null;

    return findStatusOptions(header.fields.nodes);
  }

  private async getBoardHeader(
    boardNodeId: string,
  ): Promise<BoardHeader | null> {
    const data = await this.request(
      "PmBoardFields",
      BOARD_FIELDS_QUERY,
      { id: boardNodeId },
      boardHeaderDataSchema,
    );
    return data.node;
  }

  // One GraphQL round trip: the parsed `data`, or a PmSourceError. A missing
  // board comes back as a null node, not an error.
  private async request<T>(
    operation: string,
    query: string,
    variables: Record<string, unknown>,
    dataSchema: z.ZodType<T>,
  ): Promise<T> {
    let body: unknown;
    try {
      body = await this.graphql(query, variables);
    } catch (error) {
      throw failWith(operation, describeTransportFailure(error), error);
    }

    const response = responseSchema.safeParse(body);
    if (!response.success) {
      throw failWith(operation, MESSAGES.malformed, response.error);
    }
    const errors = (response.data.errors ?? []).filter(
      (error) => !isExpectedGraphqlError(error),
    );
    if (errors.some((error) => error.type === "RATE_LIMITED")) {
      throw failWith(operation, MESSAGES.rateLimited, errors);
    }
    if (errors.length > 0) {
      throw failWith(operation, MESSAGES.graphqlError, errors);
    }
    const data = dataSchema.safeParse(response.data.data);
    if (!data.success) {
      throw failWith(operation, MESSAGES.malformed, data.error);
    }
    return data.data;
  }
}

// Follows the cursor until the last page. null when a page is null (the
// board was deleted).
async function fetchAllPages<T>(
  fetchPage: (after: string | null) => Promise<Page<T> | null>,
): Promise<T[] | null> {
  let nodes: T[] | null = [];
  let after: string | null = null;
  let hasNextPage = true;
  while (hasNextPage && nodes !== null) {
    const page: Page<T> | null = await fetchPage(after);
    nodes = page === null ? null : [...nodes, ...page.nodes];
    hasNextPage = page?.pageInfo.hasNextPage ?? false;
    after = page?.pageInfo.endCursor ?? null;
  }
  return nodes;
}

// Logs the cause (never shown) and builds the Admin-safe error.
function failWith(
  operation: string,
  message: string,
  cause: unknown,
): PmSourceError {
  console.error(`pm-source: ${operation} failed: ${message}`, cause);
  return new PmSourceError(message, { cause });
}

function describeTransportFailure(error: unknown): string {
  const status = getHttpStatus(error);
  const message = error instanceof Error ? error.message : "";
  const isRateLimited =
    status === HTTP_TOO_MANY_REQUESTS ||
    (status === HTTP_FORBIDDEN && RATE_LIMIT_MESSAGE.test(message));

  let description = MESSAGES.requestFailed;
  if (isRateLimited) {
    description = MESSAGES.rateLimited;
  } else if (status === HTTP_UNAUTHORIZED) {
    description = MESSAGES.badCredentials;
  } else if (status !== null) {
    description = `${MESSAGES.requestFailed} (${status})`;
  }
  return description;
}

function getHttpStatus(error: unknown): number | null {
  const hasStatus =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number";
  return hasStatus ? (error.status as number) : null;
}

// A missing board shows up as a null node. An item in a repo the App can't
// read may come back with null content and a FORBIDDEN error for it; it maps
// to an "unreadable" item rather than failing the board.
function isExpectedGraphqlError(
  error: z.infer<typeof graphqlErrorSchema>,
): boolean {
  const path = error.path ?? [];
  const isMissingBoard =
    error.type === "NOT_FOUND" && path.length === 1 && path[0] === "node";
  const isUnreadableItem =
    error.type === "FORBIDDEN" &&
    path.includes("items") &&
    path.includes("content");
  return isMissingBoard || isUnreadableItem;
}

function findStatusOptions(
  fields: z.infer<typeof boardFieldSchema>[],
): PmStatusOption[] {
  const statusField = fields.find(
    (field) =>
      field.name === STATUS_FIELD && field.dataType === SINGLE_SELECT_TYPE,
  );
  return statusField?.options ?? [];
}

function hasField(
  fields: z.infer<typeof boardFieldSchema>[],
  name: string,
  dataType: string,
): boolean {
  return fields.some(
    (field) => field.name === name && field.dataType === dataType,
  );
}

function toPmItem(item: {
  id: string;
  type: string;
  content: IssueContent | Record<string, never> | null;
  fieldValues: { nodes: FieldValue[] };
}): PmItem {
  if (item.type === "REDACTED" || item.content === null) {
    return { kind: "unreadable", itemNodeId: item.id };
  }
  if (item.type !== "ISSUE" || !isIssueContent(item.content)) {
    return { kind: "other", itemNodeId: item.id };
  }

  const values = item.fieldValues.nodes;
  const issue = item.content;
  const visibility = findFieldValue(
    values,
    CLIENT_VISIBILITY_FIELD,
    SINGLE_SELECT_VALUE,
  )?.name;
  return {
    kind: "issue",
    itemNodeId: item.id,
    issueNodeId: issue.id,
    repositoryNodeId: issue.repository.id,
    title: issue.title,
    closedAt: issue.closedAt,
    milestone: issue.milestone,
    visibility: isVisibility(visibility) ? visibility : null,
    statusOptionId:
      findFieldValue(values, STATUS_FIELD, SINGLE_SELECT_VALUE)?.optionId ??
      null,
    clientNote:
      findFieldValue(values, CLIENT_NOTE_FIELD, TEXT_VALUE)?.text ?? null,
    targetDate:
      findFieldValue(values, TARGET_DATE_FIELD, DATE_VALUE)?.date ?? null,
  };
}

function isIssueContent(
  content: IssueContent | Record<string, never>,
): content is IssueContent {
  return "repository" in content;
}

function isVisibility(
  name: string | null | undefined,
): name is (typeof VISIBILITIES)[number] {
  return VISIBILITIES.some((visibility) => visibility === name);
}

function findFieldValue(
  values: FieldValue[],
  fieldName: string,
  typename: string,
): FieldValue | undefined {
  return values.find(
    (value) => value.field?.name === fieldName && value.__typename === typename,
  );
}
