/**
 * R2 object helpers. Public URLs require a custom domain or worker route; use `key` with your CDN path.
 */

import { eq } from "drizzle-orm";
import { fileUploads } from "@/db/schema";
import { getConfig } from "./config";
import { createDb } from "./db";

const SIGNED_URL_TTL_SEC = 900; // 15 minutes
const UPLOAD_KV_PREFIX = "upload_raw:";

/**
 * Avatars are re-resolved on every `GET /users/me`, but the app caches the user
 * object for the whole session — a 15-minute link would 404 on a long-running
 * screen. A week outlives any realistic session without the link becoming a
 * durable public handle.
 */
export const AVATAR_URL_TTL_SEC = 60 * 60 * 24 * 7;

export async function getSignedUrl(
	env: Env,
	storageKey: string,
	ttlSeconds: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
	const config = getConfig(env);

	if (config.r2PublicBaseUrl) {
		return publicFileUrl(config.r2PublicBaseUrl, storageKey);
	}

	const sig = crypto.randomUUID();
	const db = createDb(env.DB);
	const [file] = await db
		.select({
			mimeType: fileUploads.mimeType,
		})
		.from(fileUploads)
		.where(eq(fileUploads.storageKey, storageKey))
		.limit(1);

	if (!file) return null;

	await env.CACHE_KV.put(
		`${UPLOAD_KV_PREFIX}${sig}`,
		JSON.stringify({
			storageKey,
			mimeType: file.mimeType,
		}),
		{ expirationTtl: ttlSeconds },
	);

	const base = config.baseUrl.replace(/\/$/, "");
	return `${base}/api/v1/uploads/raw/${sig}`;
}

export async function uploadFile(
	bucket: R2Bucket,
	key: string,
	data: Uint8Array,
	mimeType: string,
): Promise<void> {
	await bucket.put(key, data, {
		httpMetadata: { contentType: mimeType },
	});
}


export function publicFileUrl(basePublicUrl: string, key: string): string {
	const base = basePublicUrl.replace(/\/$/, "");
	return `${base}/${encodeURI(key)}`;
}

export async function deleteFile(bucket: R2Bucket, key: string): Promise<void> {
	await bucket.delete(key);
}

export async function getObject(
	bucket: R2Bucket,
	key: string,
): Promise<R2ObjectBody | null> {
	const obj = await bucket.get(key);
	return obj;
}
