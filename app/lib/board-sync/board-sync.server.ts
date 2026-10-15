import { createBoardSync, type BoardSync } from "@/lib/board-sync/board-sync";
import { db } from "@/lib/db/db.server";
import { pmSource } from "@/lib/pm-source/pm-source.server";

// The app's one board sync. Server-only: it holds the Db and the PmSource.
export const boardSync: BoardSync = createBoardSync({
  db,
  pmSource,
  now: () => new Date(),
});
