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

// The trigger's avatar: one or two letters on the accent tile, or a tile of
// the shell's own (the Admin preview's).
type AvatarProps =
  | { avatarText: string; avatar?: undefined }
  | { avatar: React.ReactNode; avatarText?: undefined };

type UserMenuProps = AvatarProps & {
  // "sidebar": a full-width row opening upward. "mobile": the avatar button
  // in the top bar, opening downward.
  placement: "sidebar" | "mobile";
  // The trigger's accessible name.
  triggerLabel: string;
  // The sidebar row's text, with an optional second line under it.
  triggerText: string;
  triggerSubtext?: string;
  // The MenuHeader's lines.
  header: React.ReactNode;
  // Items above the theme toggle (the client area's Profile).
  children?: React.ReactNode;
  // Replaces the separator and Sign out under the theme toggle (the Admin
  // preview's Exit preview): that menu signs no one out.
  endItem?: React.ReactNode;
};

function Avatar({ text }: { text: string }): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-[3px] bg-accent text-xs/4 font-semibold text-on-accent"
    >
      {text}
    </span>
  );
}

// The account menu every shell shares: header, the shell's own items, theme
// toggle, Sign out.
export default function UserMenu({
  placement,
  avatarText,
  avatar,
  triggerLabel,
  triggerText,
  triggerSubtext,
  header,
  children,
  endItem,
}: UserMenuProps): React.ReactNode {
  const formRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  const isSigningOut = navigation.formAction === SIGN_OUT_PATH;
  const avatarTile =
    avatarText === undefined ? avatar : <Avatar text={avatarText} />;

  const trigger =
    placement === "sidebar" ? (
      <button
        type="button"
        aria-label={triggerLabel}
        className="flex h-11 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[13px]/5 font-medium text-fg transition-[color,background-color] duration-(--dur-instant) hover:bg-surface-2 active:bg-surface-3 md:h-10 pointer-coarse:h-11"
      >
        {avatarTile}
        {triggerSubtext === undefined ? (
          <span className="min-w-0 flex-1 truncate">{triggerText}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px]/5 font-medium text-fg">
              {triggerText}
            </span>
            <span className="truncate text-xs/4 font-normal text-fg-2">
              {triggerSubtext}
            </span>
          </span>
        )}
        <ChevronUp size={14} aria-hidden="true" className="text-fg-2" />
      </button>
    ) : (
      <IconButton label={triggerLabel} size="touch">
        {avatarTile}
      </IconButton>
    );

  return (
    <>
      <Menu
        trigger={trigger}
        side={placement === "sidebar" ? "top" : "bottom"}
        align={placement === "sidebar" ? "start" : "end"}
      >
        <MenuHeader>{header}</MenuHeader>
        {children}
        <ThemeToggle isInMenu />
        {endItem ?? (
          <>
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
          </>
        )}
      </Menu>
      {endItem === undefined && (
        <Form ref={formRef} method="post" action={SIGN_OUT_PATH} hidden />
      )}
    </>
  );
}
