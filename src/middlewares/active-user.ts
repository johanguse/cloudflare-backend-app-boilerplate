import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { user } from "@/db/schema/auth";
import { createDb } from "@/lib/db";
import type { HonoEnv } from "@/lib/types";

/**
 * After `requireBearerAuth`, rejects users with `deletedAt` set (soft-deleted accounts).
 */
export const requireActiveUser = createMiddleware<HonoEnv>(async (c, next) => {
	const userId = c.get("userId");
	if (!userId) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Not authenticated",
				},
			},
			401,
		);
	}

	const db = createDb(c.env.DB);
	const [row] = await db
		.select({ deletedAt: user.deletedAt })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!row) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "User not found",
				},
			},
			401,
		);
	}

	if (row.deletedAt) {
		return c.json(
			{
				error: {
					code: "ACCOUNT_DISABLED",
					message: "Account is no longer active",
				},
			},
			401,
		);
	}

	return next();
});
