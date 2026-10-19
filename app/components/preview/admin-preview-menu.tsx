import { ArrowLeft, Eye } from "lucide-react";
import MenuItem from "@/components/ui/menu-item";
import MenuSeparator from "@/components/ui/menu-separator";
import UserMenu from "@/components/ui/user-menu";

type AdminPreviewMenuProps = {
  placement: "sidebar" | "mobile";
  clientName: string;
  // The Client's Projects & boards tab.
  exitHref: string;
};

// The preview's user-menu slot: no Client User to name, no Profile and no
// Sign out; the theme toggle and Exit preview.
export default function AdminPreviewMenu({
  placement,
  clientName,
  exitHref,
}: AdminPreviewMenuProps): React.ReactNode {
  return (
    <UserMenu
      placement={placement}
      avatar={<PreviewTile />}
      triggerLabel="Admin preview menu"
      triggerText="Admin preview"
      triggerSubtext="Read-only"
      header={
        <>
          <p className="text-[13px]/5 font-semibold text-fg">Admin preview</p>
          <p className="text-xs/4 wrap-anywhere text-fg-2">
            Viewing {clientName} as an Owner
          </p>
        </>
      }
      endItem={
        <>
          <MenuSeparator />
          <MenuItem icon={ArrowLeft} to={exitHref}>
            Exit preview
          </MenuItem>
        </>
      }
    />
  );
}

// Not accent-filled: accent means "act here", and it would read as an
// account's initials.
function PreviewTile(): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-[3px] border border-line-strong bg-surface-2 text-fg"
    >
      <Eye size={14} />
    </span>
  );
}
