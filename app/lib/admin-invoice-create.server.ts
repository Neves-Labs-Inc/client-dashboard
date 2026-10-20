import { data } from "react-router";
import {
  type CreateInvoiceOutcome,
  type CreateInvoiceResponse,
  getCreateStatus,
  INVOICE_FIELD,
  INVOICES_COPY,
  readInvoiceDraft,
} from "@/lib/admin-invoices";
import { requireAdminMutation } from "@/lib/auth/require-access.server";
import { describeError } from "@/lib/describe-error";
import type { Invoices } from "@/lib/invoices/invoices";
import { invoices } from "@/lib/invoices/invoices.server";

// The action behind both New invoice drawers (the Client tab's and the
// global one).

// Shape check only: the module answers an unknown Client as not-found.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The guard comes first, before the body is read: it is the CSRF
// protection. `clientId` is the URL's Client on the tab; the global route
// omits it, and the posted Client is read instead (a missing or non-UUID one
// is a field error, with no DB call). The module refuses an archived or
// unknown Client, and validates the draft again.
export async function runCreateAction(
  request: Request,
  clientId?: string,
): Promise<CreateInvoiceResponse> {
  const { headers } = await requireAdminMutation(request);
  const form = await request.formData().catch(() => null);
  const ownerId = clientId ?? readPostedClientId(form);

  let outcome: CreateInvoiceOutcome;
  if (ownerId === null) {
    console.warn("admin: refused a New invoice without a valid Client");
    outcome = {
      kind: "invalid",
      fieldErrors: { [INVOICE_FIELD.clientId]: INVOICES_COPY.clientRequired },
    };
  } else {
    outcome = await createInvoice(ownerId, form);
  }
  return data(outcome, { status: getCreateStatus(outcome), headers });
}

// Null when missing or not a UUID.
function readPostedClientId(form: FormData | null): string | null {
  const posted = form?.get(INVOICE_FIELD.clientId);
  return typeof posted === "string" && UUID_PATTERN.test(posted)
    ? posted
    : null;
}

async function createInvoice(
  clientId: string,
  form: FormData | null,
): Promise<CreateInvoiceOutcome> {
  try {
    return toOutcome(
      await invoices.createInvoice(clientId, readInvoiceDraft(form)),
    );
  } catch (error) {
    // Name and code only: a driver error's message lists its parameters.
    console.error(
      `admin: creating an Invoice failed (${describeError(error)})`,
      { clientId },
    );
    return { kind: "failed" };
  }
}

function toOutcome(
  result: Awaited<ReturnType<Invoices["createInvoice"]>>,
): CreateInvoiceOutcome {
  if (result.error === null) {
    return {
      kind: "created",
      invoiceId: result.value.id,
      number: result.value.number,
    };
  }

  return result.error === "invalid"
    ? { kind: "invalid", fieldErrors: result.fieldErrors }
    : { kind: "refused", error: result.error };
}
