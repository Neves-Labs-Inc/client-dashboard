import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

type PanelProps = {
  title: string;
  titleHref?: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
  // Makes the h2 a programmatic focus target (tabIndex -1), for a panel
  // that takes focus after its trigger goes away.
  titleRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
};

export default function Panel({
  title,
  titleHref,
  meta,
  action,
  id,
  className,
  titleRef,
  children,
}: PanelProps): React.ReactNode {
  const headingId = useId();

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 scroll-mt-4 rounded-[3px] border border-line bg-surface",
        className,
      )}
    >
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-3 py-2">
        <h2
          ref={titleRef}
          id={headingId}
          tabIndex={titleRef ? -1 : undefined}
          className="text-xs/4 font-semibold tracking-[0.06em] text-fg-2 uppercase outline-hidden"
        >
          {titleHref ? (
            <Link to={titleHref} className="hover:text-fg">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {action ??
          (meta && (
            <span className="font-mono text-xs/4 text-fg-2 tabular-nums">
              {meta}
            </span>
          ))}
      </header>
      {children}
    </section>
  );
}
