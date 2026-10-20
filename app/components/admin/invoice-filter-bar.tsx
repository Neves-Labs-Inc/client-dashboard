import { Form } from "react-router";
import ClearInvoiceFiltersLink from "@/components/admin/clear-invoice-filters-link";
import InvoiceIssuedFilter from "@/components/admin/invoice-issued-filter";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { useInvoiceFilterForm } from "@/hooks/use-invoice-filter-form";
import {
  hasInvoiceListFilter,
  INVOICE_FILTER_COPY,
  INVOICE_FILTER_PARAM,
  type InvoiceListForm,
  type StatusChoice,
} from "@/lib/admin-invoice-filter";
import { INVOICES_PATH, type InvoiceClientOptions } from "@/lib/admin-invoices";
import { NUMBER_QUERY_MAX } from "@/lib/invoices/invoice-rules";

type InvoiceFilterBarProps = {
  // The filter the list shows.
  form: InvoiceListForm;
  // The status tab shown: the applied one, or one still loading.
  status: StatusChoice;
  clients: InvoiceClientOptions;
  years: number[];
  rangeError: string | null;
};

// One GET form: the selects apply on change, the number and dates on Enter
// or Apply. With JS it navigates to a clean URL; without, the raw GET
// still works (the parser ignores empty values).
export default function InvoiceFilterBar({
  form,
  status,
  clients,
  years,
  rangeError,
}: InvoiceFilterBarProps): React.ReactNode {
  const { draft, setDraft, apply } = useInvoiceFilterForm(form, status);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    apply();
  }

  return (
    <Form
      method="get"
      action={INVOICES_PATH}
      role="search"
      aria-label={INVOICE_FILTER_COPY.filtersLabel}
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-x-3 gap-y-4 md:flex md:flex-wrap md:items-start md:gap-x-3 md:gap-y-3"
    >
      <input type="hidden" name={INVOICE_FILTER_PARAM.status} value={status} />
      <div className="min-w-0 md:w-48">
        <Field label={INVOICE_FILTER_COPY.client}>
          {(control) => (
            <Select
              {...control}
              name={INVOICE_FILTER_PARAM.client}
              value={draft.clientId ?? ""}
              onChange={(event) =>
                apply({ clientId: event.target.value || null })
              }
            >
              <option value="">{INVOICE_FILTER_COPY.allClients}</option>
              {clients.active.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
              {clients.archived.length > 0 && (
                <optgroup label={INVOICE_FILTER_COPY.archivedGroup}>
                  {clients.archived.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          )}
        </Field>
      </div>
      <InvoiceIssuedFilter
        draft={draft}
        years={years}
        rangeError={rangeError}
        setDraft={setDraft}
        apply={apply}
      />
      <div className="col-span-2 min-w-0 md:w-56">
        <Field label={INVOICE_FILTER_COPY.number}>
          {(control) => (
            <div className="flex gap-2">
              <Input
                {...control}
                type="search"
                name={INVOICE_FILTER_PARAM.q}
                value={draft.q}
                onChange={(event) => setDraft({ q: event.target.value })}
                maxLength={NUMBER_QUERY_MAX}
                placeholder={INVOICE_FILTER_COPY.numberPlaceholder}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className="min-w-0 flex-1 font-mono tabular-nums"
              />
              <Button
                type="submit"
                variant="secondary"
                className="shrink-0 md:h-9"
              >
                {INVOICE_FILTER_COPY.apply}
              </Button>
            </div>
          )}
        </Field>
      </div>
      {hasInvoiceListFilter(form) && (
        <ClearInvoiceFiltersLink className="col-span-2 justify-self-start md:mt-6" />
      )}
    </Form>
  );
}
