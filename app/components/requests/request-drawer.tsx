import { useId } from "react";
import {
  REQUEST_KIND_LABEL,
  RequestKindGlyph,
} from "@/components/requests/request-kind";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import RadioCardGroup from "@/components/ui/radio-card-group";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import {
  type RequestFormValues,
  useRequestForm,
} from "@/hooks/use-request-form";
import { REQUEST_COPY, REQUEST_FIELD } from "@/lib/request-outcome";
import type { RequestKind } from "@/lib/requests/request-rules";
import type { ProjectOption } from "@/lib/requests/requests";
import { cn } from "@/lib/utils";

const DIRTY_CONFIRM = {
  message: "Discard this request?",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

const KIND_OPTIONS = (["BUG", "FEATURE"] satisfies RequestKind[]).map(
  (kind) => ({
    value: kind,
    label: REQUEST_KIND_LABEL[kind],
    icon: <RequestKindGlyph kind={kind} />,
  }),
);

// The look of a disabled button (§9.11), for a primary that can't submit
// any more but must keep focus.
const LOCKED_CLASS =
  "cursor-not-allowed border-line bg-surface-2 text-fg-2 not-disabled:not-aria-busy:hover:border-line not-disabled:not-aria-busy:hover:bg-surface-2";

const MODE_COPY = {
  new: {
    title: "New request",
    submit: "Submit request",
    pending: REQUEST_COPY.submitting,
  },
  edit: {
    title: "Edit request",
    submit: "Save changes",
    pending: REQUEST_COPY.saving,
  },
} as const;

type RequestDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "new" | "edit";
  initial: RequestFormValues;
  // Active A–Z, then Past A–Z.
  projectOptions: ProjectOption[];
  clientName: string;
  // The route the form posts to.
  action: string;
  onSaved: (requestId: string) => void;
  onNoLongerNew?: () => void;
  // Where focus goes when the drawer closes.
  getReturnFocusTarget?: () => HTMLElement | null;
};

// DESIGN §9.10: the new-Request drawer, and the same drawer for editing a
// New Request.
export default function RequestDrawer({
  open,
  onOpenChange,
  mode,
  initial,
  projectOptions,
  clientName,
  action,
  onSaved,
  onNoLongerNew,
  getReturnFocusTarget,
}: RequestDrawerProps): React.ReactNode {
  const formId = useId();
  const helpId = useId();
  const form = useRequestForm({
    isOpen: open,
    mode,
    initial,
    projectIds: projectOptions.map((project) => project.id),
    action,
    onSaved,
    onNoLongerNew,
  });
  const copy = MODE_COPY[mode];
  const { values, fieldErrors, fieldRefs } = form;
  const activeProjects = projectOptions.filter((project) => !project.isPast);
  const pastProjects = projectOptions.filter((project) => project.isPast);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
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
            pendingLabel={copy.pending}
            aria-disabled={form.isLocked || form.isPending || undefined}
            className={cn(form.isLocked && LOCKED_CLASS)}
          >
            {copy.submit}
          </Button>
        </>
      )}
    >
      {/* No maxLength: an over-long paste must reach the error, whole. */}
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit}
        aria-describedby={helpId}
        className="flex flex-col gap-4"
      >
        <RadioCardGroup
          legend="Kind"
          name={REQUEST_FIELD.kind}
          value={values.kind}
          options={KIND_OPTIONS}
          onChange={form.handleKindChange}
        />
        <Field label="Title" error={fieldErrors.title}>
          {(control) => (
            <Input
              {...control}
              ref={fieldRefs.title}
              name={REQUEST_FIELD.title}
              value={values.title}
              onChange={form.handleChange("title")}
              onBlur={form.handleBlur("title")}
              placeholder="e.g. Receipt PDF is missing the store address"
              autoComplete="off"
            />
          )}
        </Field>
        <Field label="Description" error={fieldErrors.description}>
          {(control) => (
            <Textarea
              {...control}
              ref={fieldRefs.description}
              name={REQUEST_FIELD.description}
              value={values.description}
              onChange={form.handleChange("description")}
              onBlur={form.handleBlur("description")}
              placeholder="What happened, or what would you like? Steps help."
            />
          )}
        </Field>
        <Field label="Project" isOptional error={fieldErrors.projectId}>
          {(control) => (
            <Select
              {...control}
              ref={fieldRefs.projectId}
              name={REQUEST_FIELD.projectId}
              value={values.projectId}
              onChange={form.handleChange("projectId")}
              onBlur={form.handleBlur("projectId")}
            >
              <option value="">No specific project</option>
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
      </form>
      <p id={helpId} className="text-[13px]/5 text-fg-2">
        Everyone at {clientName} can see Requests.
      </p>
    </Drawer>
  );
}
