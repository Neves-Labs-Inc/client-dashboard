import { DropdownMenu } from "radix-ui";

type MenuProps = {
  trigger: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: React.ReactNode;
};

// Opens upward by default: it lives at the sidebar foot.
export default function Menu({
  trigger,
  side = "top",
  align = "start",
  children,
}: MenuProps): React.ReactNode {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={12}
          className="z-50 min-w-[200px] rounded-[3px] border border-line-strong bg-surface p-1.5 text-fg shadow-[0_10px_30px_rgb(0_0_0/0.18)] duration-(--dur-base) ease-out data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-fast) data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:data-[side=bottom]:slide-in-from-top-0 motion-reduce:data-[side=top]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:duration-(--dur-instant) motion-reduce:data-[state=open]:duration-(--dur-instant)"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
