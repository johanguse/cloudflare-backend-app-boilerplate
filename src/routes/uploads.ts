import { and, eq } from "drizzle-orm";
import type { Handler } from "hono";
import { Hono } from "hono";
import * as z from "zod";

import { fileUploads } from "@/db/schema/uploads";
import { getConfig } from "@/lib/config";
import { createDb } from "@/lib/db";
import {
	deleteFile,
	getObject,
	publicFileUrl,
	uploadFile,
} from "@/lib/storage";
import type { HonoEnv } from "@/lib/types";
import { requireActiveUser } from "@/middlewares/active-user";
import { requireBearerAuth } from "@/middlewares/auth";

const SIGNED_URL_TTL_SEC = 900;
const UPLOAD_KV_PREFIX = "upload_raw:";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const jsonUploadBody = z.object({
	fileBase64: z.string().min(1),
	mimeType: z.string().min(1),
	filename: z.string().optional(),
});

function decodeKeySegment(segment: string): string {
	return decodeURIComponent(segment);
}

function safeFileSegment(name: string): string {
	const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
	return base.length > 0 ? base : "file";
}

function base64ToUint8Array(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export const uploadRoutes = new Hono<HonoEnv>();

uploadRoutes.get("/raw/:sig", async (c) => {
	const sig = c.req.param("sig");
	const raw = await c.env.CACHE_KV.get(`${UPLOAD_KV_PREFIX}${sig}`);
	if (!raw) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "Invalid or expired link",
				},
			},
			404,
		);
	}

	let payload: { storageKey: string; mimeType: string };
	try {
		payload = JSON.parse(raw) as { storageKey: string; mimeType: string };
	} catch {
		return c.json(
			{
				error: {
					code: "INVALID_TOKEN",
					message: "Invalid link",
				},
			},
			400,
		);
	}

	const obj = await getObject(c.env.STORAGE, payload.storageKey);
	if (!obj) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "File not found",
				},
			},
			404,
		);
	}

	const contentType =
		payload.mimeType ||
		obj.httpMetadata?.contentType ||
		"application/octet-stream";

	return new Response(obj.body, {
		headers: {
			"Content-Type": contentType,
			"Cache-Control": "private, max-age=3600",
		},
	});
});

uploadRoutes.use("*", requireBearerAuth);
uploadRoutes.use("*", requireActiveUser);

const postUploadHandler: Handler<HonoEnv> = async (c) => {
	const userId = c.get("userId") as string;
	const contentTypeHeader = c.req.header("content-type") ?? "";

	let bytes: Uint8Array;
	let mimeType: string;
	let filename: string;

	if (contentTypeHeader.includes("multipart/form-data")) {
		const form = await c.req.formData();
		const entry = form.get("file");
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
		const file = entry as Blob;
		if (typeof file.arrayBuffer !== "function") {
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
		if (file.size > MAX_UPLOAD_BYTES) {
			return c.json(
				{
					error: {
						code: "PAYLOAD_TOO_LARGE",
						message: "File too large",
					},
				},
				413,
			);
		}
		bytes = new Uint8Array(await file.arrayBuffer());
		mimeType = file.type.length > 0 ? file.type : "application/octet-stream";
		filename =
			"name" in file &&
			typeof (file as { name?: unknown }).name === "string" &&
			(file as { name: string }).name.length > 0
				? (file as { name: string }).name
				: "upload";
	} else {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json(
				{
					error: {
						code: "VALIDATION_ERROR",
						message: "Expected multipart form or JSON body",
					},
				},
				400,
			);
		}
		const parsed = jsonUploadBody.safeParse(raw);
		if (!parsed.success) {
			throw parsed.error;
		}
		try {
			bytes = base64ToUint8Array(parsed.data.fileBase64);
		} catch {
			return c.json(
				{
					error: {
						code: "VALIDATION_ERROR",
						message: "Invalid base64 payload",
					},
				},
				400,
			);
		}
		if (bytes.byteLength > MAX_UPLOAD_BYTES) {
			return c.json(
				{
					error: {
						code: "PAYLOAD_TOO_LARGE",
						message: "File too large",
					},
				},
				413,
			);
		}
		mimeType = parsed.data.mimeType;
		filename = parsed.data.filename ?? "upload";
	}

	const db = createDb(c.env.DB);
	const id = crypto.randomUUID();
	const storageKey = `uploads/${userId}/${id}-${safeFileSegment(filename)}`;
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

	const config = getConfig(c.env);
	const url = config.r2PublicBaseUrl
		? publicFileUrl(config.r2PublicBaseUrl, storageKey)
		: null;

	return c.json({
		data: {
			key: storageKey,
			url,
			size: bytes.byteLength,
			mimeType,
		},
	});
};

uploadRoutes.post("/", postUploadHandler);
uploadRoutes.post("", postUploadHandler);

uploadRoutes.get("/:key/url", async (c) => {
	const userId = c.get("userId") as string;
	const key = decodeKeySegment(c.req.param("key"));
	const db = createDb(c.env.DB);
	const [row] = await db
		.select()
		.from(fileUploads)
		.where(and(eq(fileUploads.storageKey, key), eq(fileUploads.userId, userId)))
		.limit(1);

	if (!row) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "Upload not found",
				},
			},
			404,
		);
	}

	const config = getConfig(c.env);
	const expiresAt = new Date(
		Date.now() + SIGNED_URL_TTL_SEC * 1000,
	).toISOString();

	if (config.r2PublicBaseUrl) {
		return c.json({
			data: {
				url: publicFileUrl(config.r2PublicBaseUrl, row.storageKey),
				expiresAt,
			},
		});
	}

	const sig = crypto.randomUUID();
	await c.env.CACHE_KV.put(
		`${UPLOAD_KV_PREFIX}${sig}`,
		JSON.stringify({
			storageKey: row.storageKey,
			mimeType: row.mimeType,
		}),
		{ expirationTtl: SIGNED_URL_TTL_SEC },
	);

	const base = config.baseUrl.replace(/\/$/, "");
	const url = `${base}/api/v1/uploads/raw/${sig}`;

	return c.json({
		data: { url, expiresAt },
	});
});

uploadRoutes.delete("/:key", async (c) => {
	const userId = c.get("userId") as string;
	const key = decodeKeySegment(c.req.param("key"));
	const db = createDb(c.env.DB);

	const [row] = await db
		.select()
		.from(fileUploads)
		.where(and(eq(fileUploads.storageKey, key), eq(fileUploads.userId, userId)))
		.limit(1);

	if (!row) {
		return c.json(
			{
				error: {
					code: "NOT_FOUND",
					message: "Upload not found",
				},
			},
			404,
		);
	}

	await deleteFile(c.env.STORAGE, row.storageKey);
	await db.delete(fileUploads).where(eq(fileUploads.id, row.id));

	return c.json({ data: { ok: true as const } });
});
