import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRole = pgEnum("user_role", ["user", "moderator", "admin"]);
export const accountStatus = pgEnum("account_status", ["active", "suspended", "closed"]);
export const competitionStatus = pgEnum("competition_status", ["draft", "open", "judging", "closed"]);
export const submissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected", "needs_review"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 60 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").default("user").notNull(),
    status: accountStatus("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_id_idx").on(table.userId)],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    objectKey: varchar("object_key", { length: 240 }).notNull(),
    contentType: varchar("content_type", { length: 32 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("media_assets_object_key_unique").on(table.objectKey),
    index("media_assets_user_created_idx").on(table.userId, table.createdAt),
    check("media_assets_image_type_check", sql`${table.contentType} IN ('image/jpeg','image/png','image/webp')`),
    check("media_assets_size_check", sql`${table.byteSize} BETWEEN 1 AND 5242880`),
  ],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 100 }).notNull(),
    recipientName: varchar("recipient_name", { length: 80 }).notNull().default(""),
    message: varchar("message", { length: 1800 }).notNull(),
    theme: varchar("theme", { length: 32 }).notNull().default("letter"),
    animation: varchar("animation", { length: 32 }).notNull().default("fade"),
    mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    published: boolean("published").default(false).notNull(),
    shareToken: varchar("share_token", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("cards_user_id_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("cards_share_token_unique").on(table.shareToken),
  ],
);

export const experiences = pgTable(
  "experiences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 100 }).notNull(),
    recipientName: varchar("recipient_name", { length: 80 }).notNull(),
    memory: varchar("memory", { length: 900 }).notNull(),
    note: varchar("note", { length: 900 }).notNull(),
    reveal: varchar("reveal", { length: 500 }).notNull(),
    theme: varchar("theme", { length: 32 }).notNull().default("petal"),
    published: boolean("published").default(false).notNull(),
    shareToken: varchar("share_token", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("experiences_user_id_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("experiences_share_token_unique").on(table.shareToken),
  ],
);

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    description: varchar("description", { length: 1200 }).notNull(),
    rules: jsonb("rules").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    criteria: jsonb("criteria").$type<{ name: string; description: string; weight: number }[]>().notNull().default(sql`'[]'::jsonb`),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: competitionStatus("status").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("competitions_slug_unique").on(table.slug), index("competitions_status_ends_idx").on(table.status, table.endsAt)],
);

export const competitionEntries = pgTable(
  "competition_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 90 }).notNull(),
    story: varchar("story", { length: 2400 }).notNull(),
    relationship: varchar("relationship", { length: 60 }).notNull(),
    eligibilityAttested: boolean("eligibility_attested").notNull(),
    status: submissionStatus("status").default("pending").notNull(),
    moderationNote: varchar("moderation_note", { length: 500 }),
    submittedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("competition_entries_one_per_user_unique").on(table.competitionId, table.userId),
    index("competition_entries_status_date_idx").on(table.competitionId, table.status, table.submittedAt),
  ],
);

export const coinAccounts = pgTable(
  "coin_accounts",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").default(0).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [check("coin_accounts_balance_nonnegative", sql`${table.balance} >= 0`)],
);

export const coinLedger = pgTable(
  "coin_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    activityKey: varchar("activity_key", { length: 100 }).notNull(),
    description: varchar("description", { length: 180 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("coin_ledger_user_activity_unique").on(table.userId, table.activityKey),
    index("coin_ledger_user_created_idx").on(table.userId, table.createdAt),
    check("coin_ledger_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 120 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 120 }),
    stripePriceId: varchar("stripe_price_id", { length: 120 }),
    status: varchar("status", { length: 24 }).default("inactive").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscriptions_user_unique").on(table.userId),
    uniqueIndex("subscriptions_stripe_id_unique").on(table.stripeSubscriptionId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 24 }).notNull(),
    targetId: uuid("target_id").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: varchar("status", { length: 24 }).default("open").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("reports_status_created_idx").on(table.status, table.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: varchar("target_id", { length: 120 }),
    details: jsonb("details").$type<Record<string, string | number | boolean | null>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [index("audit_logs_created_idx").on(table.createdAt), index("audit_logs_actor_idx").on(table.actorId)],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: varchar("key", { length: 160 }).primaryKey(),
    hits: integer("hits").default(1).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rate_limit_window_idx").on(table.windowStartedAt)],
);
