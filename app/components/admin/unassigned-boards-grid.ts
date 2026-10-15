// Below md each row stacks: title (with the Closed badge on the right),
// "#n · Updated <date>", then Link. From md up it is one line per board.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(160px,1fr)_88px_104px_64px]";
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3 ${TABLE_GRID_CLASS}`;

// DOM order is Board, State, Updated, Actions (the header's order); these
// place the cells on the mobile grid and reset them at md.
export const CELL_CLASS = {
  board: "col-start-1 row-start-1 md:col-auto md:row-auto",
  state:
    "col-start-2 row-start-1 self-start md:col-auto md:row-auto md:self-auto",
  updated: "col-start-1 row-start-2 md:col-auto md:row-auto",
  actions:
    "col-start-1 row-start-3 mt-1.5 md:col-auto md:row-auto md:mt-0 md:justify-self-end",
} as const;
