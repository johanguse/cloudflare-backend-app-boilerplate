import { Hono } from "hono";

import type { HonoEnv } from "@/lib/types";

export const healthRoutes = new Hono<HonoEnv>();

healthRoutes.get("/health", (c) => {
	const payload = {
		status: "ok" as const,
		version: "0.1.0",
		timestamp: new Date().toISOString(),
		environment: c.env.ENVIRONMENT,
	};
	return c.json({ data: payload });
});

healthRoutes.get("/health/db", async (c) => {
	try {
		await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
		return c.json({
			data: {
				status: "ok" as const,
				database: "reachable" as const,
				timestamp: new Date().toISOString(),
			},
		});
	} catch {
		return c.json(
			{
				error: {
					code: "DATABASE_UNAVAILABLE",
					message: "Could not reach D1",
				},
			},
			503,
		);
	}
});
