import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import PageHeader from "@/components/ui/page-header";
import { buttonStyles } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils";

export type ClientRouteNotFoundProps = {
  // The breadcrumb's Client crumb; omitted when the layout's data is missing.
  clientName: string | null;
  // The section the page belongs to ("Projects"), linked to backHref.
  sectionTitle: string;
  title: string;
  backHref: string;
  backLabel: string;
};

// A 404 inside the client shell: says nothing about the id beyond "not
// found", and offers the way back.
export default function ClientRouteNotFound({
  clientName,
  sectionTitle,
  title,
  backHref,
  backLabel,
}: ClientRouteNotFoundProps): React.ReactNode {
  const back = { label: sectionTitle, href: backHref };
  const breadcrumb = clientName
    ? [{ label: clientName, isTruncated: true }, back]
    : [back];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader breadcrumb={breadcrumb} title={title} />
      <div>
        <Link
          to={backHref}
          className={cn(
            buttonStyles({ variant: "secondary" }),
            "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11",
          )}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
