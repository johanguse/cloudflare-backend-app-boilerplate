import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

import { getConfig, isDevelopment } from "@/lib/config";
import type { HonoEnv } from "@/lib/types";

/**
 * Dev: allow any origin. Staging/prod: `TRUSTED_ORIGINS` allowlist only.
 * Credentials disabled — mobile / API clients use Bearer or API keys, not cookies.
 */
export const corsMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
	const config = getConfig(c.env);
	const dynamic = cors({
		origin: isDevelopment(config) ? "*" : config.trustedOrigins,
		allowHeaders: ["Authorization", "Content-Type", "X-API-Key"],
		allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		exposeHeaders: ["Authorization", "Content-Type"],
		credentials: false,
		maxAge: 86400,
	});
	return dynamic(c, next);
};
