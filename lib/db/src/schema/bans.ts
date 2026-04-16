import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bansTable = pgTable("bans", {
  id: serial("id").primaryKey(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBanSchema = createInsertSchema(bansTable).omit({ id: true, createdAt: true });
export type InsertBan = z.infer<typeof insertBanSchema>;
export type Ban = typeof bansTable.$inferSelect;
