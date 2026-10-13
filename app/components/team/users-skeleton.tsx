import {
  ACTIONS_CELL_CLASS,
  MANAGED_TABLE_GRID_CLASS,
  MOBILE_GRID_CLASS,
  ROW_GRID_CLASS,
  TABLE_GRID_CLASS,
} from "@/components/team/member-row";
import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";
import Skeleton from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ROW_COUNT = 3;
const CELL_CLASS = "flex h-5 items-center md:col-auto md:row-auto";
const ROW_CLASS =
  "grid min-h-11 gap-3 border-t border-line px-3 py-2 first:border-t-0 md:min-h-10 md:items-center md:first:border-t pointer-coarse:min-h-11";
// As the managed table: the tracks on the table, the header and the rows
// its subgrids, so the auto actions column is sized once for all of them.
const MANAGED_ROW_GRID_CLASS = `${MOBILE_GRID_CLASS} ${SUBGRID_ROW_CLASS}`;

type UsersSkeletonProps = {
  // An Owner's or the Admin's view: each row has its two buttons.
  hasActions: boolean;
};

// The Users panel in blocks, shaped like TeamMembersPanel's rows: name over
// email with the role on the right below md (then the buttons), one line
// from md.
export default function UsersSkeleton({
  hasActions,
}: UsersSkeletonProps): React.ReactNode {
  const columns = hasActions
    ? ["name", "email", "role", "actions"]
    : ["name", "email", "role"];

  return (
    <div className="rounded-[3px] border border-line bg-surface">
      <div className="flex min-h-10 items-center border-b border-line px-3 py-2">
        <Skeleton className="h-3 w-12" />
      </div>
      <div
        className={cn(
          hasActions && ["md:grid md:gap-x-3", MANAGED_TABLE_GRID_CLASS],
        )}
      >
        {/* The table header row is sr-only below md, as in DataTable. */}
        <div
          className={cn(
            "hidden gap-3 bg-surface-2 px-3 py-1.5 md:grid",
            hasActions ? SUBGRID_ROW_CLASS : TABLE_GRID_CLASS,
          )}
        >
          {columns.map((column) => (
            <div
              key={column}
              className={cn(
                "flex h-4 items-center",
                column === "actions" && "md:max-lg:hidden",
              )}
            >
              {column !== "actions" && <Skeleton className="h-2.5 w-12" />}
            </div>
          ))}
        </div>
        <div className={cn(hasActions && `md:grid ${SUBGRID_ROW_CLASS}`)}>
          {Array.from({ length: ROW_COUNT }, (_, index) => (
            <div
              key={index}
              className={cn(
                ROW_CLASS,
                hasActions ? MANAGED_ROW_GRID_CLASS : ROW_GRID_CLASS,
              )}
            >
              <div className={cn(CELL_CLASS, "col-start-1 row-start-1")}>
                <Skeleton className="h-3 w-[45%] md:w-[60%]" />
              </div>
              <div className={cn(CELL_CLASS, "col-start-1 row-start-2")}>
                <Skeleton className="h-3 w-[65%] md:w-[70%]" />
              </div>
              <div
                className={cn(
                  CELL_CLASS,
                  "col-start-2 row-span-2 row-start-1 self-start md:self-auto",
                )}
              >
                <Skeleton className="h-3 w-12" />
              </div>
              {/* As wide as "Make Member" and "Remove", so the columns hold. */}
              {hasActions && (
                <div
                  className={cn(
                    ACTIONS_CELL_CLASS,
                    "flex gap-2 md:justify-end",
                  )}
                >
                  <Skeleton className="h-11 w-[125px] md:h-8 md:w-[106px] pointer-coarse:h-11" />
                  <Skeleton className="h-11 w-[104px] md:h-8 md:w-[88px] pointer-coarse:h-11" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
