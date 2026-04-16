import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessionLogsTable = pgTable("session_logs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  event: varchar("event", { length: 50 }).notNull(),
  ipHashA: varchar("ip_hash_a", { length: 64 }),
  ipHashB: varchar("ip_hash_b", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SessionLog = typeof sessionLogsTable.$inferSelect;
