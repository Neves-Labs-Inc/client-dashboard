import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/button";
import FormError from "@/components/ui/form-error";
import IconButton from "@/components/ui/icon-button";
import Input from "@/components/ui/input";
import Money from "@/components/ui/money";
import type { InvoiceForm } from "@/hooks/use-invoice-form";
import { INVOICE_FIELD, INVOICES_COPY } from "@/lib/admin-invoices";

// Description | Amount | remove, at every width.
const LINE_GRID_CLASS = "grid grid-cols-[minmax(0,1fr)_8rem_auto] gap-2";
// The remove button's size, held when it isn't rendered.
const REMOVE_TRACK_CLASS = "w-11 md:w-8 pointer-coarse:w-11";
const MICRO_LABEL_CLASS =
  "text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase";

type InvoiceLineItemsFieldProps = {
  form: InvoiceForm;
  // Prefixes the error ids, unique per drawer.
  idPrefix: string;
};

function getErrorId(idPrefix: string, key: string): string {
  return `${idPrefix}-${key.replaceAll(".", "-")}-error`;
}

// The Line Items repeater: one row per line, "+ Add line" up to the cap,
// then the live Total. Line errors sit under their row, linked to their
// input.
export default function InvoiceLineItemsField({
  form,
  idPrefix,
}: InvoiceLineItemsFieldProps): React.ReactNode {
  const { values, fieldErrors } = form;
  const canRemove = values.lines.length > 1;
  const countError = fieldErrors.lineItems;
  const totalError = fieldErrors.total;

  return (
    <>
      <fieldset
        data-field="lineItems"
        tabIndex={-1}
        aria-describedby={
          countError ? getErrorId(idPrefix, "lineItems") : undefined
        }
        className="flex min-w-0 flex-col gap-2 outline-hidden"
      >
        <legend className="mb-1.5 text-[13px]/[18px] font-semibold text-fg">
          {INVOICES_COPY.lineItems}
        </legend>
        <div aria-hidden="true" className={LINE_GRID_CLASS}>
          <span className={MICRO_LABEL_CLASS}>{INVOICES_COPY.description}</span>
          <span className={`${MICRO_LABEL_CLASS} text-right`}>
            {INVOICES_COPY.amount}
          </span>
          <span className={REMOVE_TRACK_CLASS} />
        </div>
        {values.lines.map((line, index) => {
          const descriptionKey = `lineItems.${index}.description`;
          const amountKey = `lineItems.${index}.amount`;
          const descriptionError = fieldErrors[descriptionKey];
          const amountError = fieldErrors[amountKey];
          const lineNumber = index + 1;
          return (
            <div
              key={line.key}
              role="group"
              aria-label={`Line ${lineNumber}`}
              className={`${LINE_GRID_CLASS} items-start`}
            >
              <Input
                data-field={descriptionKey}
                data-autofocus={index === 0 || undefined}
                aria-label={INVOICES_COPY.description}
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={
                  descriptionError
                    ? getErrorId(idPrefix, descriptionKey)
                    : undefined
                }
                name={INVOICE_FIELD.description}
                value={line.description}
                onChange={form.handleLineChange(index, "description")}
                onBlur={form.handleBlur(descriptionKey)}
                autoComplete="off"
              />
              <Input
                data-field={amountKey}
                aria-label={INVOICES_COPY.amount}
                aria-invalid={amountError ? true : undefined}
                aria-describedby={
                  amountError ? getErrorId(idPrefix, amountKey) : undefined
                }
                name={INVOICE_FIELD.amount}
                value={line.amount}
                onChange={form.handleLineChange(index, "amount")}
                onBlur={form.handleBlur(amountKey)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                className="text-right font-mono tabular-nums"
              />
              {canRemove ? (
                <IconButton
                  label={`Remove line ${lineNumber}`}
                  icon={Trash2}
                  className="self-start"
                  onClick={() => form.handleRemoveLine(index)}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="size-11 md:size-8 pointer-coarse:size-11"
                />
              )}
              {(descriptionError || amountError) && (
                <div className="col-span-3 -mt-1.5">
                  {descriptionError && (
                    <FormError id={getErrorId(idPrefix, descriptionKey)}>
                      {descriptionError}
                    </FormError>
                  )}
                  {amountError && (
                    <FormError id={getErrorId(idPrefix, amountKey)}>
                      {amountError}
                    </FormError>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {form.canAddLine ? (
          <Button
            icon={Plus}
            className="self-start"
            onClick={form.handleAddLine}
          >
            {INVOICES_COPY.addLine}
          </Button>
        ) : (
          <p className="text-[13px]/5 text-fg-2">{INVOICES_COPY.linesMax}</p>
        )}
        {countError && (
          <FormError id={getErrorId(idPrefix, "lineItems")}>
            {countError}
          </FormError>
        )}
      </fieldset>
      <div className="flex flex-col">
        {/* A focus target for a total error on submit; its right edge lines
            up with the amounts (remove track + gap). */}
        <div
          data-field="total"
          tabIndex={-1}
          aria-describedby={
            totalError ? getErrorId(idPrefix, "total") : undefined
          }
          className="flex items-baseline justify-between gap-3 border-t border-line pt-3 pr-13 outline-hidden md:pr-10 pointer-coarse:pr-13"
        >
          <span className="text-[13px]/5 font-semibold text-fg">
            {INVOICES_COPY.total}
          </span>
          <Money
            cents={form.totalCents}
            className="text-sm/5 font-medium text-fg"
          />
        </div>
        {totalError && (
          <FormError id={getErrorId(idPrefix, "total")}>{totalError}</FormError>
        )}
      </div>
    </>
  );
}
