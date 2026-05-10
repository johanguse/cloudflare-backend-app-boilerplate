import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const userPushDevices = sqliteTable(
	"user_push_devices",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		platform: text("platform").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("idx_user_push_devices_user").on(t.userId),
		uniqueIndex("idx_user_push_devices_user_token").on(t.userId, t.token),
	],
);
