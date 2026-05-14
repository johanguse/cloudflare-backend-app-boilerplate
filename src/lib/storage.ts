/**
 * R2 object helpers. Public URLs require a custom domain or worker route; use `key` with your CDN path.
 */

import { getConfig } from "./config";

const SIGNED_URL_TTL_SEC = 900; // 15 minutes
const UPLOAD_KV_PREFIX = "upload_raw:";

export async function getSignedUrl(
	env: Env,
	storageKey: string,
): Promise<string | null> {
	const config = getConfig(env);

	if (config.r2PublicBaseUrl) {
		return publicFileUrl(config.r2PublicBaseUrl, storageKey);
	}

	const sig = crypto.randomUUID();
	const [file] = await env.DB.select({
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
		{ expirationTtl: SIGNED_URL_TTL_SEC },
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
