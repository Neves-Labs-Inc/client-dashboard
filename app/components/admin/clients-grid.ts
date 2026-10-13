// Below md each row stacks: name, created and owner on the left, users on the
// right. From md up it is one line per Client.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(120px,1.4fr)_minmax(140px,1.6fr)_64px_104px]";
export const ROW_GRID_CLASS = `grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3 ${TABLE_GRID_CLASS}`;

// DOM order is Name, Owner, Users, Created (the header's order); these place
// the cells on the mobile grid and reset them at md.
export const CELL_CLASS = {
  name: "col-start-1 row-start-1 md:col-auto md:row-auto",
  created: "col-start-1 row-start-2 md:col-auto md:row-auto",
  owner: "col-start-1 row-start-3 md:col-auto md:row-auto",
  users:
    "col-start-2 row-start-1 row-span-3 self-start md:col-auto md:row-auto md:self-auto",
} as const;
