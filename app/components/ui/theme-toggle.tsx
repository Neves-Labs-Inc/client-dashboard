import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { useLocation } from "react-router";
import { DropdownMenu } from "radix-ui";
import Spinner from "@/components/ui/spinner";
import StatusIcon from "@/components/ui/status-icon";
import { useTheme } from "@/hooks/use-theme";
import {
  THEME_FETCHER_MODE,
  THEME_ROUTE,
  THEMES,
  type Theme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const SEGMENTS: Record<Theme, { label: string; icon: LucideIcon }> = {
  system: { label: "System", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

type ThemeToggleProps = {
  isInMenu?: boolean;
  // Forces the failure line, for the component gallery.
  hasError?: boolean;
};

export default function ThemeToggle({
  isInMenu = false,
  hasError = false,
}: ThemeToggleProps): React.ReactNode {
  const { fetcher, theme, isPending, hasFailed } = useTheme();
  const location = useLocation();
  const pendingTheme = fetcher.formData?.get("theme");
  // On failure the selection reverts: `theme` already falls back to the
  // loader value once there is no submission in flight.
  const shouldShowError = hasError || hasFailed;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // aria-disabled (not disabled) keeps keyboard focus on the segment.
    if (isPending) return;
    // React types the native event loosely; a form submit is a SubmitEvent.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    // new FormData(form, submitter) includes the clicked segment's value.
    const formData = new FormData(
      event.currentTarget,
      submitter instanceof HTMLElement ? submitter : null,
    );
    formData.append("mode", THEME_FETCHER_MODE);
    void fetcher.submit(formData, { method: "post", action: THEME_ROUTE });
  }

  const labelClass =
    "text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase";

  return (
    <div>
      {isInMenu ? (
        <DropdownMenu.Label className={cn(labelClass, "px-2.5 pt-1 pb-1.5")}>
          Theme
        </DropdownMenu.Label>
      ) : (
        <p className={cn(labelClass, "mb-1.5")}>Theme</p>
      )}
      <form
        method="post"
        action={THEME_ROUTE}
        onSubmit={handleSubmit}
        className="w-fit"
      >
        <input
          type="hidden"
          name="redirectTo"
          value={`${location.pathname}${location.search}`}
        />
        <div
          role="group"
          aria-label="Theme"
          aria-busy={isPending || undefined}
          className="grid min-w-60 grid-cols-3 gap-0.5 rounded-[3px] border border-line-input bg-bg p-0.5"
        >
          {THEMES.map((value) => {
            const { label, icon: Icon } = SEGMENTS[value];
            const isSelected = theme === value;
            const isThisPending = isPending && pendingTheme === value;
            const segment = (
              <button
                type="submit"
                name="theme"
                value={value}
                aria-disabled={isPending || undefined}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[2px] px-1 text-[13px]/5 font-medium text-fg-2 transition-[color,background-color,border-color] duration-(--dur-instant) hover:bg-surface-2 hover:text-fg focus-visible:-outline-offset-2 aria-disabled:cursor-progress md:h-7 pointer-coarse:h-11",
                  isSelected &&
                    "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-accent)]",
                )}
              >
                {isThisPending ? (
                  <Spinner />
                ) : (
                  <Icon size={14} aria-hidden="true" className="shrink-0" />
                )}
                <span className="truncate">{label}</span>
              </button>
            );

            return isInMenu ? (
              <DropdownMenu.Item
                key={value}
                asChild
                // Keeps the menu open so the change is visible, and lets the
                // arrow keys reach the segments (Radix menus block Tab).
                onSelect={(event) => event.preventDefault()}
              >
                {segment}
              </DropdownMenu.Item>
            ) : (
              <Fragment key={value}>{segment}</Fragment>
            );
          })}
        </div>
      </form>
      {shouldShowError && (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs/4 text-off"
        >
          <StatusIcon status="off" className="mt-0.5" />
          Couldn&apos;t change the theme. Try again.
        </p>
      )}
    </div>
  );
}
