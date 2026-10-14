import { useId } from "react";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import { useInviteForm } from "@/hooks/use-invite-form";
import type { InviteFeedback, RefusalCode } from "@/lib/team-invitations";

const DIRTY_CONFIRM = {
  message: "Discard this invitation?",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
};

type InviteDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // Under the field: who the invitee joins, and as what.
  help: string;
  // The route the invite posts to.
  action: string;
  // Words a refused invite for this surface. Stable (module-level).
  getFeedback: (error: RefusalCode) => InviteFeedback;
  onSent: (invitationId: string) => void;
  // Where focus goes when the drawer closes.
  getReturnFocusTarget: () => HTMLElement | null;
};

// The invite-by-email drawer, shared by the Admin's "Invite first Owner"
// and an Owner's "Invite teammate".
export default function InviteDrawer({
  open,
  onOpenChange,
  title,
  help,
  action,
  getFeedback,
  onSent,
  getReturnFocusTarget,
}: InviteDrawerProps): React.ReactNode {
  const formId = useId();
  const helpId = useId();
  const form = useInviteForm(open, action, getFeedback, onSent);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
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
        {help}
      </p>
    </Drawer>
  );
}
