import type {
  InvitationActionError,
  InviteError,
  MemberInvitationActionError,
  MemberInviteError,
} from "@/lib/auth/invitations";
import { INVITE_EMAIL_COPY } from "@/lib/invite-email";

// The invitation actions of the Admin's Team tab and the client /team page:
// one form field names the intent, and the route's action answers with an
// outcome. Each surface's copy lives here, side by side.

export const INVITATION_INTENT_FIELD = "intent";
export const INVITATION_ID_FIELD = "invitationId";
export const INVITE_EMAIL_FIELD = "email";

export type InvitationIntent = "invite" | "resend" | "revoke";

export type RefusalCode =
  | InviteError
  | InvitationActionError
  | MemberInviteError
  | MemberInvitationActionError;

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

// What a pending row says after a resend or revoke. A refusal not listed
// in `rateLimits` means the row is no longer pending.
export type InvitationRowCopy = {
  resent: string;
  revoked: string;
  notPending: string;
  resendFailed: string;
  revokeFailed: string;
  rateLimits: Partial<Record<RefusalCode, string>>;
};

export const ADMIN_INVITATION_ROW_COPY: InvitationRowCopy = {
  resent: INVITATION_COPY.resent,
  revoked: INVITATION_COPY.revoked,
  notPending: INVITATION_COPY.notPending,
  resendFailed: INVITATION_COPY.resendFailed,
  revokeFailed: INVITATION_COPY.revokeFailed,
  rateLimits: {
    "too-many-emails": INVITATION_COPY.tooManyEmails,
    "too-many-invitations": INVITATION_COPY.tooManyInvitations,
  },
};

const MEMBER_TOO_MANY = "Too many invitations. Try again later.";

// An Owner's copy on /team: one rate-limit message for both caps.
export const MEMBER_INVITATION_COPY: InvitationRowCopy = {
  ...ADMIN_INVITATION_ROW_COPY,
  rateLimits: {
    "too-many-emails": MEMBER_TOO_MANY,
    "too-many-for-client": MEMBER_TOO_MANY,
  },
};

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

// Where the Admin's drawer shows a refused invite, and with what words.
export function getInviteFeedback(error: RefusalCode): InviteFeedback {
  return pickFeedback(error, FIELD_COPY, BANNER_COPY);
}

const MEMBER_FIELD_COPY: Partial<Record<RefusalCode, string>> = {
  "invalid-email": INVITE_EMAIL_COPY.invalid,
  ineligible: "This email can't be invited.",
  "already-member": "This person is already on your team.",
  "pending-exists": "An invitation to this email is already pending.",
};

const MEMBER_BANNER_COPY: Partial<Record<RefusalCode, string>> = {
  "too-many-emails": MEMBER_TOO_MANY,
  "too-many-for-client": MEMBER_TOO_MANY,
};

// The Owner's invite drawer. Anything else (forbidden included: a demoted
// Owner, whose page revalidates into a Member's) is the generic banner.
export function getMemberInviteFeedback(error: RefusalCode): InviteFeedback {
  return pickFeedback(error, MEMBER_FIELD_COPY, MEMBER_BANNER_COPY);
}

type CopyTable = Partial<Record<RefusalCode, string>>;

function pickFeedback(
  error: RefusalCode,
  fieldCopy: CopyTable,
  bannerCopy: CopyTable,
): InviteFeedback {
  const field = fieldCopy[error];
  const banner = bannerCopy[error];
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
