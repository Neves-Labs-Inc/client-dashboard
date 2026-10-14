import type { RosterActor } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth.server";
import type { RosterIntent, RosterOutcome } from "@/lib/team-roster";

const OK = 200;

export type RosterAnswer = { outcome: RosterOutcome; status: number };

// A Team route's roster intent, run as `actor` on `clientId`'s member
// `userId`. A role someone has already set (no-change) answers as a change:
// the page revalidates into what was asked for.
export async function runRosterIntent(
  intent: RosterIntent,
  actor: RosterActor,
  clientId: string,
  userId: string,
): Promise<RosterAnswer> {
  let answer: RosterAnswer;
  if (intent === "remove") {
    const result = await auth.removeMember(actor, clientId, userId);
    answer =
      result.error === null
        ? { outcome: { kind: "removed" }, status: result.status }
        : {
            outcome: { kind: "refused", error: result.error },
            status: result.status,
          };
  } else {
    const role = intent === "make-owner" ? "owner" : "member";
    const result = await auth.changeRole(actor, clientId, userId, role);
    const isChanged = result.error === null || result.error === "no-change";
    answer = isChanged
      ? { outcome: { kind: "role-changed" }, status: OK }
      : {
          outcome: { kind: "refused", error: result.error },
          status: result.status,
        };
  }
  return answer;
}
