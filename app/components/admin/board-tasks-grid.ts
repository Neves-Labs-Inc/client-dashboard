import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";

// The table's tracks. Between md and lg the main column is about 500px, so
// Status option and Milestone take a second line under the row; from lg
// every column has its own track.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(0,2fr)_128px_88px] lg:grid-cols-[minmax(160px,2fr)_128px_minmax(110px,1fr)_minmax(110px,1fr)_88px]";
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-1 ${SUBGRID_ROW_CLASS}`;
// The second-line columns' headers: out of the header's flow until lg,
// still read by screen readers.
export const SECOND_LINE_HEADER_CLASS = "md:max-lg:sr-only";

// DOM order is Title, Client status, Status option, Milestone, Target (the
// header's order). Below md: title | status, option | target, Milestone.
// md: title | status | target, then option | Milestone under them. lg: one
// line.
export const CELL_CLASS = {
  title: "col-start-1 row-start-1 lg:col-auto lg:row-auto",
  status:
    "col-start-2 row-start-1 justify-self-end md:justify-self-start lg:col-auto lg:row-auto",
  // Top-aligned with a wrapped Milestone beside it.
  option:
    "col-start-1 row-start-2 md:max-lg:self-start lg:col-auto lg:row-auto",
  milestone:
    "col-span-full row-start-3 md:col-span-2 md:col-start-2 md:row-start-2 lg:col-auto lg:row-auto",
  target:
    "col-start-2 row-start-2 text-right md:col-start-3 md:row-start-1 md:text-left lg:col-auto lg:row-auto",
} as const;
