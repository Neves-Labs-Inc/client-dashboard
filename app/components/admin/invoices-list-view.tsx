import { useLocation } from "react-router";
import AdminInvoicesPanel from "@/components/admin/admin-invoices-panel";
import ClearInvoiceFiltersLink from "@/components/admin/clear-invoice-filters-link";
import InvoiceFilterBar from "@/components/admin/invoice-filter-bar";
import PageHeader from "@/components/ui/page-header";
import TabNav from "@/components/ui/tab-nav";
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
  getListMeta,
  type InvoiceClientOptions,
  INVOICES_COPY,
  INVOICES_PATH,
  toFromListState,
} from "@/lib/admin-invoices";
import type { AdminInvoiceRow } from "@/lib/invoices/invoices";

const STATUS_TABS: { status: StatusChoice; label: string }[] = [
  { status: "all", label: INVOICE_FILTER_COPY.filterAll },
  { status: "open", label: INVOICE_FILTER_COPY.filterOpen },
  { status: "overdue", label: INVOICE_FILTER_COPY.filterOverdue },
  { status: "paid", label: INVOICE_FILTER_COPY.filterPaid },
  { status: "void", label: INVOICE_FILTER_COPY.filterVoid },
];

type InvoicesListViewProps = {
  clients: InvoiceClientOptions;
  years: number[];
  // The filter applied, as the controls show it.
  form: InvoiceListForm;
  rangeError: string | null;
  // Null when they couldn't load.
  rows: AdminInvoiceRow[] | null;
};

// Every Client's Invoices, Void and archived Clients included, filtered by
// the URL.
export default function InvoicesListView({
  clients,
  years,
  form,
  rangeError,
  rows,
}: InvoicesListViewProps): React.ReactNode {
  const { search } = useLocation();
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

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: INVOICES_COPY.invoices }]}
        title={INVOICES_COPY.invoices}
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
        highlightedId={null}
        hasClient
        getMeta={getListMeta}
        emptyCopy={isFiltered ? INVOICE_FILTER_COPY.noMatches : undefined}
        emptyAction={isFiltered ? <ClearInvoiceFiltersLink /> : undefined}
        isLoading={switchingSearch !== null}
        linkState={toFromListState(search)}
      />
    </>
  );
}
