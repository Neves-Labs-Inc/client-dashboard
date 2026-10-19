import { Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoBannerProps = {
  children: React.ReactNode;
  icon?: LucideIcon;
  // A trailing button: under the text on mobile, at the row's end from md.
  action?: React.ReactNode;
  // The status region's accessible name.
  label?: string;
  // Off for chrome present from the first render (the preview banner), which
  // shouldn't replay its entrance on every full load.
  isAnimated?: boolean;
};

const BOX_CLASS =
  "rounded-[3px] border border-line-strong bg-surface-2 px-3 py-2 text-[13px]/5 text-fg";
// The entrance, split around the layout classes so a plain banner's class
// list reads as it always has.
const ENTER_CLASS =
  "duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0";

// A neutral notice above a form (e.g. "You left your Client."): announced
// politely, unlike FormError's alert banner.
export default function InfoBanner({
  children,
  icon: Icon = Info,
  action,
  label,
  isAnimated = true,
}: InfoBannerProps): React.ReactNode {
  const message = (
    <>
      <Icon
        size={16}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-fg-2"
      />
      <span>{children}</span>
    </>
  );

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex",
        isAnimated && "animate-in",
        action === undefined
          ? "items-start gap-2"
          : "flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4",
        BOX_CLASS,
        isAnimated && ENTER_CLASS,
      )}
    >
      {action === undefined ? (
        message
      ) : (
        <>
          {/* The text takes the squeeze, never the button. */}
          <div className="flex min-w-0 flex-1 items-start gap-2">{message}</div>
          <div className="pl-6 md:shrink-0 md:pl-0">{action}</div>
        </>
      )}
    </div>
  );
}
