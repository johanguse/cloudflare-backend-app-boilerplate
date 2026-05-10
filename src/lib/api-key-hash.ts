/**
 * Hash API key secrets the same way as `scripts/seed-local.sql` (SHA-256, lowercase hex).
 */
export async function hashApiKeySecret(secret: string): Promise<string> {
	const data = new TextEncoder().encode(secret);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
