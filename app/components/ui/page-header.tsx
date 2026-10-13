import { Fragment } from "react";
import { Link } from "react-router";

type BreadcrumbItem = { label: string; href?: string };

type PageHeaderProps = {
  breadcrumb: BreadcrumbItem[];
  title: string;
  action?: React.ReactNode;
};

export default function PageHeader({
  breadcrumb,
  title,
  action,
}: PageHeaderProps): React.ReactNode {
  const lastIndex = breadcrumb.length - 1;

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap font-mono text-xs/4 text-fg-2 uppercase">
            {breadcrumb.map((item, index) => (
              <Fragment key={`${item.label}-${index}`}>
                <li aria-current={index === lastIndex ? "page" : undefined}>
                  {item.href ? (
                    <Link to={item.href} className="hover:text-fg">
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </li>
                {index < lastIndex && (
                  <li aria-hidden="true" className="whitespace-pre">
                    {" / "}
                  </li>
                )}
              </Fragment>
            ))}
          </ol>
        </nav>
        <h1 className="mt-1 text-lg/6 font-semibold text-fg">{title}</h1>
      </div>
      {action && <div className="self-start md:self-auto">{action}</div>}
    </header>
  );
}
