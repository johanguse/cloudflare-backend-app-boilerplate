import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const analyses = sqliteTable(
	"analyses",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** 'color' | 'style' | 'hair' | 'age' | 'outfit' */
		analysisType: text("analysis_type").notNull(),
		/** 'processing' | 'done' | 'failed' */
		status: text("status").notNull().default("done"),
		/** R2 storage key of the uploaded photo — never exposed directly to clients */
		photoKey: text("photo_key").notNull(),
		/** Full structured JSON result from the vision model */
		resultJson: text("result_json"),
		/** Which model was used (for debugging / cost tracking) */
		visionModel: text("vision_model"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("idx_analyses_user").on(t.userId),
		index("idx_analyses_user_created").on(t.userId, t.createdAt),
	],
);
