import { Link } from "react-router";
import ProfileReadOnlyRow from "@/components/client/profile-read-only-row";
import DateText from "@/components/ui/date-text";
import { ROW_LINK_HIT_AREA_CLASS } from "@/components/ui/touch-hit-area";
import { parseDateOnly } from "@/lib/format-date";
import type { InvoiceDetail } from "@/lib/invoices/invoices";

type InvoiceFactsProps = {
  // statusChangedAt is the Admin's only: the client's detail omits it.
  detail: Pick<
    InvoiceDetail,
    "issueDate" | "dueDate" | "status" | "paidDate" | "project"
  > &
    Partial<Pick<InvoiceDetail, "statusChangedAt">>;
  // Each area links the Project its own way (the client's paths, the
  // Admin's).
  getProjectHref: (projectId: string) => string;
};

// On touch the link's hit area grows to 44px without growing the row (the
// breadcrumb's technique); the neighbouring facts aren't interactive.
const PROJECT_LINK_CLASS = `${ROW_LINK_HIT_AREA_CLASS} rounded-[3px] text-accent-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;

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
      {/* Admin only: the client never gets a Void Invoice. */}
      {detail.status === "VOID" && detail.statusChangedAt !== undefined && (
        <ProfileReadOnlyRow label="Voided">
          <DateText date={detail.statusChangedAt} />
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
