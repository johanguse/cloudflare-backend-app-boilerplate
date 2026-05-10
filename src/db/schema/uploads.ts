import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const fileUploads = sqliteTable(
	"file_uploads",
	{
		id: text("id").primaryKey(),
		storageKey: text("storage_key").notNull(),
		bucket: text("bucket").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		size: integer("size").notNull(),
		mimeType: text("mime_type").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("idx_file_uploads_user").on(t.userId),
		index("idx_file_uploads_storage_key").on(t.storageKey),
	],
);
