import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/db/db";
import { emailSendQuota } from "@/lib/db/schema";

// A cap on how many emails one key (an address) gets per fixed window. It
// protects the inbox from floods and the shared Gmail sending quota that
// magic links depend on.
export type EmailQuota = { windowMs: number; max: number };

// Counts one email against `key`'s window and says whether it may go out.
// A single upsert, so concurrent requests can't both slip under the cap.
export async function consumeEmailQuota(
  tx: Tx,
  key: string,
  now: Date,
  quota: EmailQuota,
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - quota.windowMs);
  const isWindowOver = sql`${emailSendQuota.windowStartedAt} <= ${windowStart}`;
  const [row] = await tx
    .insert(emailSendQuota)
    .values({ key, windowStartedAt: now, count: 1 })
    .onConflictDoUpdate({
      target: emailSendQuota.key,
      set: {
        windowStartedAt: sql`case when ${isWindowOver} then excluded.window_started_at else ${emailSendQuota.windowStartedAt} end`,
        count: sql`case when ${isWindowOver} then 1 else ${emailSendQuota.count} + 1 end`,
      },
    })
    .returning({ count: emailSendQuota.count });
  return row.count <= quota.max;
}
