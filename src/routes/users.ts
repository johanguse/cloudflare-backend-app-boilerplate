import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as z from "zod";

import { user } from "@/db/schema/auth";
import { userPushDevices } from "@/db/schema/push-devices";
import { fileUploads } from "@/db/schema/uploads";
import { createAuth } from "@/lib/auth";
import { headersWithSessionBearer } from "@/lib/auth-session-from-request";
import { createDb } from "@/lib/db";
import {
	AVATAR_URL_TTL_SEC,
	deleteFile,
	getSignedUrl,
	uploadFile,
} from "@/lib/storage";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";

/** Free-text profile field: trimmed, capped, and `""` normalised to `null`. */
const profileText = (max: number) =>
	z
		.string()
		.max(max)
		.transform((v) => {
			const trimmed = v.trim();
			return trimmed.length > 0 ? trimmed : null;
		})
		.nullable()
		.optional();

const patchMeBody = z
	.object({
		name: z.string().min(1).max(120).optional(),
		avatar: z.string().nullable().optional(),
		bio: profileText(500),
		company: profileText(120),
		jobTitle: profileText(120),
		phone: profileText(40),
		website: profileText(200),
		country: profileText(80),
		timezone: profileText(64),
		onboardingCompleted: z.boolean().optional(),
		onboardingStep: z.number().int().min(0).max(100).optional(),
	})
	.refine((b) => Object.values(b).some((v) => v !== undefined), {
		message: "At least one field is required",
	});

const changePasswordBody = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8),
});

const deviceRegisterBody = z.object({
	token: z.string().min(1),
	platform: z.enum(["ios", "android"]),
});

/**
 * The client-facing user shape.
 *
 * `image` is stored either as an R2 key (uploaded avatar) or an absolute URL
 * (OAuth provider). Clients shouldn't have to tell the difference, so keys are
 * resolved to a fetchable URL here — every route that returns a user goes
 * through this function, so the app can always render `image` directly.
 */
async function publicUserRow(env: Env, row: typeof user.$inferSelect) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: row.emailVerified,
		image: await resolveAvatar(env, row.image),
		bio: row.bio,
		company: row.company,
		jobTitle: row.jobTitle,
		phone: row.phone,
		website: row.website,
		country: row.country,
		timezone: row.timezone,
		onboardingCompleted: row.onboardingCompleted,
		onboardingStep: row.onboardingStep,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

async function resolveAvatar(
	env: Env,
	image: string | null,
): Promise<string | null> {
	if (!image) return null;
	if (/^https?:\/\//i.test(image)) return image;
	return getSignedUrl(env, image, AVATAR_URL_TTL_SEC);
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
]);

function safeFileSegment(name: string): string {
	const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
	return base.length > 0 ? base : "avatar";
}

/**
 * Drop a previously uploaded avatar from R2 and `file_uploads`.
 *
 * No-ops for OAuth avatars (absolute URLs, which we don't own) and for keys
 * belonging to another user, so a forged `image` value can't delete their file.
 */
async function removeStoredAvatar(
	env: Env,
	db: ReturnType<typeof createDb>,
	userId: string,
	image: string | null,
): Promise<void> {
	if (!image || /^https?:\/\//i.test(image)) return;

	const [row] = await db
		.select({ id: fileUploads.id, storageKey: fileUploads.storageKey })
		.from(fileUploads)
		.where(
			and(eq(fileUploads.storageKey, image), eq(fileUploads.userId, userId)),
		)
		.limit(1);
	if (!row) return;

	await deleteFile(env.STORAGE, row.storageKey);
	await db.delete(fileUploads).where(eq(fileUploads.id, row.id));
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
	return c.json({ data: await publicUserRow(c.env, row) });
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
	const { avatar, ...profile } = await readJson(c, patchMeBody);
	const db = createDb(c.env.DB);
	const auth = createAuth(c.env, db);

	// `avatar` is the client-facing name for Better Auth's `image` column; the
	// remaining keys are declared as additionalFields and pass straight through.
	const updateBody: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(profile)) {
		if (value !== undefined) {
			updateBody[key] = value;
		}
	}
	if (avatar !== undefined) {
		updateBody.image = avatar;
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
	return c.json({ data: await publicUserRow(c.env, row) });
});

/**
 * Avatar upload. Accepts the same `multipart/form-data` with a `file` field
 * that `POST /uploads` does, but additionally points `user.image` at the stored
 * object and cleans up the previous one, so clients get a single round trip.
 */
userRoutes.post("/me/avatar", async (c) => {
	const userId = c.get("userId") as string;
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{ error: { code: "UNAUTHORIZED", message: "No active session" } },
			401,
		);
	}

	if (!(c.req.header("content-type") ?? "").includes("multipart/form-data")) {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: "Expected multipart/form-data",
				},
			},
			400,
		);
	}

	const entry = (await c.req.formData()).get("file");
	if (entry === null || typeof entry === "string") {
		return c.json(
			{
				error: {
					code: "VALIDATION_ERROR",
					message: 'Expected multipart field "file"',
				},
			},
			400,
		);
	}

	const file = entry as Blob & { name?: string };
	const mimeType = file.type.length > 0 ? file.type : "application/octet-stream";
	if (!AVATAR_MIME_TYPES.has(mimeType)) {
		return c.json(
			{
				error: {
					code: "UNSUPPORTED_MEDIA_TYPE",
					message: "Avatar must be a JPEG, PNG or WebP image",
				},
			},
			415,
		);
	}
	if (file.size > MAX_AVATAR_BYTES) {
		return c.json(
			{ error: { code: "PAYLOAD_TOO_LARGE", message: "Avatar too large" } },
			413,
		);
	}

	const db = createDb(c.env.DB);
	const [current] = await db
		.select({ image: user.image })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	const bytes = new Uint8Array(await file.arrayBuffer());
	const id = crypto.randomUUID();
	const storageKey = `avatars/${userId}/${id}-${safeFileSegment(file.name ?? "avatar")}`;
	await uploadFile(c.env.STORAGE, storageKey, bytes, mimeType);

	const now = new Date();
	await db.insert(fileUploads).values({
		id,
		storageKey,
		bucket: "STORAGE",
		userId,
		size: bytes.byteLength,
		mimeType,
		createdAt: now,
	});

	const auth = createAuth(c.env, db);
	await auth.api.updateUser({
		body: { image: storageKey },
		headers: headersWithSessionBearer(c.req.raw.headers, session.token),
	});

	// Best-effort: a leaked object is cheaper than failing a successful upload.
	await removeStoredAvatar(c.env, db, userId, current?.image ?? null);

	const [row] = await db
		.select()
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row) {
		return c.json(
			{ error: { code: "NOT_FOUND", message: "User not found" } },
			404,
		);
	}
	return c.json({ data: await publicUserRow(c.env, row) });
});

userRoutes.delete("/me/avatar", async (c) => {
	const userId = c.get("userId") as string;
	const session = c.get("session");
	if (!session?.token) {
		return c.json(
			{ error: { code: "UNAUTHORIZED", message: "No active session" } },
			401,
		);
	}

	const db = createDb(c.env.DB);
	const [current] = await db
		.select({ image: user.image })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	const auth = createAuth(c.env, db);
	await auth.api.updateUser({
		body: { image: null },
		headers: headersWithSessionBearer(c.req.raw.headers, session.token),
	});

	await removeStoredAvatar(c.env, db, userId, current?.image ?? null);

	return c.json({ data: { ok: true as const } });
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
