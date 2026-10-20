import { useRef } from "react";
import {
  data,
  useRouteLoaderData,
  useSearchParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import ArchivedClientsPanel from "@/components/admin/archived-clients-panel";
import ClientsPanel from "@/components/admin/clients-panel";
import CreateClientDrawer from "@/components/admin/create-client-drawer";
import LinkBoardDrawer from "@/components/admin/link-board-drawer";
import NewClientLink from "@/components/admin/new-client-link";
import UnassignedBoardsPanel from "@/components/admin/unassigned-boards-panel";
import PageHeader from "@/components/ui/page-header";
import type { CreateClientError } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import { boardSync } from "@/lib/board-sync/board-sync.server";
import { CLIENT_NAME_COPY, getClientNameError } from "@/lib/client-name";
import { describeError } from "@/lib/describe-error";
import {
  BOARD_FIELD,
  CLIENT_FIELD,
  INTENT_FIELD,
  isLinkDrawerToggle,
  LINK_INTENT,
  LINK_PARAM,
  OPTIONS_FIELD,
  parseMapping,
  parseOptions,
  type LinkOutcome,
} from "@/lib/link-board";
import {
  isNewClientDrawerToggle,
  NEW_CLIENT_PARAM,
  NEW_CLIENT_VALUE,
  type CreateClientOutcome,
} from "@/lib/new-client";
import { getNoStoreHeaders } from "@/lib/no-store-headers";
import {
  requireAdmin,
  requireAdminMutation,
} from "@/lib/auth/require-access.server";
import { revalidateUnlessThemeFailed } from "@/lib/theme";
import type { Route } from "./+types/index";
import type { loader as adminLayoutLoader } from "./layout";

const ADMIN_LAYOUT_ROUTE_ID = "routes/admin/layout";

const BAD_REQUEST = 400;
const UNPROCESSABLE = 422;
const SERVER_ERROR = 500;
const SERVICE_UNAVAILABLE = 503;

// The create-Client drawer and the Link drawer both post here.
type HomeOutcome = CreateClientOutcome | LinkOutcome;
type OutcomeResponse = ReturnType<typeof data<HomeOutcome>>;

export function meta(): Route.MetaDescriptors {
  return [{ title: "Clients · Neves Labs Admin" }];
}

// The roster and the unassigned boards stream in un-awaited, so the page
// and its skeletons render
// first. The layout's loader guards the document too, but runs alongside this
// one, so this runs the guard itself.
export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireAdmin(request);
  // Resolves to null on failure instead of rejecting: a rejection that
  // reaches the browser before <Await> renders is an unhandled rejection
  // there, and it would carry the driver's error (SQL text and parameters).
  // The real error is logged here only. Nothing here can reject, so nothing
  // is unhandled on the server either.
  const clients = auth.listClients().catch((error: unknown) => {
    console.error("admin: couldn't load Clients", error);
    return null;
  });
  const boards = boardSync.listUnassignedBoards().catch((error: unknown) => {
    console.error(
      `admin: couldn't load the unassigned boards (${describeError(error)})`,
    );
    return null;
  });
  return data({ clients, boards }, { headers });
}

// The create-Client drawer and the Link drawer (intent=link) post here. A
// parent route's loader never runs before an action, so this runs the guard
// itself, before the body is read: it is the only CSRF protection.
export async function action({
  request,
}: Route.ActionArgs): Promise<OutcomeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  return form?.get(INTENT_FIELD) === LINK_INTENT
    ? runLink(form, headers)
    : runCreate(readField(form, "name"), headers);
}

