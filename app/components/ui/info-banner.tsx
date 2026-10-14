import { Info } from "lucide-react";

type InfoBannerProps = {
  children: React.ReactNode;
};

// A neutral notice above a form (e.g. "You left your Client."): announced
// politely, unlike FormError's alert banner.
export default function InfoBanner({
  children,
}: InfoBannerProps): React.ReactNode {
  return (
    <div
      role="status"
      className="flex animate-in items-start gap-2 rounded-[3px] border border-line-strong bg-surface-2 px-3 py-2 text-[13px]/5 text-fg duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0"
    >
      <Info
        size={16}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-fg-2"
      />
      <span>{children}</span>
    </div>
  );
}
