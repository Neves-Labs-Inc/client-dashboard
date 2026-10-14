import { LogOut } from "lucide-react";
import { useId } from "react";
import PanelNotice from "@/components/team/panel-notice";
import Button from "@/components/ui/button";
import Panel from "@/components/ui/panel";
import { useLeaveClient } from "@/hooks/use-leave-client";
import type { Profile } from "@/lib/auth/auth";
import { getLeaveLabel, getLeavePrompt, PROFILE_COPY } from "@/lib/profile";

type ProfileLeavePanelProps = {
  clientName: string;
  canLeave: Profile["canLeave"];
};

// A label that outgrows the button truncates; the full name is in the
// Details row and the confirm's prompt.
const TRUNCATING_BUTTON = "max-w-full self-start *:min-w-0 *:*:min-w-0";

export default function ProfileLeavePanel({
  clientName,
  canLeave,
}: ProfileLeavePanelProps): React.ReactNode {
  const leave = useLeaveClient(clientName);
  const helpId = useId();
  const promptId = useId();
  const label = getLeaveLabel(clientName);

  let body: React.ReactNode;
  if (canLeave === "last-owner") {
    // A stale page's refusal already said it in the notice.
    const isHelpShown = leave.notice !== PROFILE_COPY.lastOwnerHelp;
    body = (
      <>
        <Button
          variant="destructive"
          icon={LogOut}
          disabled
          aria-describedby={isHelpShown ? helpId : undefined}
          className={TRUNCATING_BUTTON}
        >
          <span className="truncate">{label}</span>
        </Button>
        {isHelpShown && (
          <p id={helpId} className="mt-1.5 text-[13px]/5 text-fg-2">
            {PROFILE_COPY.lastOwnerHelp}
          </p>
        )}
      </>
    );
  } else if (leave.isConfirming) {
    body = (
      <div
        role="group"
        aria-labelledby={promptId}
        onKeyDown={leave.handleConfirmKeyDown}
        className="flex animate-in flex-wrap items-center gap-2 duration-(--dur-base) ease-out fade-in-0 motion-reduce:duration-(--dur-instant)"
      >
        <p
          id={promptId}
          className="w-full text-[13px]/5 wrap-anywhere text-fg md:w-auto"
        >
          {getLeavePrompt(clientName, canLeave)}
        </p>
        <Button
          variant="destructive"
          isPending={leave.isLeaving}
          pendingLabel={PROFILE_COPY.leaving}
          onClick={leave.handleLeave}
        >
          {PROFILE_COPY.leave}
        </Button>
        <Button autoFocus disabled={leave.isLeaving} onClick={leave.handleKeep}>
          {PROFILE_COPY.keep}
        </Button>
      </div>
    );
  } else {
    body = (
      <Button
        ref={leave.leaveRef}
        variant="destructive"
        icon={LogOut}
        onClick={leave.handleStart}
        className={TRUNCATING_BUTTON}
      >
        <span className="truncate">{label}</span>
      </Button>
    );
  }

  return (
    <Panel title="Leave Client" titleRef={leave.titleRef}>
      {leave.notice && <PanelNotice>{leave.notice}</PanelNotice>}
      <div className="flex flex-col px-3 py-3">{body}</div>
    </Panel>
  );
}
