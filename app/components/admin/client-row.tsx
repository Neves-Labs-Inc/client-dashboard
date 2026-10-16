import { Clock, RefreshCwOff } from "lucide-react";
import { Link } from "react-router";
import { CELL_CLASS, ROW_GRID_CLASS } from "@/components/admin/clients-grid";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import type { ClientSummary } from "@/lib/auth/auth";

function OwnerText({ owner }: Pick<ClientSummary, "owner">): React.ReactNode {
  if (owner === null) return <span className="text-fg-2">No users</span>;
  if ("pending" in owner) {
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-2">
        <Clock size={12} aria-hidden="true" className="shrink-0" />
        Invitation pending
      </span>
    );
  }

  return <span className="text-fg">{owner.email}</span>;
}

type ClientRowProps = {
  client: ClientSummary;
  hasSyncProblem: boolean;
};

export default function ClientRow({
  client,
  hasSyncProblem,
}: ClientRowProps): React.ReactNode {
  const usersWord = client.userCount === 1 ? "user" : "users";

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isLink>
      <DataTableCell className={CELL_CLASS.name}>
        <Link
          to={`/admin/clients/${client.id}/team`}
          className="line-clamp-2 text-sm/5 font-semibold break-words text-fg outline-hidden after:absolute after:inset-0"
        >
          {client.name}
        </Link>
        {/* Also the only place the flag shows at 375px: the mobile top bar has
            no Client list. */}
        {hasSyncProblem && (
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px]/5 text-fg-2">
            <RefreshCwOff
              size={16}
              aria-hidden="true"
              className="shrink-0 text-fg-2"
            />
            Sync problem
          </p>
        )}
      </DataTableCell>
      <DataTableCell
        className={`${CELL_CLASS.owner} text-[13px]/5 wrap-anywhere`}
      >
        <OwnerText owner={client.owner} />
      </DataTableCell>
      <DataTableCell
        align="end"
        className={`${CELL_CLASS.users} text-[13px]/5 text-fg`}
      >
        <span className="font-medium md:font-normal">{client.userCount}</span>
        <span className="font-sans text-fg-2 md:hidden"> {usersWord}</span>
      </DataTableCell>
      <DataTableCell
        className={`${CELL_CLASS.created} font-mono text-xs/4 text-fg-2 md:text-[13px]/5`}
      >
        <span className="md:hidden">Created </span>
        <DateText date={client.createdAt} />
      </DataTableCell>
    </DataTableRow>
  );
}
