import { useId } from "react";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import { useInviteOwnerForm } from "@/hooks/use-invite-owner-form";

const DIRTY_CONFIRM = {
  message: "Discard this invitation?",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

type InviteOwnerDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onSent: (invitationId: string) => void;
  // Where focus goes when the drawer closes.
  getReturnFocusTarget: () => HTMLElement | null;
};

export default function InviteOwnerDrawer({
  open,
  onOpenChange,
  clientId,
  clientName,
  onSent,
  getReturnFocusTarget,
}: InviteOwnerDrawerProps): React.ReactNode {
  const formId = useId();
  const helpId = useId();
  const form = useInviteOwnerForm(open, clientId, onSent);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Invite first Owner"
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
            pendingLabel="Sending…"
          >
            Send invitation
          </Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={form.handleSubmit}>
        <Field label="Email" error={form.fieldError ?? undefined}>
          {(control) => (
            <Input
              {...control}
              aria-describedby={[control["aria-describedby"], helpId]
                .filter(Boolean)
                .join(" ")}
              ref={form.inputRef}
              type="email"
              name="email"
              value={form.email}
              onChange={form.handleChange}
              onBlur={form.handleBlur}
              placeholder="name@company.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
      </form>
      <p id={helpId} className="text-sm/5 text-fg-2">
        They&apos;ll join {clientName} as its Owner. The invitation expires in 7
        days.
      </p>
    </Drawer>
  );
}
