import { useState } from "react";
import { useNavigate } from "react-router";
import {
  getFilterBarSearch,
  type InvoiceListForm,
  type StatusChoice,
  syncInvoiceDraft,
  toInvoiceListSearch,
} from "@/lib/admin-invoice-filter";
import { INVOICES_PATH } from "@/lib/admin-invoices";

type InvoiceFilterForm = {
  // What the controls show: the applied filter, plus anything typed and not
  // yet applied.
  draft: InvoiceListForm;
  setDraft: (patch: Partial<InvoiceListForm>) => void;
  // Navigates to the list for the draft with this patch, on the status tab
  // shown.
  apply: (patch?: Partial<InvoiceListForm>) => void;
};

// The filter bar's controls. They start from the applied filter and follow
// it when the URL changes, without remounting, so the control in use keeps
// focus. `status` is the tab shown, so a tab switch still loading isn't
// lost when a select changes.
export function useInvoiceFilterForm(
  applied: InvoiceListForm,
  status: StatusChoice,
): InvoiceFilterForm {
  const navigate = useNavigate();
  const [state, setState] = useState(() => ({
    draft: applied,
    seededSearch: toInvoiceListSearch(applied),
  }));
  const synced = syncInvoiceDraft(state, applied);
  if (synced !== state) setState(synced);

  function setDraft(patch: Partial<InvoiceListForm>): void {
    setState((current) => ({
      ...current,
      draft: { ...current.draft, ...patch },
    }));
  }

  function apply(patch: Partial<InvoiceListForm> = {}): void {
    setDraft(patch);
    const search = getFilterBarSearch(synced.draft, patch, status);
    void navigate(`${INVOICES_PATH}${search}`, { preventScrollReset: true });
  }

  return { draft: synced.draft, setDraft, apply };
}
