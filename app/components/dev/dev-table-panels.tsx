import { Plus } from "lucide-react";
import { Link } from "react-router";
import Button from "@/components/ui/button";
import DataTable from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import DateText from "@/components/ui/date-text";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import PanelError from "@/components/ui/panel-error";
import Skeleton from "@/components/ui/skeleton";
import SkeletonGroup from "@/components/ui/skeleton-group";

const COLUMNS = [
  { header: "Name" },
  { header: "Owner" },
  { header: "Users", align: "end" as const },
  { header: "Created" },
];

// Literal strings, so Tailwind sees them.
const GRID =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_72px_120px]";
// Mobile stacks name + users over owner + created; md+ is one row.
const CELL_NAME = "col-start-1 row-start-1 md:col-auto md:row-auto";
const CELL_OWNER = "col-start-1 row-start-2 text-fg-2 md:col-auto md:row-auto";
const CELL_USERS = "col-start-2 row-start-1 md:col-auto md:row-auto";
const CELL_CREATED =
  "col-start-2 row-start-2 text-fg-2 md:col-auto md:row-auto";

type DemoClient = { name: string; owner: string | null; users: number };

const CLIENTS: DemoClient[] = [
  { name: "Acme Co", owner: "owner@acme.example", users: 3 },
  { name: "Globex", owner: "Invitation pending", users: 0 },
  { name: "Initech", owner: null, users: 0 },
  { name: "Umbrella", owner: "boss@umbrella.example", users: 12 },
];

function getDemoDates(): Date[] {
  const now = new Date();
  const previousYear = new Date(Date.UTC(now.getUTCFullYear() - 1, 5, 28, 12));
  return [now, previousYear, now, previousYear];
}

function SkeletonRow(): React.ReactNode {
  return (
    <DataTableRow gridClassName={GRID}>
      <DataTableCell className="col-start-1 row-start-1 md:col-auto md:row-auto">
        <Skeleton className="h-3 w-[55%] md:w-[45%]" />
      </DataTableCell>
      <DataTableCell className="col-start-1 row-start-2 md:col-auto md:row-auto">
        <Skeleton className="h-2.5 w-[40%] md:h-3 md:w-[60%]" />
      </DataTableCell>
      <DataTableCell
        align="end"
        className="col-start-2 row-span-3 row-start-1 self-center md:col-auto md:row-auto md:row-span-1"
      >
        <Skeleton className="ml-auto h-3 w-11 md:w-4" />
      </DataTableCell>
      <DataTableCell className="col-start-1 row-start-3 md:col-auto md:row-auto">
        <Skeleton className="h-3 w-[65%] md:h-2.5 md:w-12" />
      </DataTableCell>
    </DataTableRow>
  );
}

type DevTablePanelsProps = {
  // Bumping the tick re-applies the row highlight.
  highlightTick: number;
  onReplayHighlight: () => void;
};

export default function DevTablePanels({
  highlightTick,
  onReplayHighlight,
}: DevTablePanelsProps): React.ReactNode {
  const dates = getDemoDates();

  return (
    <>
      <Panel
        id="table-success"
        title="Table · success"
        action={<Button onClick={onReplayHighlight}>Replay highlight</Button>}
      >
        <DataTable label="Clients" columns={COLUMNS} gridClassName={GRID}>
          {CLIENTS.map((client, index) => (
            <DataTableRow
              // Remounting restarts the highlight animation.
              key={index === 0 ? `row-0-${highlightTick}` : client.name}
              gridClassName={GRID}
              isLink
              isHighlighted={index === 0 && highlightTick > 0}
            >
              <DataTableCell className={CELL_NAME}>
                <Link
                  to="#table-success"
                  className="font-medium text-fg after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {client.name}
                </Link>
              </DataTableCell>
              <DataTableCell className={CELL_OWNER}>
                <span className="block truncate">
                  {client.owner ?? "No users"}
                </span>
              </DataTableCell>
              <DataTableCell align="end" className={CELL_USERS}>
                {client.users}
              </DataTableCell>
              <DataTableCell className={CELL_CREATED}>
                <DateText date={dates[index]} />
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTable>
      </Panel>

      <Panel id="table-loading" title="Table · loading">
        <SkeletonGroup label="Clients">
          <DataTable label="Clients" columns={COLUMNS} gridClassName={GRID}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </DataTable>
        </SkeletonGroup>
      </Panel>

      <Panel id="table-empty" title="Table · empty">
        <EmptyState
          action={
            <Button icon={Plus} variant="secondary">
              New client
            </Button>
          }
        >
          No Clients yet.
        </EmptyState>
      </Panel>

      <Panel id="table-error" title="Table · error">
        <PanelError message="Couldn't load Clients." />
      </Panel>
    </>
  );
}
