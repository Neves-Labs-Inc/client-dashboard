import UserMenu from "@/components/ui/user-menu";

type AdminUserMenuProps = {
  email: string;
  placement: "sidebar" | "mobile";
};

export default function AdminUserMenu({
  email,
  placement,
}: AdminUserMenuProps): React.ReactNode {
  return (
    <UserMenu
      placement={placement}
      avatarText={email.charAt(0).toUpperCase()}
      triggerLabel={`Account menu, ${email}`}
      triggerText="Admin"
      header={
        <>
          <p className="text-[13px]/5 font-semibold text-fg">Admin</p>
          <p className="text-xs/4 wrap-anywhere text-fg-2">{email}</p>
        </>
      }
    />
  );
}
