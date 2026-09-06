import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { MSG } from "@/lib/messages";
import type { HonoEnv } from "@/lib/types";

export interface RateLimitOptions {
	/** Max requests allowed per window. */
	limit: number;
	/** Window size in seconds. */
	windowSeconds: number;
	/** Namespaces the KV key so independent limiters don't collide. */
	keyPrefix: string;
	/** Identifies the caller. Defaults to `userId` (if an earlier auth middleware set it), else the client IP. */
	identify?: (c: Context<HonoEnv>) => string;
}

function defaultIdentify(c: Context<HonoEnv>): string {
	return (
		c.get("userId") ??
		c.req.header("CF-Connecting-IP") ??
		c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
		"unknown"
	);
}

/**
 * Sliding-window rate limiter backed by `CACHE_KV`.
 *
 * Approximates a sliding window from two fixed windows (current + previous),
 * weighted by how far into the current window `now` is — cheap in KV reads
 * (2 gets, 1 put) without needing a per-request sorted log. KV writes aren't
 * atomic, so concurrent requests in the same window can under-count by a
 * handful of hits; fine for abuse protection, not a hard billing limiter.
 */
export function rateLimiter(options: RateLimitOptions) {
	const {
		limit,
		windowSeconds,
		keyPrefix,
		identify = defaultIdentify,
	} = options;

	return createMiddleware<HonoEnv>(async (c, next) => {
		const id = identify(c);
		const now = Date.now() / 1000;
		const currentWindow = Math.floor(now / windowSeconds);
		const currentKey = `ratelimit:${keyPrefix}:${id}:${currentWindow}`;
		const previousKey = `ratelimit:${keyPrefix}:${id}:${currentWindow - 1}`;

		const [currentRaw, previousRaw] = await Promise.all([
			c.env.CACHE_KV.get(currentKey),
			c.env.CACHE_KV.get(previousKey),
		]);
		const currentCount = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
		const previousCount = previousRaw ? Number.parseInt(previousRaw, 10) : 0;

		const elapsedFraction = (now % windowSeconds) / windowSeconds;
		const estimated = previousCount * (1 - elapsedFraction) + currentCount;

		if (estimated >= limit) {
			const retryAfter = Math.max(
				1,
				Math.ceil(windowSeconds * (1 - elapsedFraction)),
			);
			c.header("Retry-After", String(retryAfter));
			return c.json(
				{ error: { code: "RATE_LIMITED", message: MSG.generic.rateLimited } },
				429,
			);
		}

		const writePromise = c.env.CACHE_KV.put(
			currentKey,
			String(currentCount + 1),
			{ expirationTtl: windowSeconds * 2 },
		);
		try {
			c.executionCtx.waitUntil(writePromise);
		} catch {
			await writePromise;
		}

		return next();
	});
}
