import { useId } from "react";
import Field from "@/components/ui/field";
import FormError from "@/components/ui/form-error";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import {
  INVOICE_FILTER_COPY,
  INVOICE_FILTER_PARAM,
  type IssuedChoice,
  type InvoiceListForm,
} from "@/lib/admin-invoice-filter";

const ANY_TIME_VALUE = "";
const CUSTOM_RANGE: IssuedChoice = "custom";

type InvoiceIssuedFilterProps = {
  draft: InvoiceListForm;
  years: number[];
  rangeError: string | null;
  setDraft: (patch: Partial<InvoiceListForm>) => void;
  apply: (patch?: Partial<InvoiceListForm>) => void;
};

// The Issued select, and the From/To range under it while it reads Custom
// range. Two items of the filter bar's grid.
export default function InvoiceIssuedFilter({
  draft,
  years,
  rangeError,
  setDraft,
  apply,
}: InvoiceIssuedFilterProps): React.ReactNode {
  const rangeErrorId = useId();
  const isCustom = draft.issued === CUSTOM_RANGE;
  const dateErrorProps =
    rangeError === null
      ? {}
      : { "aria-invalid": true, "aria-describedby": rangeErrorId };

  function handleIssuedChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void {
    const { value } = event.target;
    // The values are the options rendered here.
    const issued = (value === ANY_TIME_VALUE ? "any" : value) as IssuedChoice;
    apply({ issued });
  }

  return (
    <>
      <div className="min-w-0 md:w-36">
        <Field label={INVOICE_FILTER_COPY.issued}>
          {(control) => (
            <Select
              {...control}
              name={INVOICE_FILTER_PARAM.issued}
              value={draft.issued === "any" ? ANY_TIME_VALUE : draft.issued}
              onChange={handleIssuedChange}
            >
              <option value={ANY_TIME_VALUE}>
                {INVOICE_FILTER_COPY.anyTime}
              </option>
              {years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
              <option value={CUSTOM_RANGE}>
                {INVOICE_FILTER_COPY.customRange}
              </option>
            </Select>
          )}
        </Field>
      </div>
      {isCustom && (
        <fieldset className="col-span-2 min-w-0 md:w-80">
          <legend className="sr-only">{INVOICE_FILTER_COPY.rangeLabel}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={INVOICE_FILTER_COPY.from}>
              {(control) => (
                <Input
                  {...control}
                  {...dateErrorProps}
                  type="date"
                  name={INVOICE_FILTER_PARAM.from}
                  value={draft.from}
                  onChange={(event) => setDraft({ from: event.target.value })}
                />
              )}
            </Field>
            <Field label={INVOICE_FILTER_COPY.to}>
              {(control) => (
                <Input
                  {...control}
                  {...dateErrorProps}
                  type="date"
                  name={INVOICE_FILTER_PARAM.to}
                  value={draft.to}
                  onChange={(event) => setDraft({ to: event.target.value })}
                />
              )}
            </Field>
          </div>
          {rangeError !== null && (
            <FormError id={rangeErrorId}>{rangeError}</FormError>
          )}
        </fieldset>
      )}
    </>
  );
}
