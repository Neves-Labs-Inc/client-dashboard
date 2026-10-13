import type {
  InvitationActionError,
  InviteError,
} from "@/lib/auth/invitations";
import { INVITE_EMAIL_COPY } from "@/lib/invite-email";

// The Team tab's invitation actions: one form field names the intent, and
// the Team route's action answers with an outcome.

export const INVITATION_INTENT_FIELD = "intent";
export const INVITATION_ID_FIELD = "invitationId";
export const INVITE_EMAIL_FIELD = "email";

export type InvitationIntent = "invite" | "resend" | "revoke";

type RefusalCode = InviteError | InvitationActionError;

export type InvitationOutcome =
  | { kind: "sent"; invitationId: string }
  | { kind: "resent" }
  | { kind: "revoked" }
  // An expected refusal, as the auth module's code.
  | { kind: "refused"; error: RefusalCode }
  // Server or network failure.
  | { kind: "failed" };

export const INVITATION_COPY = {
  sent: "Invitation sent",
  resent: "Invitation resent",
  revoked: "Invitation revoked",
  inviteFailed: "Couldn't send the invitation. Try again.",
  resendFailed: "Couldn't resend the invitation. Try again.",
  revokeFailed: "Couldn't revoke the invitation. Try again.",
  notPending: "This invitation is no longer pending.",
  tooManyEmails: "Too many emails to this address. Try again later.",
  tooManyInvitations: "Too many invitation emails right now. Try again later.",
} as const;

// Shown under the Email field.
const FIELD_COPY: Partial<Record<RefusalCode, string>> = {
  "invalid-email": INVITE_EMAIL_COPY.invalid,
  "admin-email": "This email can't be invited.",
  "other-client": "This email already belongs to a user of another Client.",
  "too-many-emails": INVITATION_COPY.tooManyEmails,
};

// Shown in the drawer's banner: not about the field (mostly a stale page).
const BANNER_COPY: Partial<Record<RefusalCode, string>> = {
  "pending-exists": "This Client already has an Owner or a pending invitation.",
  "not-first-owner":
    "This Client already has an Owner or a pending invitation.",
  "client-not-found": "This Client no longer exists.",
  "too-many-invitations": INVITATION_COPY.tooManyInvitations,
};

export type InviteFeedback =
  { target: "field"; message: string } | { target: "banner"; message: string };

// Where the drawer shows a refused invite, and with what words.
export function getInviteFeedback(error: RefusalCode): InviteFeedback {
  const field = FIELD_COPY[error];
  const banner = BANNER_COPY[error];
  let feedback: InviteFeedback = {
    target: "banner",
    message: INVITATION_COPY.inviteFailed,
  };
  if (field) {
    feedback = { target: "field", message: field };
  } else if (banner) {
    feedback = { target: "banner", message: banner };
  }
  return feedback;
}
