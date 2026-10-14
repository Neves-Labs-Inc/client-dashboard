import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";

// The table's tracks: from lg an actions column, sized once for every row
// (the rows are subgrids). Between md and lg the sidebar leaves no room for
// it, so the actions take their own line under the row, right-aligned.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(150px,1fr)] lg:grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_minmax(150px,1fr)_auto]";
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3 ${SUBGRID_ROW_CLASS}`;
// The actions column's header: out of the header's flow until lg.
export const ACTIONS_HEADER_CLASS = "md:max-lg:absolute";

// DOM order is Name, State, Last synced, Actions (the header's order).
// Below md: name (with its lines) and state on row 1, "Synced …" on row 2,
// Sync now on row 3.
export const CELL_CLASS = {
  name: "col-start-1 row-start-1 md:col-auto md:row-auto",
  state:
    "col-start-2 row-start-1 self-start text-right whitespace-nowrap md:col-auto md:row-auto md:self-auto md:text-left md:whitespace-normal",
  synced: "col-start-1 row-start-2 md:col-auto md:row-auto",
  actions:
    "col-start-1 row-start-3 mt-1.5 md:col-span-full md:row-auto md:mt-0 md:flex md:justify-end lg:col-auto",
} as const;