async function runCreate(
  name: string,
  headers: Headers,
): Promise<OutcomeResponse> {
  try {
    const result = await auth.createClient(name);
    const outcome: CreateClientOutcome =
      result.error === null
        ? { kind: "created", clientId: result.value.clientId }
        : { kind: "invalid", fieldError: getFieldError(result.error, name) };
    return data(outcome, { status: result.status, headers });
  } catch (error) {
    // The drawer shows its banner; the error itself stays on the server.
    console.error("admin: couldn't create a Client", error);
    return data<HomeOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

async function runLink(
  form: FormData,
  headers: Headers,
): Promise<OutcomeResponse> {
  const boardNodeId = readField(form, BOARD_FIELD);
  const clientId = readField(form, CLIENT_FIELD);
  const options = parseOptions(form.get(OPTIONS_FIELD));
  const mapping = parseMapping(form);
  if (options === null || mapping === null) {
    console.warn("admin: refused a link with a malformed options or mapping", {
      boardNodeId,
    });
    return data<HomeOutcome>(
      { kind: "failed" },
      { status: BAD_REQUEST, headers },
    );
  }

  try {
    const result = await boardSync.link({
      boardNodeId,
      clientId,
      options,
      mapping,
    });
    const outcome: LinkOutcome =
      result.error === null
        ? { kind: "linked", clientId, ...result.value }
        : { kind: "refused", error: result.error };
    return data(outcome, { status: result.status, headers });
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(`admin: couldn't link a board (${describeError(error)})`, {
      boardNodeId,
      clientId,
    });
    return data<HomeOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}

// A network failure (or a crash) becomes the drawer's banner instead of the
// route's error page. Redirects (the guard's) still go through. Anything but
// a create or a link carries a 4xx/5xx status, so no loader revalidates:
// offline, a revalidation would throw the whole page to the root error
// boundary.
export async function clientAction({
  serverAction,
}: Route.ClientActionArgs): Promise<HomeOutcome | OutcomeResponse> {
  try {
    const outcome = await serverAction();
    if (outcome.kind === "created" || outcome.kind === "linked") {
      return outcome;
    }

    const status = outcome.kind === "failed" ? SERVER_ERROR : UNPROCESSABLE;
    return data(outcome, { status });
  } catch (error) {
    if (error instanceof Response) throw error;

    console.error("admin: the Home request failed", error);
    return data<HomeOutcome>(
      { kind: "failed" },
      { status: SERVICE_UNAVAILABLE },
    );
  }
}

function readField(form: FormData | null, name: string): string {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

function getFieldError(error: CreateClientError, name: string): string {
  if (error === "duplicate-name") return CLIENT_NAME_COPY.duplicate;

  return getClientNameError(name) ?? CLIENT_NAME_COPY.blank;
}

export const headers = getNoStoreHeaders;

export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return (
    revalidateUnlessThemeFailed(args) &&
    !isNewClientDrawerToggle(args) &&
    !isLinkDrawerToggle(args)
  );
}

export default function AdminHome({
  loaderData,
}: Route.ComponentProps): React.ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The layout's awaited list, also the sidebar's: one query, no loading
  // state of its own.
  const layoutData = useRouteLoaderData<typeof adminLayoutLoader>(
    ADMIN_LAYOUT_ROUTE_ID,
  );
  const isCreating = searchParams.get(NEW_CLIENT_PARAM) === NEW_CLIENT_VALUE;
  const linkingBoardId = searchParams.get(LINK_PARAM);

  function handleCreateOpenChange(open: boolean): void {
    if (open) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_CLIENT_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  function handleLinkOpenChange(open: boolean): void {
    if (open) return;

    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(LINK_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin" }, { label: "Home" }]}
        title="Clients"
        titleRef={titleRef}
        action={<NewClientLink />}
      />
      <ClientsPanel
        clients={loaderData.clients}
        syncProblemClientIds={layoutData?.syncProblemClientIds ?? []}
        overdueInvoiceClientIds={layoutData?.overdueInvoiceClientIds ?? []}
      />
      <UnassignedBoardsPanel boards={loaderData.boards} />
      {layoutData && (
        <ArchivedClientsPanel
          clients={layoutData.archivedClients}
          fallbackFocusRef={titleRef}
        />
      )}
      <CreateClientDrawer
        open={isCreating}
        onOpenChange={handleCreateOpenChange}
      />
      <LinkBoardDrawer
        boardNodeId={linkingBoardId}
        clients={layoutData?.clients ?? null}
        boards={loaderData.boards}
        onOpenChange={handleLinkOpenChange}
      />
    </>
  );
}
