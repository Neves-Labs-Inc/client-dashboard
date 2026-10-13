import { useId } from "react";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import { useCreateClientForm } from "@/hooks/use-create-client-form";

const DIRTY_CONFIRM = {
  message: "Discard this Client?",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

type CreateClientDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CreateClientDrawer({
  open,
  onOpenChange,
}: CreateClientDrawerProps): React.ReactNode {
  const formId = useId();
  const form = useCreateClientForm(open);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New client"
      error={form.banner}
      isDirty={form.isDirty && !form.isCreated}
      dirtyConfirm={DIRTY_CONFIRM}
      shouldReturnFocus={!form.isCreated}
      footer={({ requestClose }) => (
        <>
          <Button onClick={requestClose}>Cancel</Button>
          <Button
            ref={form.submitRef}
            variant="primary"
            type="submit"
            form={formId}
            isPending={form.isPending}
            pendingLabel="Creating…"
          >
            Create client
          </Button>
        </>
      )}
    >
      {/* No maxLength: a 101-character paste must reach the error. */}
      <form id={formId} noValidate onSubmit={form.handleSubmit}>
        <Field label="Name" error={form.fieldError ?? undefined}>
          {(control) => (
            <Input
              {...control}
              ref={form.inputRef}
              name="name"
              value={form.name}
              onChange={form.handleChange}
              onBlur={form.handleBlur}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
            />
          )}
        </Field>
      </form>
    </Drawer>
  );
}
