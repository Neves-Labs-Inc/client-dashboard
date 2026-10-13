import type { LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";

type MenuItemProps = {
  icon?: LucideIcon;
  onSelect?: (event: Event) => void;
  disabled?: boolean;
  isBusy?: boolean;
  children: React.ReactNode;
};

export default function MenuItem({
  icon: Icon,
  onSelect,
  disabled,
  isBusy,
  children,
}: MenuItemProps): React.ReactNode {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      aria-busy={isBusy || undefined}
      className="flex min-h-11 items-center gap-2 rounded-[2px] px-2.5 py-2 text-[13px]/5 outline-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent focus-visible:outline-solid data-disabled:text-fg-2 data-highlighted:bg-surface-2 md:min-h-8 pointer-coarse:min-h-11"
    >
      {Icon && (
        <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-2" />
      )}
      {children}
    </DropdownMenu.Item>
  );
}
