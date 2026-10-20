import { Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import { useLocation, useSearchParams } from "react-router";
import AdminInvoicesPanel from "@/components/admin/admin-invoices-panel";
import ClearInvoiceFiltersLink from "@/components/admin/clear-invoice-filters-link";
import InvoiceDrawer from "@/components/admin/invoice-drawer";
import InvoiceFilterBar from "@/components/admin/invoice-filter-bar";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
import { useRowHighlight } from "@/hooks/use-row-highlight";
import { useSwitchingSearch } from "@/hooks/use-switching-search";
import {
  hasInvoiceListFilter,
  INVOICE_FILTER_COPY,
  type InvoiceListForm,
  parseInvoiceListFilter,
  type StatusChoice,
  toInvoiceListSearch,
} from "@/lib/admin-invoice-filter";
import {
  getInvoicePath,
  getIssuedToast,
  getListMeta,
  type InvoiceClientOptions,
  INVOICES_COPY,
  INVOICES_PATH,
  NEW_INVOICE_PARAM,
  NEW_INVOICE_VALUE,
  toFromListState,
} from "@/lib/admin-invoices";
import type { AdminInvoiceRow } from "@/lib/invoices/invoices";
import type { ProjectOption } from "@/lib/requests/requests";
import { toast } from "@/lib/toast";

const STATUS_TABS: { status: StatusChoice; label: string }[] = [
  { status: "all", label: INVOICE_FILTER_COPY.filterAll },
  { status: "open", label: INVOICE_FILTER_COPY.filterOpen },
  { status: "overdue", label: INVOICE_FILTER_COPY.filterOverdue },
  { status: "paid", label: INVOICE_FILTER_COPY.filterPaid },
  { status: "void", label: INVOICE_FILTER_COPY.filterVoid },
];

type InvoicesListViewProps = {
  // Null when they couldn't load.
  clients: InvoiceClientOptions | null;
  // Null when they couldn't load.
  years: number[] | null;
  // The filter applied, as the controls show it.
  form: InvoiceListForm;
  rangeError: string | null;
  // Null when they couldn't load.
  rows: AdminInvoiceRow[] | null;
  // The New invoice drawer's Projects by active Client; null when they
  // couldn't load.
  projectOptionsByClient: Record<string, ProjectOption[]> | null;
  // The New York date: the drawer's default issue date.
  today: string;
};

// Every Client's Invoices, Void and archived Clients included, filtered by
// the URL.
export default function InvoicesListView({
  clients,
  years,
  form,
  rangeError,
  rows,
  projectOptionsByClient,
  today,
}: InvoicesListViewProps): React.ReactNode {
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const { highlightedId, highlight } = useRowHighlight(null);
  const isDrawerOpen =
    searchParams.get(NEW_INVOICE_PARAM) === NEW_INVOICE_VALUE;
  // The drawer starts on the filter's Client when it can take an Invoice.
  const isFilterActive = (clients?.active ?? []).some(
    (client) => client.id === form.clientId,
  );
  const initialClientId = isFilterActive ? (form.clientId ?? "") : "";
  const switchingSearch = useSwitchingSearch();
  // The tab being loaded shows current at once. Its status needs no
  // options to parse.
  const shownStatus =
    switchingSearch === null
      ? form.status
      : parseInvoiceListFilter(new URLSearchParams(switchingSearch), {
          clientIds: [],
          years: [],
        }).form.status;
  const isFiltered = hasInvoiceListFilter(form);

  const closeDrawer = useCallback((): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(NEW_INVOICE_PARAM);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [setSearchParams]);

  // The list behind has revalidated: the row shows when the filters keep it.
  const handleCreated = useCallback(
    (invoiceId: string, number: string): void => {
      closeDrawer();
      toast(getIssuedToast(number));
      highlight(invoiceId);
    },
    [closeDrawer, highlight],
  );

  function handleOpenDrawer(): void {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(NEW_INVOICE_PARAM, NEW_INVOICE_VALUE);
        return next;
      },
      { preventScrollReset: true },
    );
  }

  function handleOpenChange(open: boolean): void {
    if (!open) closeDrawer();
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: INVOICES_COPY.invoices }]}
        title={INVOICES_COPY.invoices}
        action={
          <Button
            ref={newButtonRef}
            variant="primary"
            icon={Plus}
            className="whitespace-nowrap"
            onClick={handleOpenDrawer}
          >
            {INVOICES_COPY.newInvoice}
          </Button>
        }
      />
      <TabNav
        label={INVOICE_FILTER_COPY.statusLabel}
        items={STATUS_TABS.map(({ status, label }) => ({
          label,
          to: `${INVOICES_PATH}${toInvoiceListSearch({ ...form, status })}`,
          current: shownStatus === status,
        }))}
      />
      <InvoiceFilterBar
        form={form}
        status={shownStatus}
        clients={clients}
        years={years}
        rangeError={rangeError}
      />
      <AdminInvoicesPanel
        invoices={rows}
        getHref={getInvoicePath}
        highlightedId={highlightedId}
        hasClient
        getMeta={getListMeta}
        emptyCopy={isFiltered ? INVOICE_FILTER_COPY.noMatches : undefined}
        emptyAction={isFiltered ? <ClearInvoiceFiltersLink /> : undefined}
        isLoading={switchingSearch !== null}
        linkState={toFromListState(search)}
      />
      <InvoiceDrawer
        open={isDrawerOpen}
        onOpenChange={handleOpenChange}
        today={today}
        clientSelect={{
          clients: clients?.active ?? null,
          initialClientId,
          projectOptionsByClient,
        }}
        action={INVOICES_PATH}
        onCreated={handleCreated}
        getReturnFocusTarget={() => newButtonRef.current}
      />
    </>
  );
}
