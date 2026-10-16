// The Project table's tracks. Every track is fixed or `fr` (no subgrid), so
// the header and the rows line up from the same classes. Below md each row
// is a card; md has three columns, lg four, xl all five on one line.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[100px_minmax(0,1fr)_140px] lg:grid-cols-[100px_minmax(140px,1fr)_minmax(160px,1.6fr)_140px] xl:grid-cols-[110px_minmax(150px,1.1fr)_minmax(200px,2fr)_minmax(150px,1.2fr)_150px]";

// md:items-start overrides DataTableRow's md:items-center, so multi-line
// cells top-align.
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 md:items-start md:gap-x-3 ${TABLE_GRID_CLASS}`;

// The columns' headers. The cells that wrap under another keep their header
// for screen readers only.
export const COLUMNS = [
  { header: "Health" },
  { header: "Project" },
  { header: "Latest Status Update", className: "md:max-lg:sr-only" },
  { header: "Current Milestone" },
  { header: "Tasks", className: "md:max-xl:sr-only" },
];

// DOM order is the header's: Health, Project, Update, Milestone, Tasks.
// Base: a card (name left, badge top-right, the rest full width). From xl
// every cell is placed automatically.
export const CELL_CLASS = {
  health:
    "col-start-2 row-start-1 self-start md:col-start-1 xl:col-auto xl:row-auto",
  project: "col-start-1 row-start-1 md:col-start-2 xl:col-auto xl:row-auto",
  update:
    "col-span-full row-start-2 md:col-start-2 md:col-end-[-1] lg:col-start-3 lg:col-end-4 lg:row-start-1 xl:col-auto xl:row-auto",
  milestone:
    "col-span-full row-start-3 md:col-start-3 md:col-end-4 md:row-start-1 lg:col-start-4 lg:col-end-5 xl:col-auto xl:row-auto",
  tasks:
    "col-span-full row-start-4 md:col-start-2 md:col-end-[-1] md:row-start-3 lg:row-start-2 xl:col-auto xl:row-auto",
} as const;
