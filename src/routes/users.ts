import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as z from "zod";

import { user } from "@/db/schema/auth";
import { userPushDevices } from "@/db/schema/push-devices";
import { createAuth } from "@/lib/auth";
import { headersWithSessionBearer } from "@/lib/auth-session-from-request";
import { createDb } from "@/lib/db";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";

const patchMeBody = z
	.object({
		name: z.string().min(1).optional(),
		avatar: z.string().nullable().optional(),
	})
	.refine((b) => b.name !== undefined || b.avatar !== undefined, {
		message: "At least one of name, avatar is required",
	});

const changePasswordBody = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8),
});

const deviceRegisterBody = z.object({
	token: z.string().min(1),
	platform: z.enum(["ios", "android"]),
});

function publicUserRow(row: typeof user.$inferSelect) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: row.emailVerified,
		image: row.image,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
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

export const userRoutes = new Hono<HonoEnv>();

userRoutes.use("*", requireBearerAuth);
userRoutes.use("*", requireActiveUser);

userRoutes.get("/me", async (c) => {
	const userId = c.get("userId") as string;
	const db = createDb(c.env.DB);
	const [row] = await db
		.select()
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row || row.deletedAt) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "User not found",
				},
			},
			404,
		);
	}
	return c.json({ data: publicUserRow(row) });
});

userRoutes.post("/me/change-password", async (c) => {
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "No active session",
				},
			},
			401,
		);
	}
	const body = await readJson(c, changePasswordBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	await auth.api.changePassword({
		body: {
			currentPassword: body.currentPassword,
			newPassword: body.newPassword,
		},
		headers: headersWithSessionBearer(c.req.raw.headers, session.token),
	});
	return c.json({
		data: {
			success: true as const,
			message: "Password updated",
		},
	});
});

userRoutes.patch("/me", async (c) => {
	const userId = c.get("userId") as string;
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "No active session",
				},
			},
			401,
		);
	}
	const body = await readJson(c, patchMeBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);

	const updateBody: { name?: string; image?: string | null } = {};
	if (body.name !== undefined) {
		updateBody.name = body.name;
	}
	if (body.avatar !== undefined) {
		updateBody.image = body.avatar;
	}

	await auth.api.updateUser({
		body: updateBody,
		headers: headersWithSessionBearer(c.req.raw.headers, session.token),
	});

	const [row] = await db
		.select()
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "User not found",
				},
			},
			404,
		);
	}
	return c.json({ data: publicUserRow(row) });
});

userRoutes.delete("/me", async (c) => {
	const userId = c.get("userId") as string;
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "No active session",
				},
			},
			401,
		);
	}
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);
	const now = new Date();

	await db.delete(userPushDevices).where(eq(userPushDevices.userId, userId));

	await db
		.update(user)
		.set({ deletedAt: now, updatedAt: now })
		.where(eq(user.id, userId));

	await auth.api.revokeSessions({
		headers: headersWithSessionBearer(c.req.raw.headers, session.token),
	});

	return c.json({ data: { ok: true as const } });
});

userRoutes.post("/me/devices", async (c) => {
	const userId = c.get("userId") as string;
	const body = await readJson(c, deviceRegisterBody);
	const db = createDb(c.env.DB);
	const now = new Date();

	const [existing] = await db
		.select({ id: userPushDevices.id })
		.from(userPushDevices)
		.where(
			and(
				eq(userPushDevices.userId, userId),
				eq(userPushDevices.token, body.token),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(userPushDevices)
			.set({ platform: body.platform, updatedAt: now })
			.where(eq(userPushDevices.id, existing.id));
		return c.json({
			data: {
				id: existing.id,
				updated: true as const,
			},
		});
	}

	const id = crypto.randomUUID();
	await db.insert(userPushDevices).values({
		id,
		userId,
		token: body.token,
		platform: body.platform,
		createdAt: now,
		updatedAt: now,
	});

	return c.json({
		data: {
			id,
			created: true as const,
		},
	});
});

userRoutes.delete("/me/devices/:token", async (c) => {
	const userId = c.get("userId") as string;
	let token: string;
	try {
		token = decodeURIComponent(c.req.param("token"));
	} catch {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Invalid device token in path",
				},
			},
			400,
		);
	}

	const db = createDb(c.env.DB);
	const removed = await db
		.delete(userPushDevices)
		.where(
			and(eq(userPushDevices.userId, userId), eq(userPushDevices.token, token)),
		)
		.returning({ id: userPushDevices.id });

	if (removed.length === 0) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "Device token not registered",
				},
			},
			404,
		);
	}

	return c.json({ data: { ok: true as const } });
});
