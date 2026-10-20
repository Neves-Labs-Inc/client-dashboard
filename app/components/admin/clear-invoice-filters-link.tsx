import { Link } from "react-router";
import { INVOICE_FILTER_COPY } from "@/lib/admin-invoice-filter";
import { INVOICES_PATH } from "@/lib/admin-invoices";
import { cn } from "@/lib/utils";

type ClearInvoiceFiltersLinkProps = {
  className?: string;
};

// Back to the unfiltered list (the status tab too).
export default function ClearInvoiceFiltersLink({
  className,
}: ClearInvoiceFiltersLinkProps): React.ReactNode {
  return (
    <Link
      to={INVOICES_PATH}
      preventScrollReset
      className={cn(
        "inline-flex h-11 items-center self-start rounded-[3px] text-[13px] font-medium text-accent-fg underline-offset-2 transition-[color,text-decoration-color] duration-(--dur-instant) ease-(--ease-out) hover:underline md:h-9 pointer-coarse:h-11",
        className,
      )}
    >
      {INVOICE_FILTER_COPY.clearFilters}
    </Link>
  );
}
