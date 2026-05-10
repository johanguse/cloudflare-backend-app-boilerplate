/**
 * R2 object helpers. Public URLs require a custom domain or worker route; use `key` with your CDN path.
 */

export async function uploadFile(
	bucket: R2Bucket,
	key: string,
	body: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
	contentType: string,
): Promise<void> {
	await bucket.put(key, body, {
		httpMetadata: { contentType },
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
