/* eslint-disable */
/**
 * Cloudflare Worker `Env` bindings.
 * Keep in sync with `wrangler.jsonc`. Regenerate with `bun run cf:typegen` (requires Node.js 22+).
 */
declare global {
	interface Env {
		DB: D1Database;
		SESSION_KV: KVNamespace;
		CACHE_KV: KVNamespace;
		STORAGE: R2Bucket;
		AI: Ai;
		EMAIL?: SendEmail;
		ENVIRONMENT: string;
		APP_NAME: string;
		BETTER_AUTH_URL: string;
		TRUSTED_ORIGINS: string;
		/** Sender address. Its domain must be onboarded to Cloudflare Email Sending. */
		FROM_EMAIL: string;
		/** Set to "true" to actually deliver email in local dev instead of logging it. */
		EMAIL_DEV_DELIVERY?: string;
		/** Min 32 chars in staging/production. Optional locally (see `getConfig`). */
		BETTER_AUTH_SECRET?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		APPLE_CLIENT_ID?: string;
		APPLE_CLIENT_SECRET?: string;
		/** Optional. When set, upload URLs use this public origin (R2 custom domain or CDN). */
		R2_PUBLIC_BASE_URL?: string;
		/** Workers AI text-generation model used by `POST /api/v1/chat/stream`. */
		AI_MODEL?: string;
		OPENROUTER_KEY?: string;
	}
}

export {};
