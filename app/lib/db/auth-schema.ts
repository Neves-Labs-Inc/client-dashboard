import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Better Auth's tables (core plus the organization, passkey and rate-limit
// plugins), in the field shapes better-auth 1.7 expects: checked against the
// CLI's generated reference (`pnpm dlx auth@1.7.7 generate`). Only the auth
// module touches them, through the system pool. No RLS, and app_tenant has no
// grants on them (see the migration).
//
// Differences from the reference, all compatible with it: ids default to
// uuidv7() (Postgres 18) and Better Auth leaves them to the database;
// timestamps carry a time zone; session.sign_in_method and the unique
// lower(name) index on organization are ours.

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamptz("created_at").defaultNow().notNull(),
  updatedAt: timestamptz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const SIGN_IN_METHODS = ["magic-link", "passkey"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

export const session = pgTable(
  "session",
  {
    id: id(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Unused (v1 spec): Client Users belong to one Client.
    activeOrganizationId: uuid("active_organization_id"),
    // Set by the auth module from the endpoint that created the session.
    signInMethod: text("sign_in_method", { enum: SIGN_IN_METHODS }).notNull(),
  },
  (table) => [
    index("session_userId_idx").on(table.userId),
    check(
      "session_sign_in_method_check",
      sql`${table.signInMethod} in ('magic-link', 'passkey')`,
    ),
  ],
);

export const account = pgTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const passkey = pgTable(
  "passkey",
  {
    id: id(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamptz("created_at"),
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    index("passkey_credentialID_idx").on(table.credentialID),
  ],
);

// One per Client, sharing its id with `clients`.
export const organization = pgTable(
  "organization",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamptz("created_at").notNull(),
    metadata: text("metadata"),
  },
  // Client names are unique case-insensitively, archived Clients included.
  (table) => [
    uniqueIndex("organization_name_lower_key").on(sql`lower(${table.name})`),
  ],
);

export const member = pgTable(
  "member",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const rateLimit = pgTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Ours, not Better Auth's: how many emails of a kind went to one address in
// the current fixed window (e.g. magic links to ADMIN_EMAIL), so rotating IPs
// can't mail-bomb it or burn the Gmail sending quota.
export const emailSendQuota = pgTable("email_send_quota", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamptz("window_started_at").notNull(),
  count: integer("count").notNull(),
});

// Every table the auth module owns (Better Auth's plus emailSendQuota), for
// grants checks and owner-side test cleanup.
export const AUTH_TABLES = [
  user,
  session,
  account,
  verification,
  passkey,
  organization,
  member,
  invitation,
  rateLimit,
  emailSendQuota,
] as const;
