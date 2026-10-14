import { cn } from "@/lib/utils";

type ProfileReadOnlyRowProps = {
  label: string;
  isMono?: boolean;
  children: React.ReactNode;
};

// One fact on the Profile page: label over value below md, two columns
// from md; the list around it draws the dividers. Not interactive. Long values (an email) wrap, never truncate.
export default function ProfileReadOnlyRow({
  label,
  isMono = false,
  children,
}: ProfileReadOnlyRowProps): React.ReactNode {
  return (
    <div className="grid grid-cols-1 gap-0.5 px-3 py-2 md:min-h-10 md:grid-cols-[160px_minmax(0,1fr)] md:items-baseline md:gap-3">
      <dt className="text-[13px]/[18px] font-semibold text-fg">{label}</dt>
      <dd
        className={cn(
          "wrap-anywhere",
          isMono ? "font-mono text-xs/4 text-fg-2" : "text-[13px]/5 text-fg",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
