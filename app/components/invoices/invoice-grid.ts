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

// The Overview panel's table: Issued stays sr-only at every width, so the
// four visible tracks fit the ~523px column at xl (448px needed).
export const COMPACT_TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(110px,1.2fr)_96px_minmax(90px,1fr)_92px]";

export const COMPACT_ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto_92px] gap-x-2.5 gap-y-0.5 md:gap-x-3 ${COMPACT_TABLE_GRID_CLASS}`;

export const COMPACT_COLUMNS = COLUMNS.map((column) =>
  column.header === "Issued" ? { ...column, className: "sr-only" } : column,
);

export const COMPACT_CELL_CLASS = { ...CELL_CLASS, issued: "sr-only" } as const;

// The Admin's global list: a Client column. From lg it has its own track
// (six fit the ~764px column at 1024); between md and lg it stacks under
// the Number, and below md it's the row's second line, Due its third.
export const CLIENT_TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(110px,1.2fr)_96px_minmax(90px,1fr)_92px] lg:grid-cols-[minmax(110px,1fr)_minmax(120px,1.4fr)_96px_96px_minmax(90px,1fr)_92px]";

export const CLIENT_ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto_92px] gap-x-2.5 gap-y-0.5 md:gap-x-3 ${CLIENT_TABLE_GRID_CLASS}`;

export const CLIENT_COLUMNS = [
  { header: "Number" },
  { header: "Client", className: "md:max-lg:sr-only" },
  { header: "Issued", className: "md:max-lg:sr-only" },
  { header: "Due" },
  { header: "Amount", align: "end" as const },
  { header: "Status" },
];

const LG_RESET = "lg:col-auto lg:row-auto";

export const CLIENT_CELL_CLASS = {
  number: `col-[1] row-[1] md:col-[1] md:row-[1] ${LG_RESET}`,
  client: `col-[1] row-[2] ${LG_RESET}`,
  issued: "sr-only lg:not-sr-only",
  due: `col-[1] row-[3] md:col-[2] md:row-[1/span_2] md:self-center ${LG_RESET}`,
  amount: `col-[2] row-[1/span_3] self-center text-right whitespace-nowrap md:col-[3] md:row-[1/span_2] ${LG_RESET}`,
  status: `col-[3] row-[1/span_3] self-center justify-self-start md:col-[4] md:row-[1/span_2] ${LG_RESET}`,
} as const;

type InvoiceColumn = { header: string; align?: "end"; className?: string };

type InvoiceGrid = {
  tableGridClass: string;
  rowGridClass: string;
  columns: InvoiceColumn[];
  cellClass: Record<keyof typeof CELL_CLASS, string>;
};

// The one grid a table, its rows and its skeleton share.
export function getInvoiceGrid({
  isCompact,
  hasClient,
}: {
  isCompact: boolean;
  hasClient: boolean;
}): InvoiceGrid {
  if (hasClient) {
    return {
      tableGridClass: CLIENT_TABLE_GRID_CLASS,
      rowGridClass: CLIENT_ROW_GRID_CLASS,
      columns: CLIENT_COLUMNS,
      cellClass: CLIENT_CELL_CLASS,
    };
  }

  return isCompact
    ? {
        tableGridClass: COMPACT_TABLE_GRID_CLASS,
        rowGridClass: COMPACT_ROW_GRID_CLASS,
        columns: COMPACT_COLUMNS,
        cellClass: COMPACT_CELL_CLASS,
      }
    : {
        tableGridClass: TABLE_GRID_CLASS,
        rowGridClass: ROW_GRID_CLASS,
        columns: COLUMNS,
        cellClass: CELL_CLASS,
      };
}
