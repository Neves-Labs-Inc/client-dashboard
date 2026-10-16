import { data } from "react-router";
import type { ClientWorkspace } from "@/components/admin/client-workspace-header";
import {
  TRIAGE_NOTE_FIELD,
  TRIAGE_STATUS_FIELD,
  TRIAGE_TASK_FIELD,
  type TriageOutcome,
  type TriageResponse,
} from "@/lib/admin-requests";
import { auth } from "@/lib/auth/auth.server";
import { requireAdminMutation } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { TaskOptionGroup } from "@/lib/requests/request-rules";
import type { AdminRequestDetail } from "@/lib/requests/requests";
import { requests } from "@/lib/requests/requests.server";

// The loaders and the action behind both triage detail routes (the inbox's
// and the Client tab's). Reads and writes run as app_system.

const NOT_FOUND = 404;
const SERVER_ERROR = 500;

export type TriageLoad = {
  // Null when it couldn't load.
  request: AdminRequestDetail | null;
  // Null when they couldn't load, or the Request is read-only.
  taskOptions: TaskOptionGroup[] | null;
};

// The workspace header's Client: null when it couldn't load.
export async function loadClientWorkspace(
  clientId: string,
): Promise<ClientWorkspace | "not-found" | null> {
  try {
    const team = await auth.getTeam(clientId);
    return team === null
      ? "not-found"
      : {
          clientId: team.clientId,
          name: team.name,
          archivedAt: team.archivedAt,
        };
  } catch (error) {
    console.error(`admin: couldn't load the Client (${describeError(error)})`, {
      clientId,
    });
    return null;
  }
}

// The Request (of `clientId` when given) and, while it can be triaged, the
// Client's Task options.
export async function loadTriage(
  requestId: string,
  clientId?: string,
): Promise<TriageLoad | "not-found"> {
  let request: AdminRequestDetail | null;
  try {
    request = await requests.getAdminRequest(requestId, clientId);
  } catch (error) {
    console.error(
      `admin: couldn't load the Request (${describeError(error)})`,
      { requestId, clientId },
    );
    return { request: null, taskOptions: null };
  }
  if (request === null) return "not-found";

  const isReadOnly = request.status === "WITHDRAWN" || request.clientArchived;
  const taskOptions = isReadOnly ? null : await loadTaskOptions(request);
  return { request, taskOptions };
}

async function loadTaskOptions(
  request: AdminRequestDetail,
): Promise<TaskOptionGroup[] | null> {
  try {
    return await requests.listTaskOptions(
      request.clientId,
      request.project?.id ?? null,
    );
  } catch (error) {
    console.error(
      `admin: couldn't load the Task options (${describeError(error)})`,
      { requestId: request.id, clientId: request.clientId },
    );
    return null;
  }
}

// The triage save. The guard comes first, before the body is read: it is
// the only CSRF protection. With `clientId` (the tab route), a Request of
// another Client is refused as not found.
export async function runTriageAction(
  request: Request,
  requestId: string,
  clientId?: string,
): Promise<TriageResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  try {
    if (clientId !== undefined) {
      const owned = await requests.getAdminRequest(requestId, clientId);
      if (owned === null) {
        console.warn("admin: refused to triage another Client's Request", {
          requestId,
          clientId,
        });
        return data<TriageOutcome>(
          { kind: "refused", error: "not-found" },
          { status: NOT_FOUND, headers },
        );
      }
    }

    const result = await requests.triageRequest(requestId, {
      status: form?.get(TRIAGE_STATUS_FIELD) ?? null,
      responseNote: form?.get(TRIAGE_NOTE_FIELD) ?? null,
      // Absent while the Task select is hidden: no Task.
      taskId: form?.get(TRIAGE_TASK_FIELD) ?? null,
    });
    const outcome: TriageOutcome =
      result.error === null
        ? { kind: "saved" }
        : { kind: "refused", error: result.error };
    return data(outcome, { status: result.status, headers });
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters
    // (the note).
    console.error(`admin: the triage failed (${describeError(error)})`, {
      requestId,
    });
    return data<TriageOutcome>(
      { kind: "failed" },
      { status: SERVER_ERROR, headers },
    );
  }
}
