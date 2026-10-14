import { Link } from "react-router";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import type { ArchivedClient } from "@/lib/auth/auth";
import { getTeamPath } from "@/lib/new-client";

// Below md the name stacks over the date; from md, one line.
export const ARCHIVED_TABLE_GRID_CLASS = "md:grid-cols-[minmax(0,1fr)_104px]";
const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)] gap-y-0.5 md:gap-3 ${ARCHIVED_TABLE_GRID_CLASS}`;

type ArchivedClientRowProps = {
  client: ArchivedClient;
};

export default function ArchivedClientRow({
  client,
}: ArchivedClientRowProps): React.ReactNode {
  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS} isLink>
      <DataTableCell>
        <Link
          to={getTeamPath(client.id)}
          className="line-clamp-2 text-sm/5 font-semibold break-words text-fg outline-hidden after:absolute after:inset-0"
        >
          {client.name}
        </Link>
      </DataTableCell>
      <DataTableCell className="font-mono text-xs/4 text-fg-2 md:text-right md:text-[13px]/5">
        <span className="md:hidden">Archived </span>
        <DateText date={client.archivedAt} />
      </DataTableCell>
    </DataTableRow>
  );
}
