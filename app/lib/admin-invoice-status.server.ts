import { data } from "react-router";
import {
  getStatusChangeStatus,
  readStatusChange,
  type StatusChangeOutcome,
  type StatusChangeResponse,
  type StatusIntent,
  type StatusRefusal,
  UNKNOWN_INTENT_STATUS,
} from "@/lib/admin-invoice-status";
import { requireAdminMutation } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import { invoices } from "@/lib/invoices/invoices.server";

// The action behind both Admin Invoice detail routes (the Client tab's and
// the global one): Mark paid, Revert to Open and Void.

const NOT_FOUND = 404;

// The guard comes first, before the body is read: it is the CSRF
// protection. `clientId` is the URL's Client on the tab; the global route
// omits it, and the Invoice's own Client is looked up instead (a posted
// clientId is never read). The module refuses another Client's Invoice, an
// archived Client's and a stale status, and validates the paid date again.
// An Invoice nobody can find is a 404, the route's not-found page.
export async function runStatusAction(
  request: Request,
  invoiceId: string,
  clientId?: string,
): Promise<StatusChangeResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const change = readStatusChange(form);
  if (change === null) {
    console.warn("admin: refused an unknown Invoice action", {
      clientId,
      invoiceId,
    });
    return data<StatusChangeOutcome>(
      { kind: "failed" },
      { status: UNKNOWN_INTENT_STATUS, headers },
    );
  }

  let outcome: StatusChangeOutcome | "not-found";
  try {
    const ownerId = clientId ?? (await findClientId(invoiceId));
    outcome =
      ownerId === null
        ? "not-found"
        : await changeStatus(change, ownerId, invoiceId);
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(
      `admin: changing an Invoice's status failed (${describeError(error)})`,
      { clientId, invoiceId, intent: change.intent },
    );
    outcome = { kind: "failed" };
  }
  if (
    outcome === "not-found" ||
    (outcome.kind === "refused" && outcome.error === "not-found")
  ) {
    throw data(null, { status: NOT_FOUND, headers });
  }

  return data(outcome, { status: getStatusChangeStatus(outcome), headers });
}

// Null for an unknown or non-UUID id.
async function findClientId(invoiceId: string): Promise<string | null> {
  const invoice = await invoices.getAdminInvoiceById(invoiceId);
  return invoice?.client.id ?? null;
}

async function changeStatus(
  change: { intent: StatusIntent; paidDate: string },
  clientId: string,
  invoiceId: string,
): Promise<StatusChangeOutcome> {
  const { intent } = change;
  if (intent === "paid") {
    return markPaid(clientId, invoiceId, change.paidDate);
  }

  const result =
    intent === "revert"
      ? await invoices.revertPaid(clientId, invoiceId)
      : await invoices.voidInvoice(clientId, invoiceId);
  return toOutcome(intent, result.error);
}

async function markPaid(
  clientId: string,
  invoiceId: string,
  paidDate: string,
): Promise<StatusChangeOutcome> {
  const result = await invoices.markPaid(clientId, invoiceId, paidDate);
  return result.error === "invalid"
    ? { kind: "invalid", fieldErrors: result.fieldErrors }
    : toOutcome("paid", result.error);
}

function toOutcome(
  intent: StatusIntent,
  error: StatusRefusal | null,
): StatusChangeOutcome {
  return error === null
    ? { kind: "changed", intent }
    : { kind: "refused", intent, error };
}
