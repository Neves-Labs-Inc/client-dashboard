import {
  FileText,
  FolderKanban,
  LayoutGrid,
  LogOut,
  ChevronsUpDown,
  Receipt,
  Users,
  Wrench,
} from "lucide-react";
import AppShell from "@/components/ui/app-shell";
import IconButton from "@/components/ui/icon-button";
import Menu from "@/components/ui/menu";
import MenuHeader from "@/components/ui/menu-header";
import MenuItem from "@/components/ui/menu-item";
import MenuSeparator from "@/components/ui/menu-separator";
import MobileTopBar from "@/components/ui/mobile-top-bar";
import NavItem from "@/components/ui/nav-item";
import Sidebar from "@/components/ui/sidebar";
import ThemeToggle from "@/components/ui/theme-toggle";

type DemoNavEntry = {
  label: string;
  hash: string;
  icon: typeof FileText;
  count?: number;
};

const NAV: DemoNavEntry[] = [
  { label: "Components", hash: "buttons", icon: LayoutGrid, count: 12 },
  { label: "Overview", hash: "table-success", icon: FileText, count: 3 },
  { label: "Projects", hash: "table-loading", icon: FolderKanban, count: 0 },
  { label: "Invoices", hash: "table-empty", icon: Receipt },
  { label: "Requests", hash: "table-error", icon: Wrench },
  { label: "Team", hash: "overlays", icon: Users },
];

const ACTIVE_LABEL = "Components";

type DevShellProps = {
  children: React.ReactNode;
};

function Brand(): React.ReactNode {
  return (
    <div className="flex flex-col">
      <span className="text-sm/5 font-semibold text-fg">Neves Labs</span>
      <span className="font-mono text-xs/4 text-fg-2 uppercase">Dev</span>
    </div>
  );
}

function Avatar(): React.ReactNode {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-[3px] bg-surface-3 text-xs/4 font-semibold text-fg">
      N
    </span>
  );
}

function UserMenuItems(): React.ReactNode {
  return (
    <>
      <MenuHeader>
        <p className="text-[13px]/5 font-semibold text-fg">Dev</p>
        <p className="text-xs/4 text-fg-2">dev@example.com</p>
      </MenuHeader>
      <ThemeToggle isInMenu />
      <MenuSeparator />
      <MenuItem icon={LogOut}>Sign out</MenuItem>
    </>
  );
}

export default function DevShell({ children }: DevShellProps): React.ReactNode {
  return (
    <AppShell
      sidebar={
        <Sidebar
          brand={<Brand />}
          footer={
            <Menu
              trigger={
                <button
                  type="button"
                  className="flex min-h-8 w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[13px]/5 text-fg transition-colors duration-(--dur-instant) hover:bg-surface-2 pointer-coarse:min-h-11"
                >
                  <Avatar />
                  <span className="min-w-0 flex-1 truncate">Dev</span>
                  <ChevronsUpDown
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-fg-2"
                  />
                </button>
              }
            >
              <UserMenuItems />
            </Menu>
          }
        >
          <ul className="flex flex-col gap-px">
            {NAV.map((item) => (
              <li key={item.label}>
                <NavItem
                  to={`/dev/components#${item.hash}`}
                  label={item.label}
                  icon={item.icon}
                  count={item.count}
                  active={item.label === ACTIVE_LABEL}
                />
              </li>
            ))}
          </ul>
        </Sidebar>
      }
      mobileTopBar={
        <MobileTopBar
          brand={<Brand />}
          action={
            <Menu
              side="bottom"
              align="end"
              trigger={
                <IconButton label="User menu" size="touch">
                  <Avatar />
                </IconButton>
              }
            >
              <UserMenuItems />
            </Menu>
          }
          nav={NAV.map((item) => (
            <NavItem
              key={item.label}
              variant="tab"
              to={`/dev/components#${item.hash}`}
              label={item.label}
              active={item.label === ACTIVE_LABEL}
            />
          ))}
        />
      }
    >
      {children}
    </AppShell>
  );
}
