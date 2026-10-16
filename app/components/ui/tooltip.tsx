import { Tooltip as RadixTooltip } from "radix-ui";

const OPEN_DELAY_MS = 400;
const SKIP_DELAY_MS = 300;
const SIDE_OFFSET = 8;

// Once, at the shell: hover opens after OPEN_DELAY_MS, and moving to the next
// trigger within SKIP_DELAY_MS opens it at once.
export function TooltipProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <RadixTooltip.Provider
      delayDuration={OPEN_DELAY_MS}
      skipDelayDuration={SKIP_DELAY_MS}
    >
      {children}
    </RadixTooltip.Provider>
  );
}

type TooltipProps = {
  content: React.ReactNode;
  side?: "right" | "top";
  // The trigger: a single focusable element.
  children: React.ReactElement;
};

export default function Tooltip({
  content,
  side = "top",
  children,
}: TooltipProps): React.ReactNode {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={SIDE_OFFSET}
          className="z-50 rounded-[3px] border border-line-strong bg-surface px-2 py-1 text-xs/4 text-fg shadow-[0_10px_30px_rgb(0_0_0/0.18)] duration-(--dur-base) ease-out data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-fast) data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=instant-open]:animate-in data-[state=instant-open]:fade-in-0 motion-reduce:data-[side=right]:slide-in-from-left-0 motion-reduce:data-[side=top]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:duration-(--dur-instant) motion-reduce:data-[state=delayed-open]:duration-(--dur-instant) motion-reduce:data-[state=instant-open]:duration-(--dur-instant)"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
