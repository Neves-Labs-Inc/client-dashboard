import { useId } from "react";
import InvoiceLineItemsField from "@/components/admin/invoice-line-items-field";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import { useInvoiceForm } from "@/hooks/use-invoice-form";
import { INVOICE_FIELD, INVOICES_COPY } from "@/lib/admin-invoices";
import type { ProjectOption } from "@/lib/requests/requests";
import { cn } from "@/lib/utils";

const DIRTY_CONFIRM = {
  message: INVOICES_COPY.discard,
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

// The look of a disabled button (§9.11), for a primary that can't submit
// any more but must keep focus.
const LOCKED_CLASS =
  "cursor-not-allowed border-line bg-surface-2 text-fg-2 not-disabled:not-aria-busy:hover:border-line not-disabled:not-aria-busy:hover:bg-surface-2";

type InvoiceDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The New York date: the default issue date.
  today: string;
  // Active A–Z, then Past A–Z; null when they couldn't load.
  projectOptions: ProjectOption[] | null;
  // The route the form posts to.
  action: string;
  onCreated: (invoiceId: string, number: string) => void;
  // Where focus goes when the drawer closes.
  getReturnFocusTarget?: () => HTMLElement | null;
};

// DESIGN §9.10: the Admin's New invoice drawer. The number is assigned on
// the server.
export default function InvoiceDrawer({
  open,
  onOpenChange,
  today,
  projectOptions,
  action,
  onCreated,
  getReturnFocusTarget,
}: InvoiceDrawerProps): React.ReactNode {
  const formId = useId();
  const helpId = useId();
  const options = projectOptions ?? [];
  const form = useInvoiceForm({
    isOpen: open,
    today,
    projectIds: options.map((project) => project.id),
    action,
    onCreated,
  });
  const { values, fieldErrors } = form;
  const activeProjects = options.filter((project) => !project.isPast);
  const pastProjects = options.filter((project) => project.isPast);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={INVOICES_COPY.drawerTitle}
      error={form.banner}
      isDirty={form.isDirty}
      dirtyConfirm={DIRTY_CONFIRM}
      getReturnFocusTarget={getReturnFocusTarget}
      footer={({ requestClose }) => (
        <>
          <Button onClick={requestClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            isPending={form.isPending}
            pendingLabel={INVOICES_COPY.issuing}
            aria-disabled={form.isLocked || form.isPending || undefined}
            className={cn(form.isLocked && LOCKED_CLASS)}
          >
            {INVOICES_COPY.issue}
          </Button>
        </>
      )}
    >
      {/* No maxLength: an over-long paste must reach the error, whole. The
          date bounds are picker hints only. */}
      <form
        ref={form.formRef}
        id={formId}
        noValidate
        onSubmit={form.handleSubmit}
        aria-describedby={helpId}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={INVOICES_COPY.issueDate} error={fieldErrors.issueDate}>
            {(control) => (
              <Input
                {...control}
                data-field="issueDate"
                type="date"
                name={INVOICE_FIELD.issueDate}
                value={values.issueDate}
                max={today}
                onChange={form.handleChange("issueDate")}
                onBlur={form.handleBlur("issueDate")}
              />
            )}
          </Field>
          <Field label={INVOICES_COPY.dueDate} error={fieldErrors.dueDate}>
            {(control) => (
              <Input
                {...control}
                data-field="dueDate"
                type="date"
                name={INVOICE_FIELD.dueDate}
                value={values.dueDate}
                min={values.issueDate || undefined}
                onChange={form.handleChange("dueDate")}
                onBlur={form.handleBlur("dueDate")}
              />
            )}
          </Field>
        </div>
        <Field
          label={INVOICES_COPY.project}
          isOptional
          help={
            projectOptions === null ? INVOICES_COPY.projectsFailed : undefined
          }
          error={fieldErrors.projectId}
        >
          {(control) => (
            <Select
              {...control}
              data-field="projectId"
              name={INVOICE_FIELD.projectId}
              value={values.projectId}
              onChange={form.handleChange("projectId")}
              onBlur={form.handleBlur("projectId")}
            >
              <option value="">{INVOICES_COPY.noProject}</option>
              {activeProjects.length > 0 && (
                <optgroup label="Active">
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {pastProjects.length > 0 && (
                <optgroup label="Past">
                  {pastProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          )}
        </Field>
        <InvoiceLineItemsField form={form} idPrefix={formId} />
        <Field label={INVOICES_COPY.memo} isOptional error={fieldErrors.memo}>
          {(control) => (
            <Textarea
              {...control}
              data-field="memo"
              name={INVOICE_FIELD.memo}
              value={values.memo}
              onChange={form.handleChange("memo")}
              onBlur={form.handleBlur("memo")}
            />
          )}
        </Field>
      </form>
      <p id={helpId} className="text-[13px]/5 text-fg-2">
        {INVOICES_COPY.help}
      </p>
    </Drawer>
  );
}
