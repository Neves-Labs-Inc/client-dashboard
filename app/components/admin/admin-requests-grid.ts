import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";

export type AdminRequestsVariant = "inbox" | "client";

// The tracks. From lg every column has its own; between md and lg the main
// column is about 500px, so Client (inbox) and Submitter stack in the
// title's column.
export const TABLE_GRID_CLASS: Record<AdminRequestsVariant, string> = {
  inbox:
    "md:grid-cols-[78px_minmax(0,2fr)_96px_96px] lg:grid-cols-[minmax(100px,1fr)_78px_minmax(160px,2.4fr)_96px_minmax(90px,1fr)_96px]",
  client:
    "md:grid-cols-[78px_minmax(0,2fr)_96px_96px] lg:grid-cols-[78px_minmax(160px,2.4fr)_96px_minmax(90px,1fr)_96px]",
};
export const ROW_GRID_CLASS = `grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-0.5 ${SUBGRID_ROW_CLASS}`;
// Headers of the cells that stack under the title until lg: out of the
// header's flow, still read by screen readers.
export const STACKED_HEADER_CLASS = "md:max-lg:sr-only";

const LG_RESET = "lg:col-auto lg:row-auto";

// DOM order is [Client], Kind, Title, Status, Submitter, Submitted (the
// header's order). Below lg: Kind | Client over Title over Submitter |
// Status, with Submitted on the last line (its own column from md).
export const CELL_CLASS = {
  inbox: {
    client: `col-start-2 row-start-1 ${LG_RESET}`,
    kind: `col-start-1 row-start-1 self-start md:self-auto ${LG_RESET}`,
    title: `col-start-2 row-start-2 ${LG_RESET}`,
    status: `col-start-3 row-start-1 self-start justify-self-end md:self-auto md:justify-self-start ${LG_RESET}`,
    submitter: `col-start-2 row-start-3 ${LG_RESET}`,
    submitted: `col-start-3 row-start-3 justify-self-end md:col-start-4 md:row-start-1 md:justify-self-start ${LG_RESET}`,
  },
  client: {
    kind: `col-start-1 row-start-1 self-start md:self-auto ${LG_RESET}`,
    title: `col-start-2 row-start-1 ${LG_RESET}`,
    status: `col-start-3 row-start-1 self-start justify-self-end md:self-auto md:justify-self-start ${LG_RESET}`,
    submitter: `col-start-2 row-start-2 ${LG_RESET}`,
    submitted: `col-start-3 row-start-2 justify-self-end md:col-start-4 md:row-start-1 md:justify-self-start ${LG_RESET}`,
  },
} as const;

// A label | value fact row, shared with the board's Sync panel.
export const FACT_ROW_CLASS =
  "grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 border-t border-line px-3 py-2 text-[13px]/5 first:border-t-0";
