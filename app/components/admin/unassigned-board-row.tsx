import { Link } from "react-router";
import {
  CELL_CLASS,
  ROW_GRID_CLASS,
} from "@/components/admin/unassigned-boards-grid";
import { buttonStyles } from "@/components/ui/button-styles";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import TagBadge from "@/components/ui/tag-badge";
import type { UnassignedBoard } from "@/lib/board-sync/board-sync";
import { getLinkHref, toLinkOpenerState } from "@/lib/link-board";
import { cn } from "@/lib/utils";

type UnassignedBoardRowProps = {
  board: UnassignedBoard;
};

// Not a linking row: only the Link button acts, so hover doesn't tint it.
export default function UnassignedBoardRow({
  board,
}: UnassignedBoardRowProps): React.ReactNode {
  const number = `#${board.number}`;

  return (
    <DataTableRow gridClassName={ROW_GRID_CLASS}>
      <DataTableCell className={CELL_CLASS.board}>
        <span className="text-sm/5 font-semibold wrap-anywhere text-fg">
          {board.title}
        </span>
        <span className="ml-1.5 font-mono text-xs/4 text-fg-2 max-md:sr-only">
          {number}
        </span>
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.state}>
        {board.closed && <TagBadge>Closed</TagBadge>}
      </DataTableCell>
      <DataTableCell
        className={`${CELL_CLASS.updated} font-mono text-xs/4 text-fg-2 md:text-[13px]/5`}
      >
        {/* The number is read once, from the Board cell. */}
        <span aria-hidden="true" className="md:hidden">
          {number} ·{" "}
        </span>
        <span className="md:hidden">Updated </span>
        <DateText date={board.updatedAt} />
      </DataTableCell>
      <DataTableCell className={CELL_CLASS.actions}>
        {/* The visible "Link" starts the accessible name, so they match. */}
        <Link
          to={getLinkHref(board.nodeId)}
          state={toLinkOpenerState(board.title)}
          preventScrollReset
          aria-label={`Link ${board.title}`}
          data-board-link={board.nodeId}
          className={cn(
            buttonStyles({ variant: "secondary" }),
            "h-11 px-4 text-sm md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
          )}
        >
          Link
        </Link>
      </DataTableCell>
    </DataTableRow>
  );
}
