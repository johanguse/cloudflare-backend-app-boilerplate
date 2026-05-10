import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const apiKeys = sqliteTable(
	"api_keys",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** Store a one-way hash of the secret (implementation in Phase 9). */
		keyHash: text("key_hash").notNull().unique(),
		/** First characters shown in the dashboard (not secret). */
		keyPrefix: text("key_prefix").notNull(),
		lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
		expiresAt: integer("expires_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("idx_api_keys_user").on(t.userId),
		index("idx_api_keys_key_hash").on(t.keyHash),
	],
);
