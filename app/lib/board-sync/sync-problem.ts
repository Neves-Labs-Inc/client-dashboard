// Pure, so client components can import it without the board-sync module.

// One daily cron run (09:00-09:59 UTC on Vercel Hobby) plus jitter: older
// than this, a run was missed.
export const SYNC_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export type SyncProblemInput = {
  unlinkedAt: Date | null;
  lastSyncError: string | null;
  lastSyncedAt: Date | null;
  clientArchived: boolean;
};

// The Admin's sync-problem flag. Unlinked boards and archived Clients' boards
// are never problems; warnings never count. A never-synced board is stale.
export function isSyncProblem(project: SyncProblemInput, now: Date): boolean {
  if (project.unlinkedAt !== null || project.clientArchived) return false;
  if (project.lastSyncError !== null) return true;
  if (project.lastSyncedAt === null) return true;

  return now.getTime() - project.lastSyncedAt.getTime() > SYNC_STALE_AFTER_MS;
}
