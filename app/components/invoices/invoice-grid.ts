// The Invoice table's tracks. Every track is fixed or `fr` (no subgrid), so
// the header and the rows line up from the same classes. The date tracks are
// 96px, not DESIGN §9.7's 90: an other-year date ("Jun 28, 2025") needs ~94.
// Five columns don't fit beside the sidebar from md to lg (the main column is
// ~480px there), so Issued stays sr-only until lg.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(110px,1.2fr)_96px_minmax(90px,1fr)_92px] lg:grid-cols-[minmax(110px,1.2fr)_96px_96px_minmax(90px,1fr)_92px]";

// Below md each row is Number over "Due Oct 1" | Amount | Status. The Status
// track stays fixed, so every Amount ends on one edge and badges start on one.
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto_92px] gap-x-2.5 gap-y-0.5 md:gap-x-3 ${TABLE_GRID_CLASS}`;

export const COLUMNS = [
  { header: "Number" },
  { header: "Issued", className: "md:max-lg:sr-only" },
  { header: "Due" },
  { header: "Amount", align: "end" as const },
  { header: "Status" },
];

// DOM order is the header's. Below lg, Issued is sr-only; below md, Amount
// and Status span both lines. From md every cell is placed automatically.
export const CELL_CLASS = {
  number: "col-[1] row-[1] md:col-auto md:row-auto",
  issued: "sr-only lg:not-sr-only",
  due: "col-[1] row-[2] md:col-auto md:row-auto",
  amount:
    "col-[2] row-[1/span_2] self-center text-right whitespace-nowrap md:col-auto md:row-auto",
  status:
    "col-[3] row-[1/span_2] self-center justify-self-start md:col-auto md:row-auto",
} as const;
