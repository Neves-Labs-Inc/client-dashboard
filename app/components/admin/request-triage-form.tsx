import { REQUEST_STATUS_LABEL } from "@/components/requests/request-status";
import Button from "@/components/ui/button";
import Field from "@/components/ui/field";
import Select from "@/components/ui/select";
import Textarea from "@/components/ui/textarea";
import type { RequestTriageForm as TriageForm } from "@/hooks/use-request-triage-form";
import { REQUESTS_COPY, TRIAGE_STATUSES } from "@/lib/admin-requests";
import type { TaskOptionGroup } from "@/lib/requests/request-rules";

type RequestTriageFormProps = {
  form: TriageForm;
  // Null when they couldn't load: the select keeps the current link only.
  taskOptions: TaskOptionGroup[] | null;
  // The current link, for the select when the options failed.
  currentTask: { id: string; title: string } | null;
};

const ENTER_CLASS =
  "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

// Status, then the Task select it controls (Accepted or Done only), then
// the note, and one Save.
export default function RequestTriageForm({
  form,
  taskOptions,
  currentTask,
}: RequestTriageFormProps): React.ReactNode {
  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit}
      className="flex flex-col gap-4"
    >
      <Field label={REQUESTS_COPY.status}>
        {(control) => (
          <Select
            {...control}
            name="status"
            value={form.status}
            onChange={form.handleStatusChange}
          >
            {TRIAGE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {REQUEST_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {form.isTaskShown && (
        <div className={ENTER_CLASS}>
          <LinkedTaskField
            form={form}
            taskOptions={taskOptions}
            currentTask={currentTask}
          />
        </div>
      )}
      <Field
        label={REQUESTS_COPY.responseNote}
        isOptional
        help={REQUESTS_COPY.noteHelp}
        error={form.noteError ?? undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            ref={form.noteRef}
            name="responseNote"
            value={form.note}
            onChange={form.handleNoteChange}
            onBlur={form.handleNoteBlur}
          />
        )}
      </Field>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          isPending={form.isSaving}
          pendingLabel={REQUESTS_COPY.saving}
        >
          {REQUESTS_COPY.save}
        </Button>
      </div>
    </form>
  );
}

function LinkedTaskField({
  form,
  taskOptions,
  currentTask,
}: RequestTriageFormProps): React.ReactNode {
  let help: string | undefined;
  if (taskOptions === null) {
    help = REQUESTS_COPY.tasksFailedHelp;
  } else if (taskOptions.length === 0) {
    help = REQUESTS_COPY.noTasksHelp;
  }

  return (
    <Field label={REQUESTS_COPY.linkedTask} isOptional help={help}>
      {(control) =>
        taskOptions === null ? (
          // Disabled, so the save keeps the current link (the hook sends
          // it).
          <Select {...control} value={currentTask?.id ?? ""} disabled>
            <option value={currentTask?.id ?? ""}>
              {currentTask?.title ?? REQUESTS_COPY.noTask}
            </option>
          </Select>
        ) : (
          <Select
            {...control}
            name="taskId"
            value={form.taskId}
            onChange={form.handleTaskChange}
          >
            <option value="">{REQUESTS_COPY.noTask}</option>
            {taskOptions.map((group) => (
              <optgroup key={group.projectId} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )
      }
    </Field>
  );
}
