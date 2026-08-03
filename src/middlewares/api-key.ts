import { and, eq, gt, isNull, or } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { apiKeys } from "@/db/schema/api-keys";
import { user as userTable } from "@/db/schema/auth";
import { hashApiKeySecret } from "@/lib/api-key-hash";
import { createDb } from "@/lib/db";
import type { HonoEnv } from "@/lib/types";

/**
 * Requires `X-API-Key` matching a row in `api_keys` (SHA-256 of the secret).
 * Updates `last_used_at` via `waitUntil` when ExecutionContext is available.
 */
export const requireApiKeyAuth = createMiddleware<HonoEnv>(async (c, next) => {
	const raw = c.req.header("X-API-Key");
	if (!raw) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Missing X-API-Key header",
				},
			},
			401,
		);
	}

	const keyHash = await hashApiKeySecret(raw);
	const db = createDb(c.env.DB);

	const [keyRow] = await db
		.select({ id: apiKeys.id, userId: apiKeys.userId })
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.keyHash, keyHash),
				or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
			),
		)
		.limit(1);

	if (!keyRow) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Invalid or expired API key",
				},
			},
			401,
		);
	}

	const [u] = await db
		.select()
		.from(userTable)
		.where(eq(userTable.id, keyRow.userId))
		.limit(1);

	if (!u) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "API key owner not found",
				},
			},
			401,
		);
	}

	if (u.deletedAt) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Account is no longer active",
				},
			},
			401,
		);
	}

	const now = new Date();
	const touchPromise = db
		.update(apiKeys)
		.set({ lastUsedAt: now })
		.where(eq(apiKeys.id, keyRow.id));

	try {
		c.executionCtx.waitUntil(touchPromise);
	} catch {
		await touchPromise;
	}

	c.set("user", {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: u.emailVerified,
		image: u.image,
		bio: u.bio,
		company: u.company,
		jobTitle: u.jobTitle,
		phone: u.phone,
		website: u.website,
		country: u.country,
		timezone: u.timezone,
		onboardingCompleted: u.onboardingCompleted,
		onboardingStep: u.onboardingStep,
		createdAt: u.createdAt,
		updatedAt: u.updatedAt,
	});
	c.set("userId", u.id);
	c.set("authMethod", "api_key");
	return next();
});
