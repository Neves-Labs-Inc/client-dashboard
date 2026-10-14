import { User } from "lucide-react";
import MenuItem from "@/components/ui/menu-item";
import UserMenu from "@/components/ui/user-menu";
import type { ClientAccess } from "@/lib/auth/auth";
import { getDisplayName, getInitials } from "@/lib/display-name";
import { PROFILE_PATH } from "@/lib/profile";
import { ROLE_LABEL } from "@/lib/roles";

type ClientUserMenuProps = {
  placement: "sidebar" | "mobile";
  clientName: string;
  name: string;
  email: string;
  role: ClientAccess["role"];
};

export default function ClientUserMenu({
  placement,
  clientName,
  name,
  email,
  role,
}: ClientUserMenuProps): React.ReactNode {
  const displayName = getDisplayName(name, email);
  const hasName = name.trim() !== "";

  return (
    <UserMenu
      placement={placement}
      avatarText={getInitials(name, email)}
      triggerLabel={`Account menu, ${displayName}`}
      triggerText={displayName}
      triggerSubtext={ROLE_LABEL[role]}
      header={
        <>
          <p className="text-[13px]/5 font-semibold wrap-anywhere text-fg">
            {displayName}
          </p>
          <p className="text-xs/4 wrap-anywhere text-fg-2">
            {ROLE_LABEL[role]} · {clientName}
          </p>
          {hasName && (
            <p className="text-xs/4 wrap-anywhere text-fg-2">{email}</p>
          )}
        </>
      }
    >
      <MenuItem icon={User} to={PROFILE_PATH}>
        Profile
      </MenuItem>
    </UserMenu>
  );
}
