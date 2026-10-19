import { Link } from "react-router";
import ProfileReadOnlyRow from "@/components/client/profile-read-only-row";
import DateText from "@/components/ui/date-text";
import { parseDateOnly } from "@/lib/format-date";
import type { InvoiceDetail } from "@/lib/invoices/invoices";

type InvoiceFactsProps = {
  detail: Pick<
    InvoiceDetail,
    "issueDate" | "dueDate" | "status" | "paidDate" | "project"
  >;
  // Each area links the Project its own way (the client's paths, the
  // Admin's).
  getProjectHref: (projectId: string) => string;
};

// On touch the link's hit area grows to 44px without growing the row (the
// breadcrumb's technique); the neighbouring facts aren't interactive.
const PROJECT_LINK_CLASS =
  "relative rounded-[3px] text-accent-fg after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:after:hidden pointer-coarse:after:block";

// An Invoice's Details: its dates (calendar days, never shifted), and its
// Project. "Paid" shows only on a Paid Invoice.
export default function InvoiceFacts({
  detail,
  getProjectHref,
}: InvoiceFactsProps): React.ReactNode {
  return (
    <dl className="divide-y divide-line">
      <ProfileReadOnlyRow label="Issued">
        <DateText date={parseDateOnly(detail.issueDate)} />
      </ProfileReadOnlyRow>
      <ProfileReadOnlyRow label="Due">
        <DateText date={parseDateOnly(detail.dueDate)} />
      </ProfileReadOnlyRow>
      {detail.status === "PAID" && detail.paidDate !== null && (
        <ProfileReadOnlyRow label="Paid">
          <DateText date={parseDateOnly(detail.paidDate)} />
        </ProfileReadOnlyRow>
      )}
      <ProfileReadOnlyRow label="Project">
        {detail.project === null ? (
          <span className="text-fg-2">No specific project</span>
        ) : (
          <Link
            to={getProjectHref(detail.project.id)}
            className={PROJECT_LINK_CLASS}
          >
            {detail.project.name}
          </Link>
        )}
      </ProfileReadOnlyRow>
    </dl>
  );
}
