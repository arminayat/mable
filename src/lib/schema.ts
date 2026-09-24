import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
}, (table) => [uniqueIndex("account_provider_account").on(table.providerId, table.accountId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export type RuleActions = { label?: string; star?: true; read?: true; archive?: true };
export type RunScope = "new" | "recent" | "all";
export type RunStatus = "queued" | "running" | "complete" | "failed" | "cancelled" | "paused";
export type RuleSnapshot = { id: string; question: string; actions: RuleActions };

export const settings = pgTable("settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  keyCipher: text("key_cipher"),
  threshold: integer("threshold").notNull().default(90),
  schedule: text("schedule").notNull().default("off"),
  nextRunAt: timestamp("next_run_at"),
  pauseReason: text("pause_reason"),
});

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  question: text("question").notNull(),
  actions: jsonb("actions").$type<RuleActions>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const mailbox = pgTable("mailbox", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  historyId: text("history_id"),
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  scope: text("scope").$type<RunScope>().notNull(),
  status: text("status").$type<RunStatus>().notNull().default("queued"),
  rulesSnapshot: jsonb("rules_snapshot").$type<RuleSnapshot[]>().notNull(),
  threshold: integer("threshold").notNull(),
  discovered: boolean("discovered").notNull().default(false),
  processed: integer("processed").notNull().default(0),
  changed: integer("changed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  error: text("error"),
  leaseUntil: timestamp("lease_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const runMessages = pgTable("run_messages", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  state: text("state").notNull().default("pending"),
  actions: jsonb("actions").$type<RuleActions>(),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at"),
}, (table) => [uniqueIndex("run_message_once").on(table.runId, table.messageId)]);

export const newMailSeen = pgTable("new_mail_seen", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.messageId] })]);
