import { createMiddleware } from "hono/factory";

import { getSessionFromHeaders } from "@/lib/auth-session-from-request";
import type { HonoEnv } from "@/lib/types";

/**
 * Requires `Authorization: Bearer <accessToken>` (JWT) or opaque session token.
 */
export const requireBearerAuth = createMiddleware<HonoEnv>(async (c, next) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Missing or invalid Authorization header",
				},
			},
			401,
		);
	}

	const session = await getSessionFromHeaders(c.env, c.req.raw.headers);

	if (!session) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Invalid or expired bearer token",
				},
			},
			401,
		);
	}

	c.set("user", session.user);
	c.set("session", session.session);
	c.set("userId", session.user.id);
	c.set("authMethod", "bearer");
	return next();
});
