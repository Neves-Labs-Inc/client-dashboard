import { ChevronUp, LogOut } from "lucide-react";
import { useRef } from "react";
import { Form, useNavigation } from "react-router";
import IconButton from "@/components/ui/icon-button";
import Menu from "@/components/ui/menu";
import MenuHeader from "@/components/ui/menu-header";
import MenuItem from "@/components/ui/menu-item";
import MenuSeparator from "@/components/ui/menu-separator";
import ThemeToggle from "@/components/ui/theme-toggle";

const SIGN_OUT_PATH = "/sign-out";

type AdminUserMenuProps = {
  email: string;
  // "sidebar": a full-width row opening upward. "mobile": the avatar button
  // in the top bar, opening downward.
  placement: "sidebar" | "mobile";
};

function Avatar({ email }: { email: string }): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-accent text-xs/4 font-semibold text-on-accent"
    >
      {email.charAt(0).toUpperCase()}
    </span>
  );
}

export default function AdminUserMenu({
  email,
  placement,
}: AdminUserMenuProps): React.ReactNode {
  const formRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  const isSigningOut = navigation.formAction === SIGN_OUT_PATH;
  const label = `Account menu, ${email}`;

  const trigger =
    placement === "sidebar" ? (
      <button
        type="button"
        aria-label={label}
        className="flex h-11 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[13px]/5 font-medium text-fg transition-[color,background-color] duration-(--dur-instant) hover:bg-surface-2 active:bg-surface-3 md:h-10 pointer-coarse:h-11"
      >
        <Avatar email={email} />
        <span className="min-w-0 flex-1 truncate">Admin</span>
        <ChevronUp size={14} aria-hidden="true" className="text-fg-2" />
      </button>
    ) : (
      <IconButton label={label} size="touch">
        <Avatar email={email} />
      </IconButton>
    );

  return (
    <>
      <Menu
        trigger={trigger}
        side={placement === "sidebar" ? "top" : "bottom"}
        align={placement === "sidebar" ? "start" : "end"}
      >
        <MenuHeader>
          <p className="text-[13px]/5 font-semibold text-fg">Admin</p>
          <p className="text-xs/4 wrap-anywhere text-fg-2">{email}</p>
        </MenuHeader>
        <ThemeToggle isInMenu />
        <MenuSeparator />
        <MenuItem
          icon={LogOut}
          disabled={isSigningOut}
          isBusy={isSigningOut}
          // Stays open so "Signing out…" shows until the redirect lands.
          onSelect={(event) => {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }}
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </MenuItem>
      </Menu>
      <Form ref={formRef} method="post" action={SIGN_OUT_PATH} hidden />
    </>
  );
}
