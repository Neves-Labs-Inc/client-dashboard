import { Fragment } from "react";
import { Link } from "react-router";

type BreadcrumbItem = {
  label: string;
  href?: string;
  // The crumb that gives way on a narrow screen (a Client name). Without
  // one, the current page's crumb truncates.
  isTruncated?: boolean;
};

type PageHeaderProps = {
  breadcrumb: BreadcrumbItem[];
  title: string;
  action?: React.ReactNode;
  // Makes the h1 a programmatic focus target (tabIndex -1), for pages that
  // move focus to their heading on arrival.
  titleRef?: React.Ref<HTMLHeadingElement>;
};

export default function PageHeader({
  breadcrumb,
  title,
  action,
  titleRef,
}: PageHeaderProps): React.ReactNode {
  const lastIndex = breadcrumb.length - 1;
  // The current page is the last crumb, unless that crumb links elsewhere.
  const isCurrent = (item: BreadcrumbItem, index: number): boolean =>
    index === lastIndex && !item.href;
  const hasTruncatedItem = breadcrumb.some((item) => item.isTruncated);
  const isTruncated = (item: BreadcrumbItem, index: number): boolean =>
    hasTruncatedItem ? Boolean(item.isTruncated) : isCurrent(item, index);

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb">
          {/* One line: a long Client name truncates. */}
          <ol className="flex min-w-0 font-mono text-xs/4 text-fg-2 uppercase">
            {breadcrumb.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                <li
                  aria-current={isCurrent(item, index) ? "page" : undefined}
                  className={
                    isTruncated(item, index) ? "min-w-0 truncate" : "shrink-0"
                  }
                >
                  {item.href ? (
                    // The 12px text keeps its look; on touch the hit area
                    // grows to 44px+, mostly downward so the sticky mobile
                    // top bar can't cover it (it overlaps only the h1).
                    <Link
                      to={item.href}
                      className="relative text-accent-fg after:absolute after:-inset-x-1 after:-top-3 after:-bottom-5 after:content-[''] hover:underline md:after:hidden pointer-coarse:after:block"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </li>
                {index < lastIndex && (
                  <li aria-hidden="true" className="shrink-0 whitespace-pre">
                    {" / "}
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </nav>
        <h1
          ref={titleRef}
          tabIndex={titleRef ? -1 : undefined}
          className="mt-1 text-lg/6 font-semibold break-words text-fg outline-hidden"
        >
          {title}
        </h1>
      </div>
      {action && <div className="self-start md:self-auto">{action}</div>}
    </header>
  );
}
