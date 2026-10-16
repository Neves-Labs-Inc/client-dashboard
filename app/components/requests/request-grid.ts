// The Request table's tracks. Every track is fixed or `fr` (no subgrid), so
// the header and the rows line up from the same classes. Below md each row
// is Kind | Title over Submitter | Status.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[70px_minmax(140px,2fr)_96px_minmax(90px,1fr)]";

// Below md the Kind track is fixed, so titles share one left edge whatever
// the word ("Bug" or "Feature"). md:items-start overrides DataTableRow's md:items-center: titles clamp at
// two lines and the other cells top-align to the first.
export const ROW_GRID_CLASS = `grid-cols-[4rem_minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:items-start md:gap-x-3 ${TABLE_GRID_CLASS}`;

export const COLUMNS = [
  { header: "Kind" },
  { header: "Title" },
  { header: "Status" },
  { header: "Submitter" },
];

// DOM order is the header's. Below md, Kind and Status span both lines; from
// md every cell is placed automatically.
export const CELL_CLASS = {
  kind: "col-[1] row-[1/span_2] self-start md:col-auto md:row-auto",
  title: "col-[2] row-[1] md:col-auto md:row-auto",
  status: "col-[3] row-[1/span_2] self-start md:col-auto md:row-auto",
  submitter: "col-[2] row-[2] mt-0.5 md:col-auto md:row-auto md:mt-0",
} as const;
