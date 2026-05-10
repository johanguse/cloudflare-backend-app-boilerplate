import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as z from "zod";

import { apiKeys } from "@/db/schema/api-keys";
import { hashApiKeySecret } from "@/lib/api-key-hash";
import { createDb } from "@/lib/db";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";

const createKeyBody = z.object({
	name: z.string().min(1).max(128),
});

function generateApiKeySecret(env: Env): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	const label = env.ENVIRONMENT === "production" ? "live" : "test";
	return `sk_${label}_${hex}`;
}

function formatKeyRow(row: {
	id: string;
	name: string;
	keyPrefix: string;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	createdAt: Date;
}) {
	return {
		id: row.id,
		name: row.name,
		keyPrefix: row.keyPrefix,
		lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
		expiresAt: row.expiresAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
	};
}

async function readJson<T>(
	c: { req: { json: () => Promise<unknown> } },
	schema: z.ZodType<T>,
): Promise<T> {
	let raw: unknown;
	try {
		raw = await c.req.json();
	} catch {
		throw new HTTPException(400, { message: "Invalid JSON body" });
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		throw parsed.error;
	}
	return parsed.data;
}

export const apiKeyRoutes = new Hono<HonoEnv>();

apiKeyRoutes.use("*", requireBearerAuth);
apiKeyRoutes.use("*", requireActiveUser);

apiKeyRoutes.get("/", async (c) => {
	const userId = c.get("userId") as string;
	const db = createDb(c.env.DB);
	const rows = await db
		.select({
			id: apiKeys.id,
			name: apiKeys.name,
			keyPrefix: apiKeys.keyPrefix,
			lastUsedAt: apiKeys.lastUsedAt,
			expiresAt: apiKeys.expiresAt,
			createdAt: apiKeys.createdAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.userId, userId))
		.orderBy(desc(apiKeys.createdAt));

	return c.json({
		data: rows.map(formatKeyRow),
	});
});

apiKeyRoutes.post("/", async (c) => {
	const userId = c.get("userId") as string;
	const body = await readJson(c, createKeyBody);
	const db = createDb(c.env.DB);

	const fullSecret = generateApiKeySecret(c.env);
	const keyHash = await hashApiKeySecret(fullSecret);
	const keyPrefix = fullSecret.slice(0, 12);
	const id = crypto.randomUUID();
	const now = new Date();

	await db.insert(apiKeys).values({
		id,
		userId,
		name: body.name,
		keyHash,
		keyPrefix,
		lastUsedAt: null,
		expiresAt: null,
		createdAt: now,
	});

	return c.json({
		data: {
			id,
			name: body.name,
			keyPrefix,
			/** Full secret; shown once. Store it securely — only `key_hash` is kept server-side. */
			key: fullSecret,
			createdAt: now.toISOString(),
		},
	});
});

apiKeyRoutes.delete("/:id", async (c) => {
	const userId = c.get("userId") as string;
	const id = c.req.param("id");
	const db = createDb(c.env.DB);

	const removed = await db
		.delete(apiKeys)
		.where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
		.returning({ id: apiKeys.id });

	if (removed.length === 0) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "API key not found",
				},
			},
			404,
		);
	}

	return c.json({ data: { ok: true as const } });
});
